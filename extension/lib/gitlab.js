const DEFAULT_BASE = "https://gitlab.com";

function baseUrl(creds) {
  const raw = String(creds.baseUrl || DEFAULT_BASE).trim().replace(/\/+$/, "");
  return raw || DEFAULT_BASE;
}

function apiRoot(creds) {
  return `${baseUrl(creds)}/api/v4`;
}

function projectId(creds) {
  return encodeURIComponent(`${creds.owner}/${creds.repo}`);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
}

async function gl(creds, path, options = {}) {
  const res = await fetch(`${apiRoot(creds)}${path}`, {
    ...options,
    headers: {
      ...headers(creds.token),
      ...(options.headers || {}),
      ...(options.body && !options.headers?.["Content-Type"] ? { "Content-Type": "application/json" } : {})
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `GitLab ${res.status}`;
    const err = new Error(typeof message === "string" ? message : JSON.stringify(message));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data, headers: res.headers };
}

async function mapPool(items, limit, mapper) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await mapper(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function getUser(creds) {
  const { data } = await gl(creds, "/user");
  return { login: data.username || data.name || "GitLab user", name: data.name || "", htmlUrl: data.web_url || "" };
}

export async function listRepos(creds, { perPage = 100 } = {}) {
  const repos = [];
  let page = 1;
  while (page <= 5) {
    const { data, headers: hdrs } = await gl(
      creds,
      `/projects?membership=true&simple=true&min_access_level=30&per_page=${perPage}&page=${page}&order_by=last_activity_at`
    );
    const batch = Array.isArray(data) ? data : [];
    repos.push(
      ...batch.map((p) => {
        const full = p.path_with_namespace || `${p.namespace?.full_path || ""}/${p.path}`;
        const parts = String(full).split("/").filter(Boolean);
        const name = parts.pop() || p.path;
        const owner = parts.join("/") || p.namespace?.full_path || "";
        return {
          id: p.id,
          owner,
          name,
          fullName: full,
          private: p.visibility !== "public",
          defaultBranch: p.default_branch || "main",
          htmlUrl: p.web_url,
          project: ""
        };
      })
    );
    const next = hdrs.get("x-next-page");
    if (!next) break;
    page = Number(next) || page + 1;
  }
  return repos;
}

export async function getFileContent(creds, path, ref) {
  try {
    const { data } = await gl(
      creds,
      `/projects/${projectId(creds)}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`
    );
    if (data?.content) {
      const raw = String(data.content).replace(/\n/g, "");
      if (data.encoding === "base64") {
        const binary = atob(raw);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder("utf-8").decode(bytes);
      }
      return String(data.content);
    }
    return "";
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function getRef(creds) {
  try {
    const { data } = await gl(
      creds,
      `/projects/${projectId(creds)}/repository/branches/${encodeURIComponent(creds.branch)}`
    );
    const sha = data?.commit?.id;
    if (!sha) return null;
    return { object: { sha } };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function commitFiles(creds) {
  const files = creds.files || [];
  if (!files.length) throw new Error("Nothing to commit");
  const ref = await getRef(creds);
  const actions = await mapPool(files, 8, async (file) => {
    const path = file.path.replace(/^\/+/, "");
    const exists = ref ? (await getFileContent(creds, path, creds.branch)) !== null : false;
    return {
      action: exists ? "update" : "create",
      file_path: path,
      content: file.base64,
      encoding: "base64"
    };
  });
  const body = {
    branch: creds.branch,
    commit_message: creds.message,
    actions
  };
  const { data } = await gl(creds, `/projects/${projectId(creds)}/repository/commits`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return { sha: data.id, url: data.web_url || "" };
}

export async function listRootEntries(creds) {
  try {
    const { data } = await gl(
      creds,
      `/projects/${projectId(creds)}/repository/tree?ref=${encodeURIComponent(creds.branch || "main")}&per_page=100`
    );
    const items = Array.isArray(data) ? data : [];
    return items.map((item) => ({
      name: item.name,
      path: item.path || item.name,
      type: item.type === "tree" ? "dir" : "file"
    }));
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

export async function fetchReleaseFiles(creds) {
  const prefix = String(creds.prefix || "").replace(/\/+$/, "");
  const items = [];
  let page = 1;
  try {
    while (page <= 10) {
      const { data, headers: hdrs } = await gl(
        creds,
        `/projects/${projectId(creds)}/repository/tree?path=${encodeURIComponent(prefix)}&recursive=true&ref=${encodeURIComponent(creds.commitSha)}&per_page=100&page=${page}`
      );
      const batch = Array.isArray(data) ? data : [];
      items.push(...batch.filter((item) => item.type === "blob"));
      const next = hdrs.get("x-next-page");
      if (!next) break;
      page = Number(next) || page + 1;
    }
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
  return mapPool(items, 8, async (item) => {
    const { data } = await gl(creds, `/projects/${projectId(creds)}/repository/blobs/${item.id}`);
    const base64 = data.encoding === "base64"
      ? String(data.content || "").replace(/\n/g, "")
      : btoa(unescape(encodeURIComponent(data.content || "")));
    const rel = item.path.slice(prefix.length + 1);
    return { path: rel, base64 };
  });
}
