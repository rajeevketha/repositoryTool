import * as github from "./github.js";
import * as gitlab from "./gitlab.js";
import * as azure from "./azureDevops.js";

export const PROVIDERS = [
  {
    id: "github",
    label: "GitHub",
    tokenName: "Personal access token",
    tokenPlaceholder: "ghp_… or github_pat_…",
    repoPlaceholder: "acme/salesforce-metadata",
    needsOrg: false,
    needsBaseUrl: false,
    connectLabel: "Connect GitHub",
    tokenUrl: "https://github.com/settings/tokens",
    steps: [
      "Open github.com/settings/tokens while signed into GitHub.",
      "Generate a token. Classic tokens need the repo scope. Fine-grained tokens need Contents: Read and write on the repo you will use.",
      "Paste the token, click Connect GitHub, pick owner/repo (or paste a github.com URL), then Use this repo."
    ]
  },
  {
    id: "gitlab",
    label: "GitLab",
    tokenName: "Personal access token",
    tokenPlaceholder: "glpat-…",
    repoPlaceholder: "acme/salesforce-metadata",
    needsOrg: false,
    needsBaseUrl: true,
    connectLabel: "Connect GitLab",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    steps: [
      "In GitLab open Preferences → Access tokens (or the token link above). On a company GitLab the same page lives under that host.",
      "Create a token with api, or at least read_repository and write_repository. Copy it (it starts with glpat-).",
      "If you use gitlab.com, leave the instance URL as https://gitlab.com. For a company GitLab, paste that host (Chrome will ask for permission).",
      "Click Connect GitLab, pick group/project (nested groups like acme/team/sf are fine), then Use this repo."
    ]
  },
  {
    id: "azuredevops",
    label: "Azure DevOps",
    tokenName: "Personal access token",
    tokenPlaceholder: "Azure DevOps PAT",
    repoPlaceholder: "myorg/MyProject/salesforce-metadata",
    needsOrg: true,
    needsBaseUrl: false,
    connectLabel: "Connect Azure DevOps",
    tokenUrl: "https://dev.azure.com",
    steps: [
      "Enter your Azure DevOps organization name (the part after dev.azure.com/), then open the token link above — or User settings → Personal access tokens.",
      "Create a token with Code: Read & write. Copy it.",
      "Paste the token, then Connect Azure DevOps.",
      "Pick org/project/repo (or paste a dev.azure.com/_git/… URL), set the branch, then Use this repo."
    ]
  }
];

export function providerMeta(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

export function tokenUrl(provider, extras = {}) {
  if (provider === "gitlab") {
    let origin = "https://gitlab.com";
    try {
      origin = new URL(String(extras.baseUrl || "https://gitlab.com").trim() || "https://gitlab.com").origin;
    } catch {
      origin = "https://gitlab.com";
    }
    return `${origin}/-/user_settings/personal_access_tokens`;
  }
  if (provider === "azuredevops") {
    const org = String(extras.owner || "").trim();
    return org
      ? `https://dev.azure.com/${encodeURIComponent(org)}/_usersSettings/tokens`
      : "https://dev.azure.com";
  }
  return providerMeta(provider).tokenUrl;
}

export function providerId(settings) {
  return settings?.gitHost?.provider || "github";
}

export function hostCreds(settings) {
  const h = settings?.gitHost || {};
  const gh = settings?.github || {};
  const provider = h.provider || "github";
  if (provider === "github") {
    return {
      provider: "github",
      token: h.token || gh.token || "",
      owner: h.owner || gh.owner || "",
      repo: h.repo || gh.repo || "",
      project: "",
      branch: h.branch || gh.branch || "main",
      baseUrl: ""
    };
  }
  return {
    provider,
    token: h.token || "",
    owner: h.owner || "",
    repo: h.repo || "",
    project: h.project || "",
    branch: h.branch || "main",
    baseUrl: h.baseUrl || ""
  };
}

export function parseRepoInput(provider, value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (provider === "azuredevops") {
    const url = raw
      .replace(/^https?:\/\/dev\.azure\.com\//i, "")
      .replace(/^https?:\/\/([^.]+)\.visualstudio\.com\//i, "$1/")
      .replace(/\/_git\//, "/")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");
    const parts = url.split("/").filter(Boolean);
    if (parts.length >= 3) return { owner: parts[0], project: parts[1], repo: parts[2] };
    if (parts.length === 2) return { owner: "", project: parts[0], repo: parts[1] };
    return null;
  }
  if (provider === "gitlab") {
    const url = raw
      .replace(/^https?:\/\/[^/]+\/+/i, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .replace(/\/-\/.*$/, "");
    const parts = url.split("/").filter(Boolean);
    if (parts.length >= 2) return { owner: parts.slice(0, -1).join("/"), repo: parts[parts.length - 1], project: "" };
    return null;
  }
  return github.parseRepoInput(raw);
}

export async function ensureHostAccess(provider, baseUrl) {
  if (provider !== "gitlab") return;
  const raw = String(baseUrl || "https://gitlab.com").trim() || "https://gitlab.com";
  let origin;
  try {
    origin = new URL(raw).origin;
  } catch {
    throw new Error("GitLab instance URL must look like https://gitlab.example.com");
  }
  if (/^https:\/\/(www\.)?gitlab\.com$/i.test(origin)) return;
  if (!chrome?.permissions?.request) return;
  const pattern = `${origin}/*`;
  const already = await chrome.permissions.contains({ origins: [pattern] });
  if (already) return;
  const ok = await chrome.permissions.request({ origins: [pattern] });
  if (!ok) throw new Error(`Chrome needs permission to reach ${origin}.`);
}

function adapter(provider) {
  if (provider === "gitlab") return gitlab;
  if (provider === "azuredevops") return azure;
  return github;
}

export async function getUser(creds) {
  if (creds.provider === "github") return github.getUser(creds.token);
  return adapter(creds.provider).getUser(creds);
}

export async function listRepos(creds) {
  if (creds.provider === "github") return github.listRepos(creds.token);
  return adapter(creds.provider).listRepos(creds);
}

export async function getFileContent(creds, path, ref) {
  if (creds.provider === "github") return github.getFileContent(creds.token, creds.owner, creds.repo, path, ref);
  return adapter(creds.provider).getFileContent(creds, path, ref);
}

export async function getRef(creds) {
  if (creds.provider === "github") return github.getRef(creds.token, creds.owner, creds.repo, creds.branch);
  return adapter(creds.provider).getRef(creds);
}

export async function commitFiles(creds) {
  if (creds.provider === "github") {
    return github.commitFiles({
      token: creds.token,
      owner: creds.owner,
      repo: creds.repo,
      branch: creds.branch,
      files: creds.files,
      message: creds.message
    });
  }
  return adapter(creds.provider).commitFiles(creds);
}

export async function fetchReleaseFiles(creds) {
  if (creds.provider === "github") {
    return github.fetchReleaseFiles({
      token: creds.token,
      owner: creds.owner,
      repo: creds.repo,
      commitSha: creds.commitSha,
      prefix: creds.prefix
    });
  }
  return adapter(creds.provider).fetchReleaseFiles(creds);
}

export function encodeUtf8Base64(text) {
  return github.encodeUtf8Base64(text);
}

export function decodeBase64(b64) {
  return github.decodeBase64(b64);
}
