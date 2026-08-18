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
import { retrieveMetadata, deployMetadata, unzipToFiles, zipFromFiles, listMetadataType } from "./lib/metadata.js";
import {
  buildPackageXmlFromTypes,
  parsePackageXml,
  assertPackageXml,
  memberCount,
  packageSummary,
  toggleMember,
  setTypeMembers,
  normalizePackageTypes
} from "./lib/packageXml.js";
import { isEditablePath, decodeUtf8Base64, withEditedText } from "./lib/files.js";

const $ = (id) => document.getElementById(id);
const MAX_MEMBERS = 400;

const state = {
  settings: null,
  orgs: [],
  versions: emptyVersionStore(),
  githubUser: null,
  repos: [],
  busy: false,
  packageTypes: [],
  xmlDirty: false,
  activeType: "ApexClass",
  membersCache: {},
  stagedFiles: null,
  activeFilePath: ""
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
  document.querySelectorAll("[data-busy]").forEach((btn) => {
    btn.disabled = busy;
  });
}

function selectedOrg(selectId) {
  const value = $(selectId).value;
  return state.orgs.find((o) => orgKey(o) === value) || null;
}

function apiVersion() {
  return state.settings?.apiVersion || "61.0";
}

function currentXml() {
  return buildPackageXmlFromTypes(state.packageTypes, apiVersion());
}

function selectedMembersFor(typeName) {
  return new Set(state.packageTypes.find((t) => t.name === typeName)?.members || []);
}

function invalidateStaged() {
  state.stagedFiles = null;
  state.activeFilePath = "";
  $("file-editor-wrap").classList.add("hidden");
  renderFileList();
}

async function persistPackage() {
  state.packageTypes = normalizePackageTypes(state.packageTypes);
  await saveSettings({ packageTypes: state.packageTypes });
  state.settings = await loadSettings();
  if (!state.xmlDirty) $("package-xml").value = currentXml();
  renderPackageUi();
}

function renderPackageUi() {
  const summary = packageSummary(state.packageTypes);
  const count = memberCount(state.packageTypes);
  $("package-summary-body").textContent = count
    ? `${count} selected · ${summary}`
    : "No components yet — pick them on the Components tab.";
  $("package-count").textContent = String(count);
  $("selected-package").textContent = count
    ? state.packageTypes
        .map((t) => `${t.name}\n  ${t.members.join("\n  ")}`)
        .join("\n")
    : "Nothing selected.";
  $("xml-status").textContent = state.xmlDirty ? "XML edited — click Apply to use it." : "XML matches the picker.";
  renderMembers();
}

