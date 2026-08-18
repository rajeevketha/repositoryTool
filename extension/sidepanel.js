import { loadSettings, saveSettings, isGithubConfigured, repoLabel } from "./lib/storage.js";
import { uniqueCatalog } from "./lib/metadataTypes.js";
import {
  parseTicketInput,
  mintChangeId,
  nextIncrement,
  createVersionRecord,
  addDeployment,
  upsertVersion,
  parseVersionStore,
  emptyVersionStore,
  findVersion,
  sortVersions,
  versionsFilePath,
  isJiraKey
} from "./lib/versions.js";
import {
  getUser,
  listRepos,
  parseRepoInput,
  getFileContent,
  commitFiles,
  fetchReleaseFiles,
  encodeUtf8Base64,
  getRef
} from "./lib/github.js";
import { discoverOrgsFromCookies, orgKey } from "./lib/salesforce.js";
import { retrieveMetadata, deployMetadata, unzipToFiles, zipFromFiles } from "./lib/metadata.js";

const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  orgs: [],
  versions: emptyVersionStore(),
  githubUser: null,
  repos: [],
  busy: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function log(message, kind = "info") {
  const el = $("log");
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${message}`;
  el.textContent = `${line}\n${el.textContent}`.trim().slice(0, 8000);
  if (kind === "error") setStatus(message, "error");
}

function setStatus(text, kind = "") {
  const el = $("status-bar");
  el.textContent = text;
  el.className = `status-bar ${kind}`.trim();
}

function setBusy(busy) {
  state.busy = busy;
  for (const id of ["btn-save", "btn-deploy", "btn-both", "btn-connect-github", "btn-save-repo", "btn-refresh-orgs", "refresh-all"]) {
    const btn = $(id);
    if (btn) btn.disabled = busy;
  }
}

function selectedOrg(selectId) {
  const value = $(selectId).value;
  return state.orgs.find((o) => orgKey(o) === value) || null;
}

function fillOrgSelects() {
  const source = $("source-org");
  const target = $("target-org");
  const html = state.orgs.length
    ? state.orgs.map((o) => `<option value="${escapeHtml(orgKey(o))}">${escapeHtml(o.label)} — ${escapeHtml(o.username || o.instanceUrl)}</option>`).join("")
    : `<option value="">No orgs detected — open Setup and log in</option>`;
  const prevSource = state.settings.lastSourceOrgId;
  const prevTarget = state.settings.lastTargetOrgId;
  source.innerHTML = html;
  target.innerHTML = html;
  if (prevSource) source.value = prevSource;
  if (prevTarget) target.value = prevTarget;
}

function renderTypes() {
  const selected = new Set(state.settings.metadataTypes);
  $("type-list").innerHTML = uniqueCatalog()
    .map(
      (t) => `<label><input type="checkbox" data-type="${escapeHtml(t.name)}" ${selected.has(t.name) ? "checked" : ""}/> ${escapeHtml(t.label)} <span class="muted">${escapeHtml(t.name)}</span></label>`
    )
    .join("");
}

function renderRepos() {
  const select = $("gh-repo");
  const current = state.settings.github.owner && state.settings.github.repo
    ? `${state.settings.github.owner}/${state.settings.github.repo}`
    : "";
  if (!state.repos.length) {
    select.innerHTML = current
      ? `<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>`
      : `<option value="">Connect GitHub to load repos</option>`;
    return;
  }
  select.innerHTML = state.repos
    .map((r) => `<option value="${escapeHtml(r.fullName)}">${escapeHtml(r.fullName)}${r.private ? " 🔒" : ""}</option>`)
    .join("");
  if (current) select.value = current;
}

function renderOrgCards() {
  if (!state.orgs.length) {
    $("org-list").innerHTML = `<div class="empty">No Salesforce sessions found. Log into each org in a browser tab, then detect again.</div>`;
    return;
  }
  $("org-list").innerHTML = state.orgs
    .map(
      (o) => `<article class="card">
        <div class="title">${escapeHtml(o.label)}</div>
        <div class="meta">${escapeHtml(o.username || "")}<br/>${escapeHtml(o.instanceUrl)}</div>
      </article>`
    )
    .join("");
}

function renderVersions() {
  const q = $("version-filter").value.trim().toLowerCase();
  const items = sortVersions(state.versions.versions).filter((v) => {
    if (!q) return true;
    return `${v.id} ${v.jira} ${v.comment}`.toLowerCase().includes(q);
  });
  if (!items.length) {
    $("version-list").innerHTML = `<div class="empty">No versions in the connected repo yet.</div>`;
    return;
  }
  $("version-list").innerHTML = items
    .map((v) => {
      const deploys = (v.deployments || []).slice(-3).map((d) => `${d.org?.label || d.org?.name || "org"}: ${d.status}`).join(" · ");
      return `<article class="card" data-id="${escapeHtml(v.id)}">
        <div class="title">${escapeHtml(v.id)}</div>
        <div class="meta">${escapeHtml(v.comment || "No comment")}</div>
        <div class="meta">${escapeHtml(v.sourceOrg?.label || "")} · ${escapeHtml(new Date(v.createdAt).toLocaleString())}${v.fileCount ? ` · ${v.fileCount} files` : ""}</div>
        ${deploys ? `<div class="meta">${escapeHtml(deploys)}</div>` : ""}
        <div class="tiny">
          <button class="secondary" data-use="${escapeHtml(v.id)}">Use in Ship</button>
          <button class="primary" data-deploy="${escapeHtml(v.id)}">Deploy</button>
        </div>
      </article>`;
    })
    .join("");
}

function ghCreds() {
  const { token, owner, repo, branch } = state.settings.github;
  return { token, owner, repo, branch };
}

async function loadVersionStore() {
  if (!isGithubConfigured(state.settings)) {
    state.versions = emptyVersionStore();
    return;
  }
  const { token, owner, repo, branch } = ghCreds();
  const raw = await getFileContent(token, owner, repo, versionsFilePath(), branch);
  state.versions = parseVersionStore(raw);
}

async function refreshOrgs() {
  log("Detecting Salesforce orgs from browser cookies…");
  const discovered = await discoverOrgsFromCookies();
  const byId = new Map();
  for (const org of [...(state.settings.savedOrgs || []), ...discovered]) {
    byId.set(orgKey(org), org);
  }
  state.orgs = [...byId.values()];
  await saveSettings({ savedOrgs: state.orgs.map(({ sid, ...rest }) => ({ ...rest, sid })) });
  fillOrgSelects();
  renderOrgCards();
  log(`Found ${state.orgs.length} org${state.orgs.length === 1 ? "" : "s"}.`);
}

function updateHeaderStatus() {
  if (!isGithubConfigured(state.settings)) {
    setStatus("Connect a GitHub repo in Setup to store versions.");
    return;
  }
  const n = state.orgs.length;
  setStatus(`${repoLabel(state.settings)} · ${n} Salesforce org${n === 1 ? "" : "s"} ready`, n ? "ok" : "");
}

async function refreshAll() {
  state.settings = await loadSettings();
  $("gh-token").value = state.settings.github.token || "";
  $("gh-repo-input").value = state.settings.github.owner && state.settings.github.repo
    ? `${state.settings.github.owner}/${state.settings.github.repo}`
    : "";
  $("gh-branch").value = state.settings.github.branch || "main";
  $("test-level").value = state.settings.testLevel || "NoTestRun";
  $("check-only").checked = Boolean(state.settings.checkOnly);
  renderTypes();
  renderRepos();
  try {
    if (state.settings.github.token) {
      state.githubUser = await getUser(state.settings.github.token);
      $("github-user").textContent = `Signed in as ${state.githubUser.login}`;
    }
  } catch (err) {
    $("github-user").textContent = `GitHub token error: ${err.message}`;
  }
  await refreshOrgs().catch((err) => log(err.message, "error"));
  try {
    await loadVersionStore();
    renderVersions();
  } catch (err) {
    log(`Could not read versions.json: ${err.message}`, "error");
  }
  updateHeaderStatus();
}

async function connectGithub() {
  const token = $("gh-token").value.trim();
  if (!token) throw new Error("Paste a GitHub personal access token first.");
  const user = await getUser(token);
  state.githubUser = user;
  $("github-user").textContent = `Signed in as ${user.login}`;
  await saveSettings({ github: { ...state.settings.github, token } });
  state.settings = await loadSettings();
  state.repos = await listRepos(token);
  renderRepos();
  log(`GitHub connected as ${user.login}. ${state.repos.length} repos available.`);
}

async function saveRepo() {
  const token = $("gh-token").value.trim() || state.settings.github.token;
  const fromSelect = parseRepoInput($("gh-repo").value);
  const fromInput = parseRepoInput($("gh-repo-input").value);
  const parsed = fromInput || fromSelect;
  const selectedRepo = state.repos.find((r) => r.fullName === $("gh-repo").value);
  const branch = $("gh-branch").value.trim() || selectedRepo?.defaultBranch || "main";
  if (!token) throw new Error("GitHub token is required.");
  if (!parsed) throw new Error("Choose or paste a repository (owner/name).");
  const repoMeta = state.repos.find((r) => r.owner === parsed.owner && r.name === parsed.repo);
  await saveSettings({
    github: {
      token,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: branch || repoMeta?.defaultBranch || "main"
    }
  });
  state.settings = await loadSettings();
  $("gh-repo-input").value = `${parsed.owner}/${parsed.repo}`;
  $("gh-branch").value = state.settings.github.branch;
  await loadVersionStore();
  renderVersions();
  updateHeaderStatus();
  log(`Using ${repoLabel(state.settings)}`);
}

async function persistTypeSelection() {
  const boxes = [...document.querySelectorAll("#type-list input[type=checkbox]")];
  const metadataTypes = boxes.filter((b) => b.checked).map((b) => b.dataset.type);
  await saveSettings({ metadataTypes });
  state.settings = await loadSettings();
}

async function persistShipOptions() {
  await saveSettings({
    testLevel: $("test-level").value,
    checkOnly: $("check-only").checked,
    lastSourceOrgId: $("source-org").value,
    lastTargetOrgId: $("target-org").value
  });
  state.settings = await loadSettings();
}

function requireGithub() {
  if (!isGithubConfigured(state.settings)) throw new Error("Connect a GitHub repo in Setup first.");
}

function resolveTicket(store) {
  const jiraField = $("jira").value.trim();
  const comment = $("comment").value.trim();
  if (jiraField) {
    const parsed = parseTicketInput(jiraField);
    if (parsed.kind === "jira" || isJiraKey(parsed.ticket)) return { ticket: parsed.ticket, comment };
    return { ticket: parsed.ticket.toUpperCase().replace(/\s+/g, "-"), comment };
  }
  if (!comment) throw new Error("Enter a Jira ticket or a comment.");
  return { ticket: mintChangeId(store.versions), comment };
}

async function saveVersion() {
  requireGithub();
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org. Log into it in Chrome first.");
  await persistTypeSelection();
  await persistShipOptions();
  const types = state.settings.metadataTypes;
  if (!types.length) throw new Error("Select at least one metadata type on the Components tab.");

  await loadVersionStore();
  const { ticket, comment } = resolveTicket(state.versions);
  const increment = nextIncrement(state.versions.versions, ticket);
  const record = createVersionRecord({
    jira: ticket,
    increment,
    comment,
    author: state.githubUser?.login || "",
    sourceOrg: { id: source.id, label: source.label, instanceUrl: source.instanceUrl, username: source.username },
    fileCount: 0
  });

  log(`Retrieving ${types.length} metadata types from ${source.label} as ${record.id}…`);
  const zipBase64 = await retrieveMetadata({
    instanceUrl: source.instanceUrl,
    sid: source.sid,
    typeNames: types,
    apiVersion: state.settings.apiVersion,
    onProgress: (m) => log(m)
  });
  const files = await unzipToFiles(zipBase64);
  if (!files.length) throw new Error("Retrieve returned no files. Check the selected metadata types.");
  record.fileCount = files.length;

  const prefixed = files.map((f) => ({ path: `${record.path}/${f.path}`, base64: f.base64 }));
  const nextStore = upsertVersion(state.versions, record);
  prefixed.push({
    path: versionsFilePath(),
    base64: encodeUtf8Base64(JSON.stringify(nextStore, null, 2) + "\n")
  });

  log(`Writing ${files.length} files to ${repoLabel(state.settings)}…`);
  const commit = await commitFiles({
    ...ghCreds(),
    files: prefixed,
    message: `${record.id}: ${comment || "Salesforce snapshot"}`
  });
  record.commitSha = commit.sha;
  const withSha = upsertVersion(nextStore, record);
  await commitFiles({
    ...ghCreds(),
    files: [{ path: versionsFilePath(), base64: encodeUtf8Base64(JSON.stringify(withSha, null, 2) + "\n") }],
    message: `chore: record ${record.id} at ${commit.sha.slice(0, 7)}`
  });
  state.versions = withSha;
  renderVersions();
  $("jira").value = record.jira;
  log(`Saved ${record.id} (${files.length} files, commit ${commit.sha.slice(0, 7)}).`);
  setStatus(`Saved ${record.id} to ${repoLabel(state.settings)}`, "ok");
  return record;
}

async function deployVersion(explicitId) {
  requireGithub();
  const target = selectedOrg("target-org");
  if (!target) throw new Error("Select a target org. Log into it in Chrome first.");
  await persistShipOptions();
  await loadVersionStore();
  const wanted = explicitId || $("jira").value.trim();
  if (!wanted) throw new Error("Enter a Jira ticket or version id (for example PROJ-123 or PROJ-123-v2).");
  const version = findVersion(state.versions.versions, wanted);
  if (!version) throw new Error(`No saved version found for "${wanted}". Save it from the source org first.`);

  const { token, owner, repo, branch } = ghCreds();
  const ref = await getRef(token, owner, repo, branch);
  const sha = version.commitSha || ref?.object?.sha;
  if (!sha) throw new Error("Repo branch has no commits yet.");
  log(`Loading ${version.id} from Git (${version.path})…`);
  const files = await fetchReleaseFiles({ token, owner, repo, commitSha: sha, prefix: version.path });
  if (!files.length) throw new Error(`No files found at ${version.path}.`);
  const zipBase64 = await zipFromFiles(files);
  const options = {
    testLevel: $("test-level").value,
    checkOnly: $("check-only").checked
  };
  log(`Deploying ${version.id} to ${target.label}…`);
  const result = await deployMetadata({
    instanceUrl: target.instanceUrl,
    sid: target.sid,
    zipBase64,
    options,
    apiVersion: state.settings.apiVersion,
    onProgress: (m) => log(m)
  });
  const updated = addDeployment(version, {
    org: { id: target.id, label: target.label, instanceUrl: target.instanceUrl },
    status: result.status || "Succeeded",
    comment: $("comment").value.trim(),
    checkOnly: options.checkOnly,
    testLevel: options.testLevel
  });
  const store = upsertVersion(state.versions, updated);
  await commitFiles({
    ...ghCreds(),
    files: [{ path: versionsFilePath(), base64: encodeUtf8Base64(JSON.stringify(store, null, 2) + "\n") }],
    message: `${version.id}: deployed to ${target.label}${options.checkOnly ? " (validate)" : ""}`
  });
  state.versions = store;
  renderVersions();
  log(`Deployed ${version.id} to ${target.label} (${result.status || "Succeeded"}).`);
  setStatus(`Deployed ${version.id} → ${target.label}`, "ok");
  return updated;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
}

async function run(action) {
  if (state.busy) return;
  setBusy(true);
  try {
    await action();
  } catch (err) {
    console.error(err);
    log(err.message || String(err), "error");
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

$("btn-connect-github").addEventListener("click", () => run(connectGithub));
$("btn-save-repo").addEventListener("click", () => run(saveRepo));
$("btn-refresh-orgs").addEventListener("click", () => run(refreshOrgs));
$("refresh-all").addEventListener("click", () => run(refreshAll));
$("btn-save").addEventListener("click", () => run(saveVersion));
$("btn-deploy").addEventListener("click", () => run(() => deployVersion()));
$("btn-both").addEventListener("click", () => run(async () => {
  await saveVersion();
  await deployVersion();
}));
$("version-filter").addEventListener("input", renderVersions);
$("type-list").addEventListener("change", () => run(persistTypeSelection));
$("version-list").addEventListener("click", (event) => {
  const useId = event.target.dataset.use;
  const deployId = event.target.dataset.deploy;
  if (useId) {
    $("jira").value = useId;
    switchTab("ship");
  }
  if (deployId) {
    $("jira").value = deployId;
    switchTab("ship");
    run(() => deployVersion(deployId));
  }
});

refreshAll();
