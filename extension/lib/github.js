const API = "https://api.github.com";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function gh(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...headers(token),
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
    const message = data?.message || `GitHub ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getUser(token) {
  return gh(token, "/user");
}

export async function listRepos(token, { perPage = 100 } = {}) {
  const repos = await gh(token, `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,collaborator,organization_member`);
  return repos.map((r) => ({
    id: r.id,
    owner: r.owner?.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch || "main",
    htmlUrl: r.html_url
  }));
}

export function parseRepoInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const url = raw.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/$/, "");
  const parts = url.split("/").filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  if (raw.includes("/")) {
    const [owner, repo] = raw.split("/");
    if (owner && repo) return { owner, repo };
  }
  return null;
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

export async function getFileContent(token, owner, repo, path, ref) {
  try {
    const data = await gh(token, `/repos/${owner}/${repo}/contents/${encodeUriPath(path)}?ref=${encodeURIComponent(ref)}`);
    if (data.encoding === "base64" && data.content) {
      return decodeBase64(data.content.replace(/\n/g, ""));
    }
    return "";
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function getRef(token, owner, repo, branch) {
  try {
    return await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (err) {
    if (err.status === 404 || err.status === 409) return null;
    throw err;
  }
}

export async function commitFiles({ token, owner, repo, branch, files, message }) {
  if (!files.length) throw new Error("Nothing to commit");
  const ref = await getRef(token, owner, repo, branch);
  let parentSha = null;
  let baseTree = null;
  if (ref) {
    parentSha = ref.object.sha;
    const commit = await gh(token, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    baseTree = commit.tree.sha;
  }

  const blobs = await mapPool(files, 8, async (file) => {
    const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: file.base64,
        encoding: "base64"
      })
    });
    return {
      path: file.path.replace(/^\/+/, ""),
      mode: "100644",
      type: "blob",
      sha: blob.sha
    };
  });

  const treeBody = { tree: blobs };
  if (baseTree) treeBody.base_tree = baseTree;
  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify(treeBody)
  });

  const commitBody = {
    message,
    tree: tree.sha,
    parents: parentSha ? [parentSha] : []
  };
  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify(commitBody)
  });

  if (parentSha) {
    try {
      await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha })
      });
    } catch (err) {
      if (err.status === 422 || /fast forward/i.test(err.message || "")) {
        const latest = await getRef(token, owner, repo, branch);
        if (latest?.object?.sha && latest.object.sha !== parentSha) {
          err.retry = true;
        }
      }
      throw err;
    }
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commit.sha
      })
    });
  }

  return { sha: commit.sha, url: commit.html_url };
}

export async function listTreeFiles(token, owner, repo, commitSha, prefix) {
  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);
  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const folder = prefix.replace(/\/+$/, "");
  return (tree.tree || []).filter((item) => item.type === "blob" && item.path.startsWith(folder + "/"));
}

export async function getBlobBase64(token, owner, repo, sha) {
  const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);
  if (blob.encoding !== "base64") {
    return btoa(unescape(encodeURIComponent(blob.content || "")));
  }
  return String(blob.content || "").replace(/\n/g, "");
}

export async function fetchReleaseFiles({ token, owner, repo, commitSha, prefix }) {
  const items = await listTreeFiles(token, owner, repo, commitSha, prefix);
  const files = await mapPool(items, 8, async (item) => {
    const base64 = await getBlobBase64(token, owner, repo, item.sha);
    const rel = item.path.slice(prefix.replace(/\/+$/, "").length + 1);
    return { path: rel, base64 };
  });
  return files;
}

function encodeUriPath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}