function renderTypeSelect() {
  const select = $("meta-type");
  select.innerHTML = uniqueCatalog()
    .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.label)} (${escapeHtml(t.name)})</option>`)
    .join("");
  if (state.activeType) select.value = state.activeType;
  state.activeType = select.value;
}

function renderMembers() {
  const typeName = $("meta-type").value || state.activeType;
  const cache = state.membersCache[typeName];
  const filter = $("member-filter").value.trim().toLowerCase();
  const selected = selectedMembersFor(typeName);
  const list = $("member-list");
  const status = $("member-status");

  if (!cache) {
    status.textContent = "Load this type from the source org, or add a member by name.";
    const extras = [...selected].filter((name) => name !== "*");
    list.innerHTML = extras.length
      ? extras
          .map(
            (name) =>
              `<label><input type="checkbox" data-member="${escapeHtml(name)}" checked /> ${escapeHtml(name)}</label>`
          )
          .join("")
      : `<div class="empty">No members loaded.</div>`;
    return;
  }
  if (cache.error) {
    status.textContent = cache.error;
  } else {
    status.textContent = `${cache.items.length} in org · ${selected.size} selected in this type`;
  }

  let items = cache.items || [];
  if (filter) items = items.filter((i) => i.fullName.toLowerCase().includes(filter));
  const extraSelected = [...selected].filter((name) => name !== "*" && !items.some((i) => i.fullName === name));
  const combined = [
    ...extraSelected.map((fullName) => ({ fullName, extra: true })),
    ...items
  ];
  const shown = combined.slice(0, MAX_MEMBERS);
  if (!shown.length) {
    list.innerHTML = `<div class="empty">No members match the filter.</div>`;
    return;
  }
  list.innerHTML =
    shown
      .map((item) => {
        const checked = selected.has("*") || selected.has(item.fullName) ? "checked" : "";
        const mark = item.extra ? " <span class=\"muted\">(manual)</span>" : "";
        return `<label><input type="checkbox" data-member="${escapeHtml(item.fullName)}" ${checked} /> ${escapeHtml(item.fullName)}${mark}</label>`;
      })
      .join("") +
    (combined.length > MAX_MEMBERS
      ? `<div class="muted">Showing ${MAX_MEMBERS} of ${combined.length}. Filter to find the rest.</div>`
      : "");
}

function renderFileList() {
  const el = $("file-list");
  if (!state.stagedFiles?.length) {
    el.innerHTML = `<div class="empty">Retrieve selected components to review and edit files here.</div>`;
    return;
  }
  el.innerHTML = state.stagedFiles
    .map((file) => {
      const editable = isEditablePath(file.path);
      const active = file.path === state.activeFilePath ? "active" : "";
      const edited = file.edited ? " · edited" : "";
      return `<button type="button" class="file-row ${active}" data-file="${escapeHtml(file.path)}" ${editable ? "" : "disabled"}>
        <span>${escapeHtml(file.path)}</span>
        <span class="muted">${editable ? `edit${edited}` : "binary"}</span>
      </button>`;
    })
    .join("");
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
      const comps = v.components?.length ? packageSummary(v.components) : "";
      return `<article class="card" data-id="${escapeHtml(v.id)}">
        <div class="title">${escapeHtml(v.id)}</div>
        <div class="meta">${escapeHtml(v.comment || "No comment")}</div>
        <div class="meta">${escapeHtml(v.sourceOrg?.label || "")} · ${escapeHtml(new Date(v.createdAt).toLocaleString())}${v.fileCount ? ` · ${v.fileCount} files` : ""}</div>
        ${comps ? `<div class="meta">${escapeHtml(comps)}</div>` : ""}
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
  const pack = memberCount(state.packageTypes);
  const repo = isGithubConfigured(state.settings) ? repoLabel(state.settings) : "Git not connected";
  const n = state.orgs.length;
  setStatus(`${repo} · ${n} org${n === 1 ? "" : "s"} · ${pack} component${pack === 1 ? "" : "s"}`, n ? "ok" : "");
}

