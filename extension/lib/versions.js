const JIRA_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;
const CHANGE_PATTERN = /^CHANGE-\d{8}-\d+$/i;

export function normalizeJiraKey(raw) {
  let value = String(raw || "").trim().toUpperCase();
  value = value.replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (JIRA_PATTERN.test(value)) return value;
  const glued = value.match(/^([A-Z]{2,})(\d+)$/);
  if (glued) {
    const next = `${glued[1]}-${glued[2]}`;
    if (JIRA_PATTERN.test(next)) return next;
  }
  return value;
}

export function isJiraKey(value) {
  return JIRA_PATTERN.test(normalizeJiraKey(value));
}

/** Live hint under the Jira field — accepts PROJ-123, proj 123, or PROJ123. */
export function jiraFieldHint(raw) {
  const typed = String(raw || "").trim();
  if (!typed) {
    return { state: "empty", key: "", text: "Use the ticket id, like PROJ-123." };
  }
  const key = normalizeJiraKey(typed);
  if (JIRA_PATTERN.test(key)) {
    return {
      state: "ok",
      key,
      text: JIRA_PATTERN.test(typed) ? `Looks good: ${key}` : `Will be saved as ${key}`
    };
  }
  return {
    state: "error",
    key: "",
    text: "Needs a project key, a hyphen, and a number. Example: PROJ-123."
  };
}

export function ticketFolderName(ticket) {
  const key = normalizeJiraKey(ticket);
  return key.replace(/[^A-Z0-9._-]/g, "-");
}

export function parseTicketInput(jiraOrComment) {
  const trimmed = String(jiraOrComment || "").trim();
  if (!trimmed) return { ticket: "", kind: "empty" };
  if (isJiraKey(trimmed)) return { ticket: normalizeJiraKey(trimmed), kind: "jira" };
  return { ticket: trimmed, kind: "label" };
}

/**
 * If the user only typed a comment (no Jira key), mint a dated change id.
 * Example: CHANGE-20260818-1
 */
export function mintChangeId(existingVersions, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const prefix = `CHANGE-${y}${m}${d}`;
  const used = existingVersions
    .map((v) => v.jira)
    .filter((id) => String(id).startsWith(prefix))
    .map((id) => Number(String(id).split("-").pop()))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${next}`;
}

export function nextIncrement(existingVersions, jira) {
  const key = normalizeJiraKey(jira);
  const used = existingVersions
    .filter((v) => normalizeJiraKey(v.jira) === key)
    .map((v) => Number(v.increment) || 0);
  return (used.length ? Math.max(...used) : 0) + 1;
}

export function versionId(jira, increment) {
  return `${normalizeJiraKey(jira)}-v${increment}`;
}

export function releasePath(jira, increment) {
  return `.orgflow/releases/${ticketFolderName(jira)}/v${increment}`;
}

export function versionsFilePath() {
  return ".orgflow/versions.json";
}

export function emptyVersionStore() {
  return { schema: 1, versions: [] };
}

export function parseVersionStore(raw) {
  if (!raw) return emptyVersionStore();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.versions)) return emptyVersionStore();
    return { schema: parsed.schema || 1, versions: parsed.versions };
  } catch {
    return emptyVersionStore();
  }
}

export function findLatestForJira(versions, jira) {
  const key = normalizeJiraKey(jira);
  const matches = versions.filter((v) => normalizeJiraKey(v.jira) === key);
  if (!matches.length) return null;
  return matches.slice().sort((a, b) => (b.increment || 0) - (a.increment || 0))[0];
}

export function findVersion(versions, idOrJira) {
  const raw = String(idOrJira || "").trim();
  if (!raw) return null;
  const byId = versions.find((v) => v.id === raw || v.id === normalizeJiraKey(raw));
  if (byId) return byId;
  return findLatestForJira(versions, raw);
}

export function createVersionRecord({
  jira,
  increment,
  comment,
  author,
  sourceOrg,
  commitSha,
  fileCount,
  createdAt,
  components
}) {
  const id = versionId(jira, increment);
  return {
    id,
    jira: normalizeJiraKey(jira),
    increment,
    comment: String(comment || "").trim(),
    author: author || "",
    sourceOrg: sourceOrg || {},
    commitSha: commitSha || "",
    path: releasePath(jira, increment),
    fileCount: fileCount || 0,
    components: components || [],
    createdAt: createdAt || new Date().toISOString(),
    deployments: []
  };
}

export function addDeployment(version, deployment) {
  const next = {
    org: deployment.org || {},
    status: deployment.status || "Unknown",
    comment: deployment.comment || "",
    checkOnly: Boolean(deployment.checkOnly),
    testLevel: deployment.testLevel || "NoTestRun",
    at: deployment.at || new Date().toISOString(),
    details: deployment.details || ""
  };
  return {
    ...version,
    deployments: [...(version.deployments || []), next]
  };
}

export function upsertVersion(store, record) {
  const versions = [...store.versions];
  const idx = versions.findIndex((v) => v.id === record.id);
  if (idx >= 0) versions[idx] = record;
  else versions.unshift(record);
  return { ...store, versions };
}

export function sortVersions(versions) {
  return versions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Jira key and comment are required on Retrieve before Confirm deploy.
 */
export function snapshotDetailsItems({ jiraKey, comment } = {}) {
  const items = [];
  if (!isJiraKey(jiraKey)) {
    items.push({
      kind: "error",
      kicker: "Jira key",
      text: String(jiraKey || "").trim()
        ? "Use a Jira key like PROJ-123 (project, hyphen, number)."
        : "Enter a Jira key on Retrieve (for example PROJ-123)."
    });
  }
  if (!String(comment || "").trim()) {
    items.push({
      kind: "error",
      kicker: "Comment",
      text: "Enter a comment on Retrieve describing this change."
    });
  }
  return items;
}

/**
 * Snapshot details always, plus a connected repo when Release repo is on.
 */
export function gitShipValidationItems({
  gitEnabled,
  commitMessage,
  gitConfigured,
  hostLabel = "Git",
  jiraKey
} = {}) {
  const items = snapshotDetailsItems({ jiraKey, comment: commitMessage });
  if (gitEnabled && !gitConfigured) {
    items.push({
      kind: "error",
      kicker: "Release repo",
      text: `Connect a ${hostLabel} repo on the Start tab first.`
    });
  }
  return items;
}
