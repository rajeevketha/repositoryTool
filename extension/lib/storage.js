const DEFAULT_METADATA_TYPES = [
  "CustomField",
  "RecordType",
  "ValidationRule",
  "Layout",
  "FlexiPage",
  "Flow",
  "PermissionSet",
  "CustomLabel",
  "QuickAction",
  "CustomApplication",
  "CustomTab",
  "GlobalValueSet",
  "CustomMetadata",
  "ListView"
];

const DEFAULT_GIT_HOST = {
  provider: "github",
  token: "",
  owner: "",
  repo: "",
  project: "",
  branch: "main",
  baseUrl: ""
};

const DEFAULTS = {
  github: {
    token: "",
    owner: "",
    repo: "",
    branch: "main"
  },
  gitHost: { ...DEFAULT_GIT_HOST },
  metadataTypes: DEFAULT_METADATA_TYPES,
  savedOrgs: [],
  lastSourceOrgId: "",
  lastTargetOrgId: "",
  testLevel: "NoTestRun",
  checkOnly: false,
  useGit: false,
  specifiedTests: [],
  apiVersion: "61.0",
  packageTypes: [],
  setupComplete: false,
  lastPipelineId: "",
  objectFilter: ""
};

export { DEFAULT_METADATA_TYPES, DEFAULTS };

export async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  return mergeSettings(stored.settings);
}

export async function saveSettings(partial) {
  const current = await loadSettings();
  const next = mergeSettings({
    ...current,
    ...partial,
    github: { ...current.github, ...(partial.github || {}) },
    gitHost: { ...current.gitHost, ...(partial.gitHost || {}) }
  });
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function mergeSettings(input = {}) {
  const github = { ...DEFAULTS.github, ...(input.github || {}) };
  let gitHost = { ...DEFAULT_GIT_HOST, ...(input.gitHost || {}) };
  if (!input.gitHost && (github.token || github.owner || github.repo)) {
    gitHost = {
      ...gitHost,
      provider: "github",
      token: gitHost.token || github.token,
      owner: gitHost.owner || github.owner,
      repo: gitHost.repo || github.repo,
      branch: gitHost.branch || github.branch || "main"
    };
  }
  if ((gitHost.provider || "github") === "github") {
    github.token = gitHost.token || github.token;
    github.owner = gitHost.owner || github.owner;
    github.repo = gitHost.repo || github.repo;
    github.branch = gitHost.branch || github.branch || "main";
  }
  return {
    ...DEFAULTS,
    ...input,
    github,
    gitHost,
    metadataTypes: Array.isArray(input.metadataTypes) && input.metadataTypes.length
      ? input.metadataTypes
      : DEFAULT_METADATA_TYPES,
    savedOrgs: Array.isArray(input.savedOrgs) ? input.savedOrgs : [],
    packageTypes: Array.isArray(input.packageTypes) ? input.packageTypes : [],
    specifiedTests: Array.isArray(input.specifiedTests) ? input.specifiedTests : [],
    useGit: input.useGit === true,
    setupComplete: Boolean(input.setupComplete),
    lastPipelineId: input.lastPipelineId || ""
  };
}

export function isGitConfigured(settings) {
  const h = settings?.gitHost || {};
  const gh = settings?.github || {};
  const provider = h.provider || "github";
  const token = h.token || gh.token;
  const owner = h.owner || gh.owner;
  const repo = h.repo || gh.repo;
  const branch = h.branch || gh.branch;
  if (!token || !repo || !branch) return false;
  if (provider === "azuredevops") return Boolean(owner && h.project);
  return Boolean(owner);
}

export function isGithubConfigured(settings) {
  return isGitConfigured(settings);
}

export function repoLabel(settings) {
  const h = settings?.gitHost || {};
  const gh = settings?.github || {};
  const provider = h.provider || "github";
  const owner = h.owner || gh.owner;
  const repo = h.repo || gh.repo;
  const branch = h.branch || gh.branch || "main";
  if (!owner || !repo) return "No repo connected";
  const names = { github: "GitHub", gitlab: "GitLab", azuredevops: "Azure DevOps" };
  const host = names[provider] || provider;
  if (provider === "azuredevops" && h.project) return `${owner}/${h.project}/${repo}@${branch} (${host})`;
  return `${owner}/${repo}@${branch} (${host})`;
}