async function refreshAll() {
  state.settings = await loadSettings();
  state.packageTypes = normalizePackageTypes(state.settings.packageTypes);
  $("gh-token").value = state.settings.github.token || "";
  $("gh-repo-input").value = state.settings.github.owner && state.settings.github.repo
    ? `${state.settings.github.owner}/${state.settings.github.repo}`
    : "";
  $("gh-branch").value = state.settings.github.branch || "main";
  $("test-level").value = state.settings.testLevel || "NoTestRun";
  $("check-only").checked = Boolean(state.settings.checkOnly);
  $("package-xml").value = currentXml();
  state.xmlDirty = false;
  renderTypeSelect();
  renderRepos();
  renderPackageUi();
  renderFileList();
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

async function persistShipOptions() {
  await saveSettings({
    testLevel: $("test-level").value,
    checkOnly: $("check-only").checked,
    lastSourceOrgId: $("source-org").value,
    lastTargetOrgId: $("target-org").value
  });
  state.settings = await loadSettings();
}

function requirePackage() {
  const types = normalizePackageTypes(state.packageTypes);
  if (!types.length) throw new Error("Select components on the Components tab, or paste a package.xml.");
  return types;
}

async function ensurePackage() {
  if (state.xmlDirty) await applyXmlToPicker();
  return requirePackage();
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

async function retrieveIntoReview() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org. Log into it in Chrome first.");
  const types = await ensurePackage();
  await persistShipOptions();
  log(`Retrieving ${memberCount(types)} component(s) from ${source.label}…`);
  const zipBase64 = await retrieveMetadata({
    instanceUrl: source.instanceUrl,
    sid: source.sid,
    packageTypes: types,
    apiVersion: apiVersion(),
    onProgress: (m) => log(m)
  });
  const files = await unzipToFiles(zipBase64);
  if (!files.length) throw new Error("Retrieve returned no files. Check package.xml members.");
  state.stagedFiles = files;
  renderFileList();
  switchSubtab("review");
  log(`Retrieved ${files.length} file(s). You can edit XML before deploy.`);
  setStatus(`Retrieved ${files.length} files — review or deploy`, "ok");
  return files;
}

async function filesForDeploy() {
  if (state.stagedFiles?.length) return state.stagedFiles;
  return retrieveIntoReview();
}

function deployOptions() {
  return {
    testLevel: $("test-level").value,
    checkOnly: $("check-only").checked
  };
}

async function deploySelected() {
  const target = selectedOrg("target-org");
  if (!target) throw new Error("Select a target org. Log into it in Chrome first.");
  await persistShipOptions();
  const files = await filesForDeploy();
  const zipBase64 = await zipFromFiles(files);
  const options = deployOptions();
  log(`Deploying ${files.length} file(s) to ${target.label}…`);
  const result = await deployMetadata({
    instanceUrl: target.instanceUrl,
    sid: target.sid,
    zipBase64,
    options,
    apiVersion: apiVersion(),
    onProgress: (m) => log(m)
  });
  log(`Deployed selected package to ${target.label} (${result.status || "Succeeded"}).`);
  setStatus(`Deployed package → ${target.label}`, "ok");
  return result;
}

async function saveVersion() {
  requireGithub();
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org. Log into it in Chrome first.");
  const types = await ensurePackage();
  await persistShipOptions();
  await persistPackage();

  const files = state.stagedFiles?.length ? state.stagedFiles : await retrieveIntoReview();
  await loadVersionStore();
  const { ticket, comment } = resolveTicket(state.versions);
  const increment = nextIncrement(state.versions.versions, ticket);
  const record = createVersionRecord({
    jira: ticket,
    increment,
    comment,
    author: state.githubUser?.login || "",
    sourceOrg: { id: source.id, label: source.label, instanceUrl: source.instanceUrl, username: source.username },
    fileCount: files.length,
    components: types
  });

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
  const options = deployOptions();
  log(`Deploying ${version.id} to ${target.label}…`);
  const result = await deployMetadata({
    instanceUrl: target.instanceUrl,
    sid: target.sid,
    zipBase64,
    options,
    apiVersion: apiVersion(),
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

async function loadMembers() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org on the Ship tab first.");
  const typeName = $("meta-type").value;
  state.activeType = typeName;
  log(`Listing ${typeName} in ${source.label}…`);
  try {
    const items = await listMetadataType({
      instanceUrl: source.instanceUrl,
      sid: source.sid,
      typeName,
      apiVersion: apiVersion(),
      onProgress: (m) => log(m)
    });
    state.membersCache[typeName] = { items, error: "" };
    log(`Found ${items.length} ${typeName} member(s).`);
  } catch (err) {
    state.membersCache[typeName] = { items: [], error: err.message };
    throw err;
  }
  renderMembers();
}

function applyXmlToPicker() {
  const parsed = assertPackageXml($("package-xml").value);
  state.packageTypes = parsed.types;
  state.xmlDirty = false;
  invalidateStaged();
  $("package-xml").value = buildPackageXmlFromTypes(state.packageTypes, parsed.version || apiVersion());
  return persistPackage();
}

function rebuildXmlFromPicker() {
  state.xmlDirty = false;
  $("package-xml").value = currentXml();
  $("xml-status").textContent = "XML rebuilt from the picker.";
}

function openFile(path) {
  const file = state.stagedFiles?.find((f) => f.path === path);
  if (!file || !isEditablePath(file.path)) return;
  state.activeFilePath = path;
  $("file-editor-wrap").classList.remove("hidden");
  $("file-editor-name").textContent = path;
  $("file-editor").value = decodeUtf8Base64(file.base64);
  renderFileList();
}

function saveFileEdits() {
  const path = state.activeFilePath;
  if (!path) throw new Error("Open a file first.");
  const text = $("file-editor").value;
  state.stagedFiles = state.stagedFiles.map((f) => (f.path === path ? withEditedText(f, text) : f));
  renderFileList();
  log(`Updated ${path} in the retrieve package.`);
  setStatus(`Edited ${path}`, "ok");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
}

function switchSubtab(name) {
  document.querySelectorAll(".subtab").forEach((t) => t.classList.toggle("active", t.dataset.subtab === name));
  document.querySelectorAll(".subview").forEach((v) => v.classList.toggle("active", v.id === `subview-${name}`));
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
document.querySelectorAll(".subtab").forEach((tab) => {
  tab.addEventListener("click", () => switchSubtab(tab.dataset.subtab));
});

$("goto-components").addEventListener("click", () => switchTab("components"));
$("btn-connect-github").addEventListener("click", () => run(connectGithub));
$("btn-save-repo").addEventListener("click", () => run(saveRepo));
$("btn-refresh-orgs").addEventListener("click", () => run(refreshOrgs));
$("refresh-all").addEventListener("click", () => run(refreshAll));
$("btn-save").addEventListener("click", () => run(saveVersion));
$("btn-deploy").addEventListener("click", () => run(() => deployVersion()));
$("btn-deploy-selected").addEventListener("click", () => run(deploySelected));
$("btn-deploy-from-pick").addEventListener("click", () => run(deploySelected));
$("btn-deploy-review").addEventListener("click", () => run(deploySelected));
$("btn-retrieve").addEventListener("click", () => run(retrieveIntoReview));
$("btn-retrieve-review").addEventListener("click", () => run(retrieveIntoReview));
$("btn-both").addEventListener("click", () => run(async () => {
  await saveVersion();
  await deployVersion();
}));
$("btn-load-members").addEventListener("click", () => run(loadMembers));
$("btn-apply-xml").addEventListener("click", () => run(applyXmlToPicker));
$("btn-rebuild-xml").addEventListener("click", rebuildXmlFromPicker);
$("btn-save-file").addEventListener("click", () => run(saveFileEdits));
$("btn-clear-package").addEventListener("click", () => run(async () => {
  state.packageTypes = [];
  state.xmlDirty = false;
  invalidateStaged();
  await persistPackage();
}));
$("btn-clear-type").addEventListener("click", () => run(async () => {
  state.packageTypes = setTypeMembers(state.packageTypes, $("meta-type").value, []);
  invalidateStaged();
  await persistPackage();
}));
$("btn-select-visible").addEventListener("click", () => run(async () => {
  const boxes = [...document.querySelectorAll("#member-list input[data-member]")];
  const names = boxes.map((b) => b.dataset.member);
  if (!names.length) throw new Error("Load or filter members first.");
  const typeName = $("meta-type").value;
  const current = selectedMembersFor(typeName);
  names.forEach((n) => current.add(n));
  state.packageTypes = setTypeMembers(state.packageTypes, typeName, [...current]);
  invalidateStaged();
  await persistPackage();
}));
$("btn-add-member").addEventListener("click", () => run(async () => {
  const name = $("manual-member").value.trim();
  if (!name) throw new Error("Enter a metadata member name.");
  const typeName = $("meta-type").value;
  state.packageTypes = toggleMember(state.packageTypes, typeName, name, true);
  $("manual-member").value = "";
  invalidateStaged();
  await persistPackage();
}));
$("meta-type").addEventListener("change", () => {
  state.activeType = $("meta-type").value;
  renderMembers();
});
$("member-filter").addEventListener("input", renderMembers);
$("member-list").addEventListener("change", (event) => {
  const box = event.target.closest("input[data-member]");
  if (!box) return;
  run(async () => {
    const typeName = $("meta-type").value;
    const listed = (state.membersCache[typeName]?.items || []).map((i) => i.fullName);
    state.packageTypes = toggleMember(state.packageTypes, typeName, box.dataset.member, box.checked, listed);
    invalidateStaged();
    await persistPackage();
  });
});
$("package-xml").addEventListener("input", () => {
  state.xmlDirty = true;
  $("xml-status").textContent = "XML edited — click Apply to use it.";
});
$("file-list").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-file]");
  if (btn) openFile(btn.dataset.file);
});
$("version-filter").addEventListener("input", renderVersions);
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
