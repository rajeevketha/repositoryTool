const DEFAULT_METADATA_TYPES = [
  "ApexClass",
  "ApexTrigger",
  "LightningComponentBundle",
  "AuraDefinitionBundle",
  "CustomObject",
  "Flow",
  "FlexiPage",
  "Layout",
  "PermissionSet",
  "CustomLabel",
  "CustomMetadata",
  "StaticResource",
  "QuickAction",
  "LightningMessageChannel"
];

const DEFAULTS = {
  github: {
    token: "",
    owner: "",
    repo: "",
    branch: "main"
  },
  metadataTypes: DEFAULT_METADATA_TYPES,
  savedOrgs: [],
  lastSourceOrgId: "",
  lastTargetOrgId: "",
  testLevel: "NoTestRun",
  checkOnly: false,
  apiVersion: "61.0",
  packageTypes: []
};

export { DEFAULT_METADATA_TYPES, DEFAULTS };

export async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  return mergeSettings(stored.settings);
}

export async function saveSettings(partial) {
  const current = await loadSettings();
  const next = mergeSettings({ ...current, ...partial, github: { ...current.github, ...(partial.github || {}) } });
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function mergeSettings(input = {}) {
  return {
    ...DEFAULTS,
    ...input,
    github: { ...DEFAULTS.github, ...(input.github || {}) },
    metadataTypes: Array.isArray(input.metadataTypes) && input.metadataTypes.length
      ? input.metadataTypes
      : DEFAULT_METADATA_TYPES,
    savedOrgs: Array.isArray(input.savedOrgs) ? input.savedOrgs : [],
    packageTypes: Array.isArray(input.packageTypes) ? input.packageTypes : []
  };
}

export function isGithubConfigured(settings) {
  const gh = settings?.github || {};
  return Boolean(gh.token && gh.owner && gh.repo && gh.branch);
}

export function repoLabel(settings) {
  const gh = settings?.github || {};
  if (!gh.owner || !gh.repo) return "No repo connected";
  return `${gh.owner}/${gh.repo}@${gh.branch || "main"}`;
}
