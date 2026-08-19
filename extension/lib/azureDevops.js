const API_VERSION = "7.1";
const ZERO = "0000000000000000000000000000000000000000";

function headers(token) {
  return {
    Authorization: `Basic ${btoa(`:${token}`)}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

function orgRoot(creds) {
  const org = encodeURIComponent(creds.owner);
  return `https://dev.azure.com/${org}`;
}

function repoRoot(creds) {
  const org = encodeURIComponent(creds.owner);
  const project = encodeURIComponent(creds.project);
  const repo = encodeURIComponent(creds.repo);
  return `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}`;
}

async function az(url, token, options = {}) {
  const join = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${join}api-version=${API_VERSION}`, {
    ...options,
    headers: {
      ...headers(token),
      ...(options.headers || {})
    }
  });
  if (options.raw) {
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(text || `Azure DevOps ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.value?.message || data?.raw || `Azure DevOps ${res.status}`;
    const err = new Error(typeof message === "string" ? message : JSON.stringify(message));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function azurePath(path) {
  const clean = String(path || "").replace(/^\/+/, "");
  return `/${clean}`;
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
  if (!creds.owner) throw new Error("Enter your Azure DevOps organization name first.");
  const data = await az(`${orgRoot(creds)}/_apis/connectionData`, creds.token);
  const name = data?.authenticatedUser?.providerDisplayName || data?.authenticatedUser?.properties?.Account?.["$value"] || creds.owner;
  return { login: name, name, htmlUrl: `https://dev.azure.com/${creds.owner}` };
}

export async function listRepos(creds) {
  if (!creds.owner) throw new Error("Enter your Azure DevOps organization name first.");
  const data = await az(`${orgRoot(creds)}/_apis/git/repositories`, creds.token);
  return (data?.value || []).map((r) => {
    const project = r.project?.name || creds.project || "";
    const branch = String(r.defaultBranch || "refs/heads/main").replace(/^refs\/heads\//, "");
    return {
      id: r.id,
      owner: creds.owner,
      name: r.name,
      fullName: `${creds.owner}/${project}/${r.name}`,
      project,
      private: true,
      defaultBranch: branch || "main",
      htmlUrl: r.webUrl || r.remoteUrl || ""
    };
  });
}

export async function getFileContent(creds, path, ref) {
  try {
    const url = `${repoRoot(creds)}/items?path=${encodeURIComponent(azurePath(path))}&includeContent=true&versionDescriptor.version=${encodeURIComponent(ref)}&versionDescriptor.versionType=branch`;
    const data = await az(url, creds.token);
    return data?.content == null ? "" : String(data.content);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function getRef(creds) {
  try {
    const data = await az(
      `${repoRoot(creds)}/refs?filter=heads/${encodeURIComponent(creds.branch)}`,
      creds.token
    );
    const hit = (data?.value || []).find((r) => r.name === `refs/heads/${creds.branch}`) || data?.value?.[0];
    if (!hit?.objectId) return null;
    return { object: { sha: hit.objectId } };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function commitFiles(creds) {
  const files = creds.files || [];
  if (!files.length) throw new Error("Nothing to commit");
  if (!creds.project) throw new Error("Azure DevOps needs an organization, project, and repo.");
  const ref = await getRef(creds);
  const oldObjectId = ref?.object?.sha || ZERO;
  const changes = await mapPool(files, 6, async (file) => {
    const path = azurePath(file.path);
    const exists = ref ? (await getFileContent(creds, file.path.replace(/^\/+/, ""), creds.branch)) !== null : false;
    return {
      changeType: exists ? "edit" : "add",
      item: { path },
      newContent: {
        content: file.base64,
        contentType: "base64encoded"
      }
    };
  });
  const data = await az(`${repoRoot(creds)}/pushes`, creds.token, {
    method: "POST",
    body: JSON.stringify({
      refUpdates: [{ name: `refs/heads/${creds.branch}`, oldObjectId }],
      commits: [{ comment: creds.message, changes }]
    })
  });
  const sha = data?.commits?.[0]?.commitId || data?.refUpdates?.[0]?.newObjectId || "";
  return { sha, url: data?.commits?.[0]?.url || "" };
}

export async function listRootEntries(creds) {
  try {
    const data = await az(
      `${repoRoot(creds)}/items?recursionLevel=OneLevel&versionDescriptor.version=${encodeURIComponent(creds.branch || "main")}&versionDescriptor.versionType=branch`,
      creds.token
    );
    const items = data?.value || [];
    return items
      .map((item) => {
        const path = String(item.path || "").replace(/^\/+/, "");
        if (!path) return null;
        const name = path.split("/").pop();
        const isDir = item.isFolder || item.gitObjectType === "tree";
        return { name, path, type: isDir ? "dir" : "file" };
      })
      .filter(Boolean);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

export async function fetchReleaseFiles(creds) {
  const prefix = azurePath(creds.prefix || "");
  let data;
  try {
    data = await az(
      `${repoRoot(creds)}/items?scopePath=${encodeURIComponent(prefix)}&recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(creds.commitSha)}&versionDescriptor.versionType=commit`,
      creds.token
    );
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
  const items = (data?.value || []).filter((item) => item.gitObjectType === "blob" || (!item.isFolder && item.path));
  return mapPool(items, 6, async (item) => {
    const res = await az(
      `${repoRoot(creds)}/blobs/${item.objectId}?$format=octetStream`,
      creds.token,
      { raw: true, headers: { Authorization: headers(creds.token).Authorization, Accept: "*/*" } }
    );
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    buf.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    const folder = String(creds.prefix || "").replace(/^\/+|\/+$/g, "");
    const full = String(item.path || "").replace(/^\/+/, "");
    const rel = full.startsWith(`${folder}/`) ? full.slice(folder.length + 1) : full;
    return { path: rel, base64: btoa(binary) };
  });
}
