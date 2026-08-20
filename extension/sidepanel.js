import { loadSettings, saveSettings, isGitConfigured, repoLabel, savePipelineCache, loadPipelineCache } from "./lib/storage.js";
import { catalogGroupsFromTypes, memberHint, fallbackTypeRecords, mergeDescribedTypes, withStandardObjectMembers, objectFilterOptions, memberObjectKey, OBJECT_FILTER_TYPES, isStandardObject, COMMON_CONFIG_TYPES } from "./lib/metadataTypes.js";
import {
  nextIncrement,
  createVersionRecord,
  addDeployment,
  upsertVersion,
  parseVersionStore,
  emptyVersionStore,
  findVersion,
  sortVersions,
  versionsFilePath,
  isJiraKey,
  gitShipValidationItems,
  snapshotDetailsItems
} from "./lib/versions.js";
import {
  providerMeta,
  providerId,
  hostCreds,
  parseRepoInput,
  ensureHostAccess,
  getUser,
  listRepos,
  getFileContent,
  commitFiles,
  fetchReleaseFiles,
  encodeUtf8Base64,
  getRef,
  browseFolderUrl,
  tokenUrl,
  listRootEntries
} from "./lib/gitHost.js";
import {
  pipelinesFilePath,
  emptyPipelineStore,
  parsePipelineStore,
  createPipeline,
  upsertPipeline,
  findPipeline,
  matchOrg,
  stagesFromPipeline,
  pipelinePathLabel,
  findMatchingPipeline,
  appendStage,
  nextHopAfter,
  sameOrg
} from "./lib/pipelines.js";
import { discoverOrgsFromCookies, orgKey } from "./lib/salesforce.js";
import { retrieveMetadata, deployMetadata, unzipToFiles, zipFromFiles, listMetadataType, describeOrgMetadata } from "./lib/metadata.js";
import { decodeUtf8Base64, withEditedText, isEditablePath } from "./lib/files.js";
import {
  buildPackageXmlFromTypes,
  assertPackageXml,
  memberCount,
  packageSummary,
  toggleMember,
  setTypeMembers,
  normalizePackageTypes,
  formatOperationOutcome
} from "./lib/packageXml.js";
import {
  categoryColumns,
  filterCategoryColumns,
  suggestedTestClasses,
  packageHasApex,
  isTestClassName,
  normalizeTestNames
} from "./lib/packageView.js";
import { inspectRepoLayout, layoutCopy, snapshotTreeText, scaffoldProjectFiles, shouldAutoScaffold, hasSalesforceProject, canScaffold } from "./lib/projectLayout.js";
import {
  loadLocalVersionStore,
  saveLocalVersionStore,
  saveLocalRelease,
  loadLocalRelease
} from "./lib/localVersions.js";
import { compareFileSets, revertSelectedInto, unifiedDiff, fileText } from "./lib/diff.js";
import {
  RECENT_HINT_TYPES,
  relatedTypeHints,
  recentHintItems,
  packageHasMember,
  shortTypeLabel
} from "./lib/packageHints.js";

const $ = (id) => document.getElementById(id);
const MAX_MEMBERS = 400;
const WORKBENCH_MEMBERS = 800;

if (new URLSearchParams(location.search).get("layout") === "workbench") {
  document.body.dataset.layout = "workbench";
  document.title = "OrgFlow workbench";
}

const isWorkbench = () => document.body.dataset.layout === "workbench";

const STEPS = [
  { id: "start", label: "Start", view: "start" },
  { id: "package", label: "Package", view: "components" },
  { id: "review", label: "Retrieve", view: "components" },
  { id: "deploy", label: "Confirm", view: "ship" }
];

function stepIndexById(id) {
  const index = STEPS.findIndex((step) => step.id === id);
  return index < 0 ? 0 : index;
}

const state = {
  settings: null,
  orgs: [],
  versions: emptyVersionStore(),
  githubUser: null,
  repos: [],
  busy: false,
  packageTypes: [],
  xmlDirty: false,
  activeType: "",
  typeFilter: "",
  availableTypes: [],
  membersCache: {},
  stagedFiles: null,
  activeFilePath: "",
  specifiedTests: [],
  testClassCache: null,
  inspectorView: "categories",
  typeChosen: false,
  objectFilter: "",
  pipelines: emptyPipelineStore(),
  stepIndex: 0,
  reviewSeen: false,
  showingVersions: false,
  xmlReview: false,
  selectionFrozen: false,
  retrieveSnapshot: null,
  deployFinished: "",
  retrieveOk: false,
  lastDeploy: null,
  lastValidate: null,
  shipKind: "",
  autoRetrieveAttempted: false,
  versionFilesCache: {},
  compareRows: [],
  compareActivePath: "",
  lastSaved: null,
  gitShipWarned: false,
  versionsReturnStep: 2,
  gitLayout: null,
  gitAutoScaffoldDone: false,
  recentWarmGen: 0
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
  updateActionState();
}

function highlightedType() {
  return state.activeType || "";
}

function selectedOrg(selectId) {
  const el = $(selectId);
  if (!el) return null;
  const value = el.value;
  if (!value) return null;
  return state.orgs.find((o) => orgKey(o) === value) || null;
}

function orgKind(org) {
  if (!org) return "";
  if (/sandbox/i.test(org.label) || /\.sandbox\./i.test(org.instanceUrl || "")) return "Sandbox";
  if (/scratch/i.test(org.instanceUrl || "")) return "Scratch";
  return "Production";
}

function packageFingerprint() {
  return JSON.stringify(
    normalizePackageTypes(state.packageTypes).map((t) => [t.name, [...(t.members || [])].sort()])
  );
}

function stagedFilesFingerprint() {
  return (state.stagedFiles || [])
    .map((f) => `${f.path}:${f.edited ? "e" : ""}:${String(f.base64 || "").length}:${String(f.base64 || "").slice(0, 32)}`)
    .sort()
    .join("|");
}

function hasFreshRetrieve() {
  const source = selectedOrg("source-org");
  const snap = state.retrieveSnapshot;
  return Boolean(
    state.stagedFiles?.length
      && snap
      && source
      && snap.sourceKey === orgKey(source)
      && snap.fingerprint === packageFingerprint()
  );
}

function retrieveBlockReason() {
  if (hasFreshRetrieve()) return "";
  if (state.retrieveSnapshot && state.stagedFiles?.length) {
    return "From org or members no longer match the last retrieve. Retrieve again before deploy.";
  }
  if (state.retrieveSnapshot) {
    return "You changed the From org or the selected members. Retrieve again before deploy.";
  }
  return "Retrieve the package from the From org before deploy.";
}

function applyRetrieveLockUi() {
  const stepId = currentStepId();
  const editingPackage = stepId === "package" || stepId === "start";
  if (editingPackage) state.selectionFrozen = false;
  const stale = Boolean(state.retrieveSnapshot && !hasFreshRetrieve());
  const lockFrom = !editingPackage && hasFreshRetrieve() && state.retrieveOk;
  document.body.classList.toggle("retrieve-frozen", lockFrom);
  document.body.classList.toggle("retrieve-stale", stale);
  const sourceEl = $("source-org");
  if (sourceEl) sourceEl.disabled = lockFrom;
  const lock = $("retrieve-lock");
  const copy = $("retrieve-lock-copy");
  const unlock = $("btn-unlock-retrieve");
  if (lock) {
    lock.classList.toggle("hidden", !stale && !lockFrom);
    lock.classList.toggle("stale", stale && !lockFrom);
  }
  if (copy) {
    const source = selectedOrg("source-org");
    if (stale) {
      copy.textContent = "Package changed after retrieve. Retrieve again before deploy.";
    } else if (lockFrom) {
      copy.textContent = `Retrieved ${state.stagedFiles?.length || 0} files from ${source?.label || "From org"}. Back to Package to add more members, then retrieve again.`;
    }
  }
  if (unlock) {
    const showBack = lockFrom && stepId === "review";
    unlock.classList.toggle("hidden", !showBack);
    unlock.disabled = !showBack;
    unlock.textContent = "Back to Package to add members";
  }
}

function unlockSelection() {
  goStep(stepIndexById("package"), { force: true });
  setStatus("Add members here. Retrieve again before deploy.", "ok");
}

function alreadyDeployedToCurrentTarget() {
  const target = selectedOrg("target-org");
  if (!target || !state.lastDeploy) return false;
  return state.lastDeploy.targetKey === orgKey(target)
    && state.lastDeploy.fingerprint === packageFingerprint()
    && hasFreshRetrieve();
}

function lastValidateMatches() {
  const target = selectedOrg("target-org");
  return Boolean(
    state.lastValidate?.ok
      && target
      && state.lastValidate.targetKey === orgKey(target)
      && state.lastValidate.fingerprint === packageFingerprint()
      && hasFreshRetrieve()
  );
}

function deployBlockReason() {
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  const pack = memberCount(state.packageTypes);
  if (!state.orgs.length) return "Detect logged-in Salesforce orgs on Start, then choose From and To.";
  if (!source) return "Select a source org in the path bar (From).";
  if (!target) return "Select a target org in the path bar (To). Deploy stays disabled until then.";
  if (orgKey(source) === orgKey(target)) return "From and To are the same org. Pick a different target (for example Dev → QA).";
  if (!pack) return `Path is ${source.label} → ${target.label}. Pick configuration before deploy.`;
  if (!state.retrieveOk || !hasFreshRetrieve()) {
    return retrieveBlockReason() || "Retrieve must succeed before deploy. Next stays off until then.";
  }
  const details = snapshotValidationItems();
  if (details.length) return details[0].text;
  if (alreadyDeployedToCurrentTarget()) {
    return `Already deployed this package to ${target.label}. Change To for another org, or start a new package.`;
  }
  if (useGitEnabled()) {
    const gitItems = gitShipItems();
    if (gitItems.length) return gitItems[0].text;
  }
  return "";
}

function updateActionState() {
  const reason = deployBlockReason();
  document.querySelectorAll("[data-busy]").forEach((btn) => {
    if (state.busy) {
      btn.disabled = true;
      return;
    }
    const needs = (btn.dataset.needs || "").split(",").map((s) => s.trim()).filter(Boolean);
    const source = selectedOrg("source-org");
    const target = selectedOrg("target-org");
    const pack = memberCount(state.packageTypes);
    const same = source && target && orgKey(source) === orgKey(target);
    let disabled = false;
    if (needs.includes("source") && !source) disabled = true;
    if (needs.includes("target") && !target) disabled = true;
    if (needs.includes("package") && !pack) disabled = true;
    if (needs.includes("distinct") && same) disabled = true;
    if (needs.includes("retrieve") && !hasFreshRetrieve()) disabled = true;
    if (needs.includes("git") && (!useGitEnabled() || !isGitConfigured(state.settings))) disabled = true;
    if ((btn.id === "btn-retrieve" || btn.id === "btn-retrieve-review") && hasFreshRetrieve() && state.retrieveOk) {
      disabled = true;
    }
    btn.disabled = disabled;
  });
  const deployBtn = $("btn-deploy-selected");
  if (deployBtn) {
    const shipping = state.deployFinished === "running" || (state.busy && currentStepId() === "deploy" && state.deployFinished !== "failed");
    const doneOk = state.deployFinished === "success" || alreadyDeployedToCurrentTarget();
    const shipItems = gitShipItems();
    const validated = lastValidateMatches();
    if (shipping || doneOk) deployBtn.disabled = true;
    else if (shipItems.length) deployBtn.disabled = true;
    deployBtn.textContent = shipping && state.shipKind === "deploy" ? "Deploying…" : doneOk ? "Deployed" : "Deploy";
    const stateEl = $("deploy-btn-hint");
    if (stateEl) {
      if (shipping) {
        stateEl.textContent = state.shipKind === "validate" ? "Validating in the To org…" : "Waiting for Salesforce…";
        stateEl.dataset.state = "wait";
      } else if (doneOk) {
        stateEl.textContent = `Already sent to ${selectedOrg("target-org")?.label || "this org"}`;
        stateEl.dataset.state = "done";
      } else if (deployBtn.disabled) {
        stateEl.textContent = shipItems[0]?.text || reason || "Not ready yet";
        stateEl.dataset.state = "off";
      } else if (validated) {
        stateEl.textContent = `Validated in ${selectedOrg("target-org")?.label || "To org"} — Deploy when you are ready`;
        stateEl.dataset.state = "on";
      } else {
        stateEl.textContent = `Ready — validate or send to ${selectedOrg("target-org")?.label || "To org"}`;
        stateEl.dataset.state = "on";
      }
    }
    deployBtn.title = stateEl?.textContent || "";
    const validateBtn = $("btn-validate-selected");
    if (validateBtn) {
      if (shipping || doneOk) validateBtn.disabled = true;
      else if (shipItems.length) validateBtn.disabled = true;
      else validateBtn.disabled = false;
      validateBtn.textContent = shipping && state.shipKind === "validate" ? "Validating…" : validated ? "Validated" : "Validate in To org";
    }
  }
  const commentEl = $("comment");
  if (commentEl) {
    const showInvalid = !gitCommitMessage() && state.gitShipWarned;
    commentEl.classList.toggle("invalid", showInvalid);
    commentEl.setAttribute("aria-invalid", showInvalid ? "true" : "false");
  }
  const jiraEl = $("jira");
  if (jiraEl) {
    const showInvalid = !isJiraKey(jiraKeyValue()) && state.gitShipWarned;
    jiraEl.classList.toggle("invalid", showInvalid);
    jiraEl.setAttribute("aria-invalid", showInvalid ? "true" : "false");
  }
  syncCompareEntry();
  const retrieveFresh = hasFreshRetrieve() && state.retrieveOk;
  for (const id of ["btn-retrieve", "btn-retrieve-review"]) {
    const btn = $(id);
    if (!btn) continue;
    if (state.busy && currentStepId() === "review" && !retrieveFresh) {
      btn.textContent = "Retrieving…";
      continue;
    }
    if (id === "btn-retrieve-review") {
      btn.textContent = retrieveFresh ? "Already retrieved" : (state.retrieveSnapshot ? "Retrieve again" : "Retrieve from From org");
    } else {
      btn.textContent = retrieveFresh ? "Already retrieved" : (state.retrieveSnapshot ? "Retrieve again" : "Retrieve");
    }
    btn.title = retrieveFresh
      ? "Change members, type, or the From org to retrieve again."
      : "";
  }
  const retrieveHint = $("retrieve-btn-hint");
  if (retrieveHint) {
    if (retrieveFresh) {
      retrieveHint.textContent = "Snapshot matches this package and From org. Enter Jira and a comment, then Next to confirm deploy.";
      retrieveHint.dataset.state = "done";
    } else if (state.retrieveSnapshot) {
      retrieveHint.textContent = "Members, type, or From org changed — retrieve again before deploy.";
      retrieveHint.dataset.state = "off";
    } else {
      retrieveHint.textContent = "Click Retrieve when this package looks right. Then enter Jira and a comment.";
      retrieveHint.dataset.state = "off";
    }
  }
  const saveBtn = $("btn-save");
  if (saveBtn && useGitEnabled() && !state.busy) {
    const details = snapshotValidationItems();
    if (details.length) {
      saveBtn.disabled = true;
      saveBtn.title = details[0].text;
    } else {
      saveBtn.title = "Save this retrieve to the release repo.";
    }
  }
  const callout = $("deploy-reason");
  if (callout) {
    const blocking = reason && (reason.includes("target") || reason.includes("same org") || reason.includes("Detect"));
    callout.textContent = reason || `Ready to deploy ${selectedOrg("source-org")?.label} → ${selectedOrg("target-org")?.label}.`;
    callout.className = `callout ${reason ? "warn" : "ok"}`;
    callout.classList.toggle("hidden", !reason);
  }
  renderOrgPath();
  applyRetrieveLockUi();
  updateWizardNav();
  renderStepper();
  syncSetupButtons();
  renderPromotionPath();
}

function focusInView(id) {
  const el = $(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (typeof el.focus === "function" && !el.disabled) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function selectedRepoFormKey() {
  const provider = selectedProvider();
  const fromSelect = parseRepoInput(provider, $("gh-repo")?.value);
  const fromInput = parseRepoInput(provider, $("gh-repo-input")?.value.trim());
  const parsed = fromInput || fromSelect;
  if (!parsed?.repo) return "";
  const owner = parsed.owner || $("git-org")?.value.trim() || "";
  const project = parsed.project || "";
  const branch = $("gh-branch")?.value.trim() || "main";
  return `${provider}:${owner}/${project}/${parsed.repo}@${branch}`;
}

function savedRepoFormKey() {
  const c = hostCreds(state.settings);
  if (!c?.repo) return "";
  return `${c.provider}:${c.owner}/${c.project || ""}/${c.repo}@${c.branch || "main"}`;
}

function repoFormMatchesSaved() {
  const selected = selectedRepoFormKey();
  return Boolean(selected && isGitConfigured(state.settings) && selected === savedRepoFormKey());
}

function currentPipelineRecord() {
  const id = state.settings?.lastPipelineId || $("pipeline-select")?.value;
  return findPipeline(state.pipelines?.pipelines, id);
}

function renderReleaseRepoHeading() {
  const connected = isGitConfigured(state.settings) && useGitEnabled();
  if ($("git-setup-title")) {
    $("git-setup-title").textContent = connected ? repoLabel(state.settings) : "Release repo";
  }
  if ($("release-path-copy")) {
    $("release-path-copy").textContent = connected
      ? "This release repo stores Jira versions. From → To is the current hop. Add QA, Staging, and Prod so the same committed files can travel the path."
      : "This Git repo stores Jira versions. From and To are one hop (DEC → QA). Add Staging and Prod when those orgs are logged in — the same committed files travel the path.";
  }
}

function renderPromotionPath() {
  const wrap = $("promotion-path");
  const connected = isGitConfigured(state.settings) && useGitEnabled();
  wrap?.classList.toggle("hidden", !connected);
  const record = currentPipelineRecord();
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if ($("promotion-path-line")) {
    if (record) $("promotion-path-line").textContent = pipelinePathLabel(record);
    else if (source && target) $("promotion-path-line").textContent = `${source.label} → ${target.label}`;
    else $("promotion-path-line").textContent = "Set From and To, then Use this repo — OrgFlow saves that hop.";
  }
  const addSel = $("add-stage-org");
  const addBtn = $("btn-add-stage");
  if (addSel) {
    const stages = record ? stagesFromPipeline(record) : [];
    const candidates = state.orgs.filter((org) => !stages.some((stage) => sameOrg(stage, org)));
    addSel.innerHTML = candidates.length
      ? candidates.map((org) => `<option value="${escapeHtml(orgKey(org))}">${escapeHtml(org.label)}</option>`).join("")
      : `<option value="">All detected orgs are on this path</option>`;
    if (addBtn) addBtn.disabled = !candidates.length || !record;
  }
}

async function persistPipelineRecord(record, message) {
  const next = upsertPipeline(state.pipelines, record);
  await commitFiles({
    ...gitCreds(),
    files: [{ path: pipelinesFilePath(), base64: encodeUtf8Base64(JSON.stringify(next, null, 2) + "\n") }],
    message
  });
  state.pipelines = next;
  await savePipelineCache(state.settings, next);
  await saveSettings({
    lastPipelineId: record.id,
    lastSourceOrgId: $("source-org")?.value || orgKey(matchOrg(state.orgs, record.source)),
    lastTargetOrgId: $("target-org")?.value || orgKey(matchOrg(state.orgs, record.target)),
    setupComplete: true,
    useGit: true
  });
  state.settings = await loadSettings();
  applyPipeline(record);
  renderPipelines();
  updateActionState();
  return record;
}

async function ensureReleasePath() {
  if (!useGitEnabled() || !isGitConfigured(state.settings)) return null;
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if (!source || !target || orgKey(source) === orgKey(target)) return null;
  await loadPipelines();
  let record = findMatchingPipeline(state.pipelines.pipelines, source, target);
  if (record) {
    applyPipeline(record, { keepHop: true });
    await saveSettings({
      lastPipelineId: record.id,
      lastSourceOrgId: orgKey(source),
      lastTargetOrgId: orgKey(target),
      useGit: true
    });
    state.settings = await loadSettings();
    renderPipelines();
    return record;
  }
  const current = currentPipelineRecord();
  if (current) {
    const stages = stagesFromPipeline(current);
    const hasSource = stages.some((stage) => sameOrg(stage, source));
    const hasTarget = stages.some((stage) => sameOrg(stage, target));
    if (hasSource && !hasTarget) {
      record = appendStage(current, target);
      return persistPipelineRecord(record, `chore: add ${target.label} to promotion path`);
    }
  }
  record = createPipeline({
    source,
    target,
    testLevel: $("test-level")?.value || "NoTestRun",
    useGit: true
  });
  return persistPipelineRecord(record, `chore: save promotion path ${record.name}`);
}

function advancePromotionHop() {
  const hop = nextHopAfter(currentPipelineRecord(), selectedOrg("target-org"));
  if (!hop) return false;
  const nextTarget = matchOrg(state.orgs, hop.target);
  const nextSource = matchOrg(state.orgs, hop.source);
  if (!nextTarget || !nextSource) {
    setStatus(`Next hop is ${hop.source.label} → ${hop.target.label}. Log into ${hop.target.label}, then detect orgs.`, "error");
    return true;
  }
  state.promotingHop = true;
  $("source-org").value = orgKey(nextSource);
  $("target-org").value = orgKey(nextTarget);
  state.deployFinished = "";
  const record = currentPipelineRecord();
  if (record) {
    record.hopIndex = hop.hopIndex;
    record.source = hop.source;
    record.target = hop.target;
  }
  saveSettings({
    lastSourceOrgId: orgKey(nextSource),
    lastTargetOrgId: orgKey(nextTarget),
    lastPipelineId: record?.id || state.settings.lastPipelineId
  }).then(async () => {
    state.settings = await loadSettings();
    renderPipelines();
    updateActionState();
  });
  setStatus(`Next hop ${nextSource.label} → ${nextTarget.label}. Deploy the same snapshot — do not retrieve again.`, "ok");
  log(`Promotion hop: ${nextSource.label} → ${nextTarget.label}. Same Jira files travel; retrieve stays frozen.`);
  updateActionState();
  return true;
}

async function addOrgToPromotionPath() {
  requireGithub();
  const key = $("add-stage-org")?.value;
  const org = state.orgs.find((item) => orgKey(item) === key);
  if (!org) throw new Error("Detect orgs and pick the next environment (QA, Staging, or Prod).");
  let record = currentPipelineRecord() || await ensureReleasePath();
  if (!record) throw new Error("Set From and To, then Use this repo so OrgFlow can start the promotion path.");
  record = appendStage(record, org);
  await persistPipelineRecord(record, `chore: add ${org.label} to promotion path`);
  log(`Promotion path is now ${pipelinePathLabel(record)}.`);
  setStatus(`Path: ${pipelinePathLabel(record)}. Same Jira snapshot can travel each hop.`, "ok");
}

function pipelineIsInUse() {
  const id = $("pipeline-select")?.value;
  if (!id) return false;
  if (state.settings?.lastPipelineId !== id) return false;
  const record = findPipeline(state.pipelines?.pipelines, id);
  if (!record) return false;
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if (!source || !target) return false;
  const matchedSource = matchOrg(state.orgs, record.source);
  const matchedTarget = matchOrg(state.orgs, record.target);
  return matchedSource && matchedTarget && orgKey(source) === orgKey(matchedSource) && orgKey(target) === orgKey(matchedTarget);
}

function pipelineSaveIsDirty() {
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if (!source || !target) return false;
  const name = $("pipeline-name")?.value.trim();
  const id = $("pipeline-select")?.value;
  const record = findPipeline(state.pipelines?.pipelines, id);
  if (!record) return true;
  const matchedSource = matchOrg(state.orgs, record.source);
  const matchedTarget = matchOrg(state.orgs, record.target);
  const samePath = matchedSource && matchedTarget
    && orgKey(source) === orgKey(matchedSource)
    && orgKey(target) === orgKey(matchedTarget);
  const sameName = (name || record.name) === record.name;
  return !(samePath && sameName);
}

function markActionButton(btn, { done, idleLabel, doneLabel, canRun }) {
  if (!btn) return;
  if (!state.busy) btn.disabled = !canRun || done;
  btn.textContent = done ? doneLabel : idleLabel;
  btn.classList.toggle("action-done", done);
}

function syncSetupButtons() {
  const connected = repoFormMatchesSaved();
  markActionButton($("btn-save-repo"), {
    done: connected,
    idleLabel: "Use this repo",
    doneLabel: "Repo connected",
    canRun: Boolean(selectedRepoFormKey())
  });
  if ($("repo-btn-hint")) {
    $("repo-btn-hint").textContent = connected
      ? "Connected. Change repo or branch to use a different one."
      : "Pick a repo, then Use this repo.";
    $("repo-btn-hint").dataset.state = connected ? "done" : "off";
  }
  const pipeId = $("pipeline-select")?.value;
  const inUse = pipelineIsInUse();
  markActionButton($("btn-use-pipeline"), {
    done: inUse,
    idleLabel: "Use this pipeline",
    doneLabel: "Pipeline in use",
    canRun: Boolean(pipeId)
  });
  const canSavePipe = pipelineSaveIsDirty();
  markActionButton($("btn-save-pipeline"), {
    done: Boolean(pipeId) && !canSavePipe && Boolean(selectedOrg("source-org") && selectedOrg("target-org")),
    idleLabel: "Save pipeline to repo",
    doneLabel: "Pipeline saved",
    canRun: canSavePipe
  });
  const token = $("gh-token")?.value.trim() || "";
  const signedIn = Boolean(state.githubUser?.login) && token === (hostCreds(state.settings).token || "");
  markActionButton($("btn-connect-github"), {
    done: signedIn && Boolean(state.repos?.length),
    idleLabel: providerMeta(selectedProvider()).connectLabel,
    doneLabel: `Connected as ${state.githubUser?.login || ""}`.trim(),
    canRun: Boolean(token)
  });
  const inspect = state.gitLayout;
  const canCreate = Boolean(
    isGitConfigured(state.settings)
    && useGitEnabled()
    && canScaffold(inspect)
    && !hasSalesforceProject(inspect)
  );
  const createBtn = $("btn-create-sf-layout");
  if (createBtn) {
    createBtn.classList.toggle("hidden", !canCreate);
    createBtn.classList.remove("accent", "secondary", "action-done");
    createBtn.textContent = "Add folders";
    if (!state.busy) createBtn.disabled = !canCreate;
  }
}

function maybeAdvanceFromStart() {
  if (state.stepIndex !== 0 || state.showingVersions) return;
  if (!pathReady()) return;
  if (useGitEnabled() && !isGitConfigured(state.settings)) {
    $("git-setup-block")?.scrollIntoView({ block: "start", behavior: "smooth" });
    setStatus("From and To are set. Connect a release repo, or switch to Local snapshots, then click Next.", "ok");
    return;
  }
  $("snapshots-block")?.scrollIntoView({ block: "start", behavior: "smooth" });
  setStatus("From and To are set. Choose Local snapshots or Release repo, then click Next.", "ok");
}

function renderOrgPath() {
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  const caption = $("path-caption");
  const sub = $("path-sub");
  const bar = $("org-path");
  if ($("source-org-meta")) {
    $("source-org-meta").textContent = source
      ? orgKind(source)
      : "Where you built the change";
  }
  if ($("target-org-meta")) {
    $("target-org-meta").textContent = target
      ? orgKind(target)
      : "Where it should go (QA, UAT, prod)";
  }
  const ready = Boolean(source && target && orgKey(source) !== orgKey(target));
  bar?.classList.toggle("incomplete", !ready);
  bar?.classList.toggle("ready", ready);
  if (caption) {
    caption.textContent = ready
      ? `${source.label} → ${target.label}`
      : source && target
        ? "Source and target must be different orgs"
        : "Select source and target orgs";
  }
  if (sub) {
    const stepId = currentStepId();
    sub.textContent = ready
      ? (stepId === "start"
        ? "From and To are set. Choose Local snapshots or Release repo on Start, then Next."
        : `${orgKind(source)} → ${orgKind(target)}`)
      : "Next stays off until From and To are different Salesforce orgs.";
  }
  updatePipelinePathCopy();
}

function pathReady() {
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  return Boolean(source && target && orgKey(source) !== orgKey(target));
}

function currentStep() {
  return STEPS[state.stepIndex] || STEPS[0];
}

function currentStepId() {
  return state.showingVersions ? "versions" : currentStep().id;
}

function farthestStep() {
  if (!pathReady()) return 0;
  if (useGitEnabled() && !isGitConfigured(state.settings)) return 0;
  if (!memberCount(state.packageTypes)) return stepIndexById("package");
  if (!state.reviewSeen && state.stepIndex < stepIndexById("review")) return stepIndexById("package");
  if (!hasFreshRetrieve() || !state.retrieveOk) return stepIndexById("review");
  if (snapshotValidationItems().length) return stepIndexById("review");
  return stepIndexById("deploy");
}

function canAdvanceTo(index) {
  if (index < 0 || index >= STEPS.length) return false;
  if (index <= state.stepIndex) return true;
  return index <= farthestStep();
}

function leaveReason(index) {
  if (index === 0 && !pathReady()) {
    const source = selectedOrg("source-org");
    const target = selectedOrg("target-org");
    if (!source || !target) return "Set From and To in the path bar, then Next.";
    return "From and To must be different orgs before you pick configuration.";
  }
  if (index === 0 && useGitEnabled() && !isGitConfigured(state.settings)) {
    return "Sharing is on. Choose a repo and click Use this repo. Selecting it in the list, or saving a pipeline, does not connect Git yet.";
  }
  if (index === stepIndexById("package") && !memberCount(state.packageTypes)) {
    return "Pick a type and tick at least one member, then Next to retrieve.";
  }
  if (index === stepIndexById("review") && (!hasFreshRetrieve() || !state.retrieveOk)) {
    if (!hasFreshRetrieve()) return retrieveBlockReason();
    return "Retrieve must succeed before deploy. The result panel shows why it failed.";
  }
  if (index === stepIndexById("review")) {
    const details = snapshotValidationItems();
    if (details.length) return details[0].text;
  }
  return "";
}

function stepBlockReason(index) {
  if (canAdvanceTo(index)) return "";
  if (index > 0 && !pathReady()) return leaveReason(0);
  if (index > stepIndexById("package") && !memberCount(state.packageTypes)) return leaveReason(stepIndexById("package"));
  if (index > stepIndexById("review")) return retrieveBlockReason() || "Retrieve the package first, then you can deploy.";
  return "Finish the current step before skipping ahead.";
}

function updatePickCopy() {
  const stepId = currentStepId();
  const type = typesForPicker().find((t) => t.name === state.activeType);
  const total = STEPS.length;
  if ($("pick-kicker")) $("pick-kicker").textContent = `Step ${state.stepIndex + 1} of ${total}`;
  if (stepId === "package") {
    if ($("pick-heading")) $("pick-heading").textContent = type ? `Package · ${type.label}` : "Build the package";
    if ($("pick-lead")) {
      $("pick-lead").textContent = type
        ? "Tick members below. Pick another type above to add more (fields, then layouts, then flows…). Back from Retrieve returns here so you can add more."
        : "Pick a type (Custom Field, Layout, Flow…), then tick the members for this deploy.";
    }
  } else if (stepId === "review") {
    if ($("pick-heading")) $("pick-heading").textContent = "Retrieve from the From org";
    if ($("pick-lead")) {
      $("pick-lead").textContent = "Click Retrieve when the package is complete. Then enter Jira and a comment — both are required before Confirm deploy. Back returns to Package to add members.";
    }
  }
  if ($("header-sub")) {
    const labels = {
      start: "Step 1 · Connect orgs",
      package: "Step 2 · Build the package",
      review: "Step 3 · Retrieve",
      deploy: "Step 4 · Confirm deploy",
      versions: "Saved versions"
    };
    $("header-sub").textContent = labels[stepId] || "Config sandbox → other orgs";
  }
}

function renderStepper() {
  const el = $("stepper");
  if (!el) return;
  const max = farthestStep();
  const current = state.showingVersions ? -1 : state.stepIndex;
  el.innerHTML = STEPS.map((step, i) => {
    const active = i === current ? "active" : "";
    const done = !state.showingVersions && i < state.stepIndex ? "done" : "";
    const allowed = i <= Math.max(max, state.stepIndex);
    return `<button type="button" class="step ${active} ${done}" data-step="${i}" ${allowed ? "" : "disabled"} role="tab" aria-selected="${i === current ? "true" : "false"}" aria-current="${i === current ? "step" : "false"}">
      <span>${i + 1}</span>${escapeHtml(step.label)}
    </button>`;
  }).join("");
}

function updateWizardNav() {
  const back = $("btn-back");
  const next = $("btn-next");
  const hint = $("wizard-hint");
  if (!back || !next || !hint) return;
  if (state.showingVersions) {
    back.disabled = false;
    next.disabled = true;
    const toDeploy = state.versionsReturnStep === stepIndexById("deploy");
    back.textContent = toDeploy ? "Back to deploy" : "Back to retrieve";
    next.classList.add("hidden");
    next.textContent = "Next";
    hint.textContent = toDeploy
      ? "Compare and restore files, then go back. Prefer doing this on Retrieve before the next deploy."
      : "Compare and restore files here, then Back to retrieve and Deploy if the package looks right.";
    return;
  }
  const last = state.stepIndex >= STEPS.length - 1;
  if (last && (state.deployFinished === "success" || alreadyDeployedToCurrentTarget())) {
    const hop = nextHopAfter(currentPipelineRecord(), selectedOrg("target-org"));
    back.disabled = false;
    back.textContent = "New package";
    if (hop) {
      const target = matchOrg(state.orgs, hop.target);
      next.classList.toggle("hidden", !target);
      next.disabled = !target || state.busy;
      next.textContent = target ? `Next hop: ${hop.target.label || target.label}` : "Next";
      hint.textContent = target
        ? `Same Jira snapshot can travel ${hop.source.label} → ${hop.target.label}. Deploy again — do not retrieve.`
        : `Next hop is ${hop.target.label}. Log into that org, then detect orgs.`;
      return;
    }
    next.classList.add("hidden");
    next.disabled = true;
    next.textContent = "Next";
    hint.textContent = "New package starts over from Start. Compare retrieved files on Retrieve before the next deploy.";
    return;
  }
  back.disabled = state.stepIndex === 0;
  back.textContent = "Back";
  const reason = leaveReason(state.stepIndex);
  next.disabled = last || Boolean(reason) || state.busy;
  const labels = ["Next: package", "Next: retrieve", "Next: confirm", "Deploy"];
  next.textContent = labels[state.stepIndex] || "Next";
  next.classList.toggle("hidden", last);
  if (reason) {
    hint.textContent = reason;
  } else if (last) {
    hint.textContent = state.busy ? "Waiting for Salesforce…" : (deployBlockReason() || `Ready to send this package to ${selectedOrg("target-org")?.label || "the To org"}.`);
  } else if (state.stepIndex === 0) {
    hint.textContent = pathReady()
      ? "Choose Local snapshots or Release repo, then Next."
      : `Step 1 of ${STEPS.length} · ${currentStep().label}`;
  } else if (state.stepIndex === stepIndexById("package")) {
    hint.textContent = "Pick a type or tap something you just changed, then Next.";
  } else if (state.stepIndex === stepIndexById("review")) {
    hint.textContent = hasFreshRetrieve() && state.retrieveOk
      ? "Retrieve succeeded. Enter Jira and a comment, then Next to confirm deploy — or Back to add members."
      : "Click Retrieve when the package is complete. Then enter Jira and a comment.";
  } else {
    hint.textContent = `Step ${state.stepIndex + 1} of ${STEPS.length} · ${currentStep().label}`;
  }
}

function applyStepUi() {
  const names = ["start", "components", "ship", "versions"];
  names.forEach((name) => $(`view-${name}`)?.classList.toggle("active", false));
  if (state.showingVersions) {
    $("view-versions")?.classList.add("active");
    document.body.dataset.step = "versions";
    updatePickCopy();
    syncOutcomePanel();
    renderStepper();
    updateWizardNav();
    updateHeaderStatus();
    syncCompareEntry();
    renderGitUi();
    updateActionState();
    return;
  }
  const step = currentStep();
  document.body.dataset.step = step.id;
  $(`view-${step.view}`)?.classList.add("active");
  if (step.view === "components") {
    if (step.id === "review") switchSubtab(state.xmlReview ? "xml" : "review");
    else {
      state.xmlReview = false;
      switchSubtab("pick");
    }
  }
  if (step.id === "package" && selectedOrg("source-org") && !typesForPicker().some((t) => t.fromOrg)) {
    setTimeout(() => run(loadOrgTypes), 0);
  }
  if (step.id === "package") setTimeout(() => warmRecentHints(), 0);
  if (step.id === "deploy") renderDeployManifest();
  renderGitUi();
  updatePickCopy();
  syncTypeChosenUi();
  renderPackageHints();
  syncOutcomePanel();
  renderStepper();
  updateWizardNav();
  updateHeaderStatus();
  syncCompareEntry();
  updateActionState();
}

function goStep(index, { force = false } = {}) {
  if (state.showingVersions && index >= 0) state.showingVersions = false;
  if (!force && !canAdvanceTo(index)) {
    setStatus(stepBlockReason(index), "error");
    renderStepper();
    updateWizardNav();
    return;
  }
  if (STEPS[index]?.id === "review") {
    state.reviewSeen = true;
    if (!hasFreshRetrieve()) state.autoRetrieveAttempted = false;
  }
  if (STEPS[index]?.id === "package") state.selectionFrozen = false;
  state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
  applyStepUi();
}

function wizardBack() {
  if (state.showingVersions) {
    const returnTo = Number.isInteger(state.versionsReturnStep) ? state.versionsReturnStep : stepIndexById("review");
    state.showingVersions = false;
    goStep(Math.min(Math.max(returnTo, 0), STEPS.length - 1), { force: true });
    return;
  }
  if (state.stepIndex === stepIndexById("deploy") && (state.deployFinished === "success" || alreadyDeployedToCurrentTarget())) {
    run(resetForNewPackage);
    return;
  }
  if (state.stepIndex === 0) return;
  goStep(state.stepIndex - 1, { force: true });
}

function wizardNext() {
  if (state.showingVersions) return;
  if (state.stepIndex === stepIndexById("deploy") && (state.deployFinished === "success" || alreadyDeployedToCurrentTarget())) {
    if (advancePromotionHop()) return;
  }
  const reason = leaveReason(state.stepIndex);
  if (reason) {
    if (state.stepIndex === stepIndexById("review")) state.gitShipWarned = true;
    setStatus(reason, "error");
    updateActionState();
    return;
  }
  if (state.stepIndex >= STEPS.length - 1) return;
  goStep(state.stepIndex + 1, { force: true });
}

function showVersions() {
  state.showingVersions = true;
  applyStepUi();
}

function syncCompareEntry() {
  const btn = $("open-versions");
  if (!btn) return;
  const step = currentStepId();
  const onRetrieve = state.showingVersions || step === "review" || step === "versions";
  btn.classList.toggle("hidden", !onRetrieve);
  btn.classList.toggle("selected", Boolean(state.showingVersions));
  const compareBtn = $("btn-compare-before-deploy");
  if (compareBtn) {
    const ready = hasFreshRetrieve();
    compareBtn.disabled = state.busy;
    compareBtn.title = ready
      ? "Open saved versions to diff this retrieve before Deploy."
      : "Retrieve first, then compare with a saved version before you deploy.";
  }
}

function updatePipelinePathCopy() {
  const el = $("pipeline-path-copy");
  if (!el) return;
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  el.textContent = source && target
    ? `Uses From and To in the deployment path above: ${source.label} → ${target.label}.`
    : "Uses From and To in the deployment path above. There is no second org picker on this page.";
}

async function openVersionsPanel() {
  state.versionsReturnStep = state.stepIndex === stepIndexById("deploy") ? stepIndexById("deploy") : stepIndexById("review");
  await loadVersionStore();
  renderVersions();
  showVersions();
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
  const hadFiles = Boolean(state.stagedFiles?.length);
  state.stagedFiles = null;
  state.activeFilePath = "";
  state.selectionFrozen = false;
  state.deployFinished = "";
  state.retrieveOk = false;
  state.lastDeploy = null;
  state.lastValidate = null;
  state.shipKind = "";
  state.autoRetrieveAttempted = false;
  state.lastSaved = null;
  $("file-editor-wrap")?.classList.add("hidden");
  renderFileList();
  if (hadFiles) {
    setStatus("From org or members changed. Retrieve again before deploy.", "error");
    if (state.stepIndex === stepIndexById("deploy")) goStep(stepIndexById("review"), { force: true });
  }
}

async function resetForNewPackage() {
  state.packageTypes = [];
  state.typeChosen = false;
  state.activeType = "";
  state.xmlDirty = false;
  state.membersCache = {};
  state.recentWarmGen += 1;
  state.specifiedTests = [];
  state.stagedFiles = null;
  state.activeFilePath = "";
  state.selectionFrozen = false;
  state.retrieveSnapshot = null;
  state.retrieveOk = false;
  state.deployFinished = "";
  state.lastDeploy = null;
  state.lastValidate = null;
  state.shipKind = "";
  state.autoRetrieveAttempted = false;
  state.lastSaved = null;
  state.gitShipWarned = false;
  state.reviewSeen = false;
  state.showingVersions = false;
  state.versionsReturnStep = stepIndexById("review");
  $("file-editor-wrap")?.classList.add("hidden");
  if ($("comment")) $("comment").value = "";
  if ($("jira")) $("jira").value = "";
  if ($("package-xml")) $("package-xml").value = "";
  await persistPackage();
  renderFileList();
  if ($("outcome-badge")) $("outcome-badge").textContent = "—";
  if ($("outcome-title")) $("outcome-title").textContent = "Result";
  if ($("outcome-body")) $("outcome-body").innerHTML = `<p class="muted">No result yet.</p>`;
  $("outcome-head")?.classList.remove("ok", "err", "wait");
  applyRetrieveLockUi();
  renderPackageUi();
  renderTypePicker();
  goStep(0, { force: true });
  setStatus("New package. From and To stay set. Pick a type when you are ready.", "ok");
}

function useGitEnabled() {
  return Boolean($("use-git")?.checked);
}

function gitCommitMessage() {
  return $("comment")?.value?.trim() || "";
}

function jiraKeyValue() {
  return $("jira")?.value?.trim() || "";
}

function snapshotValidationItems() {
  return snapshotDetailsItems({
    jiraKey: jiraKeyValue(),
    comment: gitCommitMessage()
  });
}

function gitShipItems() {
  return gitShipValidationItems({
    gitEnabled: useGitEnabled(),
    commitMessage: gitCommitMessage(),
    gitConfigured: isGitConfigured(state.settings),
    hostLabel: providerMeta(providerId(state.settings)).label,
    jiraKey: jiraKeyValue()
  });
}

function localError(message, extra = {}) {
  const err = new Error(message);
  err.local = true;
  Object.assign(err, extra);
  return err;
}

function requireGitShipReady(operation = "deploy") {
  const items = gitShipItems();
  if (!items.length) return gitCommitMessage();
  state.gitShipWarned = true;
  throw localError(items.map((item) => item.text).join(" "), {
    validationItems: items,
    focus: items.some((item) => item.kicker === "Jira key") ? "jira" : (items.some((item) => item.kicker === "Comment") ? "comment" : ""),
    operation
  });
}

function requireGitCommitMessage() {
  return requireGitShipReady("deploy");
}

function showLocalFailure(operation, err) {
  state.gitShipWarned = true;
  const items = err.validationItems?.length
    ? err.validationItems
    : [{ kind: "error", text: err.message || String(err) }];
  showOutcome({
    success: false,
    status: "Blocked",
    local: true,
    operation,
    items
  });
  if (err.focus === "jira" || items.some((item) => item.kicker === "Jira key")) {
    $("jira")?.focus();
  } else if (err.focus === "comment" || (useGitEnabled() && !gitCommitMessage())) {
    $("comment")?.focus();
  }
  updateActionState();
}

async function persistPackage() {
  state.packageTypes = normalizePackageTypes(state.packageTypes);
  await saveSettings({ packageTypes: state.packageTypes, specifiedTests: state.specifiedTests });
  state.settings = await loadSettings();
  if (!state.xmlDirty) $("package-xml").value = currentXml();
  renderPackageUi();
}

function renderPackageUi() {
  const summary = packageSummary(state.packageTypes);
  const count = memberCount(state.packageTypes);
  $("package-summary-body").textContent = count
    ? `${count} selected · ${summary}`
    : "Nothing selected yet — pick fields, layouts, flows, permission sets… on Components.";
  $("package-count").textContent = String(count);
  $("selected-package").innerHTML = count
    ? renderCompactPackageHtml()
    : `<p class="muted">Nothing selected yet. Tick members below. Retrieve waits until you click Next, then Retrieve.</p>`;
  $("xml-status").textContent = state.xmlDirty ? "XML edited — click Apply to use it." : "XML matches the picker.";
  renderMembers();
  renderInspector();
  renderDeployManifest();
  renderTestRunner();
  renderGitUi();
  renderPackageHints();
  updateActionState();
}

function renderCompactPackageHtml() {
  const columns = categoryColumns(state.packageTypes);
  return columns
    .map((col) => {
      const shown = col.members.slice(0, 40);
      const items = shown.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
      const more = col.members.length > 40
        ? `<li>… ${col.members.length - 40} more</li>`
        : "";
      return `<div class="package-preview-type"><strong>${escapeHtml(col.type)} <span class="badge">${col.count}</span></strong><ul>${items}${more}</ul></div>`;
    })
    .join("");
}

function renderInspector() {
  const count = memberCount(state.packageTypes);
  $("inspector-count").textContent = String(count);
  const query = $("inspector-filter")?.value || "";
  const columns = filterCategoryColumns(categoryColumns(state.packageTypes), query);
  const table = $("category-table");
  if (!count) {
    table.innerHTML = `<div class="empty">Tick members on the left. They appear here immediately, grouped by type (and by object for fields).</div>`;
  } else if (!columns.length) {
    table.innerHTML = `<div class="empty">No selected members match that filter.</div>`;
  } else {
    table.innerHTML = columns
      .map((col) => {
        const groups = col.groups
          .map((group) => {
            const heading = group.label !== col.type ? `<h4>${escapeHtml(group.label)} (${group.count})</h4>` : "";
            const items = group.members.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
            return `<div class="cat-group">${heading}<ul>${items}</ul></div>`;
          })
          .join("");
        return `<section class="cat-col"><h3><span>${escapeHtml(col.type)}</span><span class="badge">${col.count}</span></h3>${groups}</section>`;
      })
      .join("");
  }
  $("inspector-xml").textContent = currentXml();
  document.querySelectorAll(".insp-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.insp === state.inspectorView);
  });
  $("insp-categories").classList.toggle("hidden", state.inspectorView !== "categories");
  $("insp-xml").classList.toggle("hidden", state.inspectorView !== "xml");
  const gitOn = useGitEnabled();
  const repo = isGitConfigured(state.settings) ? repoLabel(state.settings) : "no repo connected";
  $("inspector-git").textContent = gitOn
    ? `Jira versions in the release repo · ${repo}`
    : "Jira versions in Local snapshots · same snapshot for QA then prod";
  const tests = state.specifiedTests;
  $("inspector-tests").textContent = tests.length
    ? `${tests.length} specified test${tests.length === 1 ? "" : "s"}: ${tests.slice(0, 8).join(", ")}${tests.length > 8 ? "…" : ""}`
    : packageHasApex(state.packageTypes)
      ? "Apex is in this package. Salesforce will report test errors in the result panel."
      : "No specified tests (config-only is fine).";
}

function syncOutcomePanel() {
  const step = currentStepId();
  $("outcome-panel")?.classList.toggle("hidden", step !== "review");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    /* ignore */
  }
  return "";
}

function outcomeItemHtml(item) {
  if (item.kind === "component") {
    return `<article class="outcome-item err">
      <div class="outcome-kicker">${escapeHtml(item.type || "Component")}</div>
      <strong>${escapeHtml(item.name || "(unnamed)")}</strong>
      <p>${escapeHtml(item.problem)}</p>
      ${item.where ? `<p class="muted">${escapeHtml(item.where)}</p>` : ""}
    </article>`;
  }
  if (item.kind === "test") {
    return `<article class="outcome-item err">
      <div class="outcome-kicker">Apex test</div>
      <strong>${escapeHtml(item.name || "Test")}</strong>
      <p>${escapeHtml(item.problem)}</p>
    </article>`;
  }
  if (item.kind === "success") {
    return `<article class="outcome-item ok">
      <div class="outcome-kicker">${escapeHtml(item.type || "Component")}</div>
      <strong>${escapeHtml(item.name)}</strong>
    </article>`;
  }
  return `<article class="outcome-item ${item.kind === "info" ? "info" : "err"}">
      ${item.kicker ? `<div class="outcome-kicker">${escapeHtml(item.kicker)}</div>` : ""}
      <p>${escapeHtml(item.text)}</p>
      ${item.detail ? `<pre class="git-tree">${escapeHtml(item.detail)}</pre>` : ""}
      ${safeHttpUrl(item.url) ? `<p><a href="${escapeHtml(safeHttpUrl(item.url))}" target="_blank" rel="noreferrer">${escapeHtml(item.linkLabel || "Open in Git")}</a></p>` : ""}
    </article>`;
}

function showOutcome(result) {
  const formatted = formatOperationOutcome(result);
  const titles = {
    retrieve: "Retrieve result",
    deploy: "Deploy result",
    validate: "Validate result",
    save: "Save to repo"
  };
  const operation = titles[result?.operation] || (result?.local ? "Couldn't continue" : "Deploy result");
  const sub = formatted.ok === true
    ? (result?.operation === "retrieve"
      ? "Files are ready. Enter Jira and a comment, then Next to confirm deploy."
      : result?.operation === "validate"
        ? "Salesforce accepted a dry run. Nothing was saved in the To org. Deploy when you are ready."
        : result?.gitRecord?.ok === false
        ? "Salesforce accepted the package. The snapshot was not written to Git — see the release repo below."
        : result?.gitRecord?.ok
          ? "Salesforce accepted this package. Snapshot files are under .orgflow/releases/… — not the repo root."
          : result?.operation === "save"
            ? "Snapshot is in the release repo under .orgflow/releases/…"
            : "Salesforce accepted this package.")
    : formatted.ok === null
      ? "Salesforce is still working. The button stays off until this finishes."
      : result?.local
        ? "OrgFlow blocked this before Salesforce. Each item below is what to fix."
        : "Salesforce rejected this request. Each item below is why it failed.";
  const html = formatted.items.length
    ? formatted.items.map(outcomeItemHtml).join("")
    : `<p class="muted">No messages from Salesforce.</p>`;
  const onDeploy = result?.operation === "deploy" || result?.operation === "save" || result?.operation === "validate";
  if (!onDeploy) {
    const panel = $("outcome-panel");
    panel?.classList.remove("hidden");
    if ($("outcome-title")) $("outcome-title").textContent = operation;
    if ($("outcome-badge")) $("outcome-badge").textContent = formatted.title;
    const head = $("outcome-head");
    if (head) {
      head.classList.toggle("ok", formatted.ok === true);
      head.classList.toggle("err", formatted.ok === false);
      head.classList.toggle("wait", formatted.ok === null);
    }
    if ($("outcome-sub")) $("outcome-sub").textContent = sub;
    if ($("outcome-body")) $("outcome-body").innerHTML = html;
  }
  if ($("deploy-result-title")) $("deploy-result-title").textContent = onDeploy ? operation : "Deploy result";
  if ($("deploy-result-badge")) $("deploy-result-badge").textContent = onDeploy ? formatted.title : "—";
  const deployHead = $("deploy-result-head");
  if (deployHead) {
    deployHead.classList.toggle("ok", onDeploy && formatted.ok === true);
    deployHead.classList.toggle("err", onDeploy && formatted.ok === false);
    deployHead.classList.toggle("wait", onDeploy && formatted.ok === null);
  }
  if ($("deploy-result-sub")) {
    $("deploy-result-sub").textContent = onDeploy
      ? sub
      : "Nothing sent yet. Confirm the org names and component list, then Deploy.";
  }
  if ($("deploy-result-body")) {
    $("deploy-result-body").innerHTML = onDeploy
      ? html
      : `<p class="muted">The deploy result will show here after you send the package.</p>`;
  }
}

function renderDeployManifest() {
  const el = $("deploy-manifest");
  const countEl = $("package-count-deploy");
  const pathLine = $("deploy-path-line");
  const count = memberCount(state.packageTypes);
  if (countEl) countEl.textContent = String(count);
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if (pathLine) {
    pathLine.textContent = source && target
      ? `Confirm this package from ${source.label} to ${target.label}.`
      : "Set From and To in the path bar.";
  }
  const jiraEl = $("deploy-confirm-jira");
  const commentEl = $("deploy-confirm-comment");
  const destEl = $("deploy-confirm-dest");
  if (jiraEl) jiraEl.textContent = isJiraKey(jiraKeyValue()) ? jiraKeyValue().toUpperCase() : "Enter on Retrieve";
  if (commentEl) commentEl.textContent = gitCommitMessage() || "Enter on Retrieve";
  if (destEl) {
    destEl.textContent = useGitEnabled() && isGitConfigured(state.settings)
      ? repoLabel(state.settings)
      : "Local snapshots";
  }
  if (!el) return;
  const columns = categoryColumns(state.packageTypes);
  if (!count) {
    el.innerHTML = `<p class="muted">No components. Use Back to tick members, then retrieve.</p>`;
    return;
  }
  el.innerHTML = columns
    .map((col) => {
      const members = col.members.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
      return `<section class="cat-col"><h3><span>${escapeHtml(col.type)}</span><span class="badge">${col.count}</span></h3><ul>${members}</ul></section>`;
    })
    .join("");
}

function renderGitUi() {
  const on = useGitEnabled();
  const connected = isGitConfigured(state.settings);
  const host = providerMeta(providerId(state.settings)).label;
  $("versions-hint").textContent = on
    ? connected
      ? `Compare this retrieve with a saved snapshot before Deploy. Shared Jira versions are in ${repoLabel(state.settings)}.`
      : `${host} is on — connect a repo on Start so the team can reuse versions. Compare before you deploy.`
    : "Compare this retrieve with a saved snapshot before Deploy. Jira versions stay in Local snapshots unless you connect a release repo.";
  $("git-status").textContent = on
    ? connected
      ? `Saving versions to ${repoLabel(state.settings)}.`
      : (($("gh-repo")?.value || $("gh-repo-input")?.value.trim())
        ? "A repo is selected in the list, but it is not connected yet. Click Use this repo."
        : `Connect a ${host} repo on Start. Until then, versions stay in Local snapshots.`)
    : "Saving versions in Local snapshots (no token).";
  $("git-hint").textContent = on
    ? "Each Jira save creates v1, v2, … in the repo so QA/UAT/prod get the same snapshot."
    : "Each Jira save creates v1, v2, … in Local snapshots. A release repo is optional sharing so QA and prod reuse the same snapshot.";
  $("git-setup-block")?.classList.toggle("hidden", !on);
  document.body.classList.toggle("mode-simple", !on);
  document.body.classList.toggle("mode-git", on);
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.mode === (on ? "git" : "simple"));
  });
  $("mode-status").textContent = on
    ? connected
      ? `Sharing in ${repoLabel(state.settings)}${currentPipelineRecord() ? ` · ${pipelinePathLabel(currentPipelineRecord())}` : ""}.`
      : `Sharing is on — ${host}. After Connect, pick a repo and click Use this repo. OrgFlow saves From → To as the promotion path.`
    : "Keeping versions on this Chrome profile. Detect orgs, set From and To, then Next.";
  const showGitShip = currentStepId() === "review";
  $("git-ship-panel")?.classList.toggle("hidden", !showGitShip);
  if ($("git-ship-hint")) {
    $("git-ship-hint").textContent = useGitEnabled()
      ? `Jira key and comment are required here before Confirm deploy. The comment is also the ${host} commit message.`
      : "Jira key and comment are required here before Confirm deploy.";
  }
  fillGitHostUi();
  renderPipelines();
  renderGitLayoutCard();
  if ($("repo-pick-hint")) $("repo-pick-hint").classList.toggle("hidden", connected);
}

function selectedProvider() {
  return $("git-provider")?.value || providerId(state.settings) || "github";
}

function fillGitHostUi() {
  const provider = selectedProvider();
  const meta = providerMeta(provider);
  const linkHref = tokenUrl(provider, {
    baseUrl: $("git-base-url")?.value.trim() || "https://gitlab.com",
    owner: $("git-org")?.value.trim() || ""
  });
  if ($("git-help-kicker")) $("git-help-kicker").textContent = `Help · connecting ${meta.label}`;
  if ($("git-help-preview")) {
    $("git-help-preview").innerHTML = [
      `<li>Create a personal access token on ${escapeHtml(meta.label)}.</li>`,
      `<li>Paste it below and click ${escapeHtml(meta.connectLabel)}.</li>`,
      "<li>Pick a repo, then click Use this repo.</li>"
    ].join("");
  }
  if ($("git-help-title")) $("git-help-title").textContent = `More detail for ${meta.label}`;
  if ($("git-help-steps")) {
    const link = `<li>Create a token: <a href="${escapeHtml(linkHref)}" target="_blank" rel="noreferrer">${escapeHtml(linkHref.replace(/^https?:\/\//, ""))}</a></li>`;
    $("git-help-steps").innerHTML = link + meta.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  }
  $("git-base-url-wrap")?.classList.toggle("hidden", !meta.needsBaseUrl);
  $("git-org-wrap")?.classList.toggle("hidden", !meta.needsOrg);
  const tokenLabel = $("git-token-label");
  if (tokenLabel && $("gh-token")) {
    tokenLabel.childNodes[0].textContent = `${meta.tokenName} `;
    $("gh-token").placeholder = meta.tokenPlaceholder;
  }
  if ($("btn-connect-github")) $("btn-connect-github").textContent = meta.connectLabel;
  const pasteFold = $("git-repo-paste-fold");
  const pasteSummary = pasteFold?.querySelector("summary");
  if (pasteSummary) {
    pasteSummary.textContent = provider === "azuredevops"
      ? "Or paste org/project/repo"
      : "Or paste owner/repo";
  }
  if ($("gh-repo-input")) $("gh-repo-input").placeholder = meta.repoPlaceholder;
}

function renderTypePicklist() {
  const sel = $("type-picklist");
  if (!sel) return;
  const types = typesForPicker();
  const groups = catalogGroupsFromTypes(types, "");
  const current = highlightedType();
  sel.innerHTML = `<option value="">Pick a type…</option>` +
    groups
      .map((group) => {
        const opts = group.types
          .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.label)} — ${escapeHtml(t.name)}</option>`)
          .join("");
        return `<optgroup label="${escapeHtml(group.label)}">${opts}</optgroup>`;
      })
      .join("");
  sel.value = types.some((t) => t.name === current) ? current : "";
}

function renderTypeShortcuts() {
  const el = $("type-shortcuts");
  if (!el) return;
  const types = typesForPicker();
  el.innerHTML = COMMON_CONFIG_TYPES.slice(0, 8)
    .map((name) => {
      const t = types.find((x) => x.name === name);
      if (!t) return "";
      const active = name === highlightedType() ? "active" : "";
      return `<button type="button" class="obj-chip ${active}" data-type="${escapeHtml(name)}">${escapeHtml(t.label)}</button>`;
    })
    .join("");
}

function chooseType(typeName, { objectFilter = "", memberQuery = "" } = {}) {
  if (!typeName) return;
  state.activeType = typeName;
  state.typeChosen = true;
  state.objectFilter = objectFilter || "";
  if (state.activeType === "CustomObject" && !state.membersCache.CustomObject) {
    state.membersCache.CustomObject = { items: withStandardObjectMembers("CustomObject", []), error: "" };
  }
  const pick = $("type-picklist");
  if (pick) pick.value = typeName;
  if ($("member-filter")) $("member-filter").value = memberQuery || "";
  if ($("object-filter")) $("object-filter").value = state.objectFilter;
  if (currentStepId() !== "package") goStep(stepIndexById("package"), { force: true });
  syncTypeChosenUi();
  renderTypePicker();
  renderMembers();
  renderPackageHints();
  queueMicrotask(() => focusInView("member-filter"));
  if (selectedOrg("source-org")) run(loadMembers);
}

function typesForPicker() {
  return state.availableTypes.length ? state.availableTypes : fallbackTypeRecords();
}

function renderTypePicker() {
  const types = typesForPicker();
  const query = $("type-search")?.value || state.typeFilter || "";
  state.typeFilter = query;
  const groups = catalogGroupsFromTypes(types, query);
  const restCap = query ? 200 : 60;
  const picker = $("type-picker");
  picker.innerHTML = groups
    .map((group) => {
      const items = group.id === "all" ? group.types.slice(0, restCap) : group.types;
      const extra = group.id === "all" && group.types.length > items.length
        ? `<div class="muted">Showing ${items.length} of ${group.types.length}. Type in the search box to find the rest.</div>`
        : "";
      const chips = items
        .map((t) => {
          const active = t.name === highlightedType() ? "active" : "";
          return `<button type="button" class="type-chip ${active}" data-type="${escapeHtml(t.name)}">
            <span>${escapeHtml(t.label)}</span>
            <span class="api">${escapeHtml(t.name)}</span>
          </button>`;
        })
        .join("");
      return `<div class="type-group-label">${escapeHtml(group.label)}</div>${chips}${extra}`;
    })
    .join("") || `<div class="empty">No types match that search. Use the picklist to jump to a type.</div>`;
  renderTypePicklist();
  renderTypeShortcuts();
  const fromOrg = types.some((t) => t.fromOrg);
  $("type-count").textContent = fromOrg
    ? `${types.length} metadata types from the source org. Search or use the picklist.`
    : `${types.length} metadata types ready. Search, pick from the list, or tap a shortcut.`;
  const active = types.find((t) => t.name === state.activeType);
  if (active && state.typeChosen) {
    $("active-type-title").textContent = `Selected type: ${active.label}`;
    $("active-type-meta").textContent = active.name;
    const hint = memberHint(state.activeType);
    $("manual-member").placeholder = hint;
    $("member-filter").placeholder = `Filter… e.g. ${hint}`;
  }
  syncTypeChosenUi();
}

function syncTypeChosenUi() {
  const onPackage = currentStepId() === "package";
  $("type-browse")?.classList.toggle("hidden", !onPackage);
  $("type-chosen")?.classList.toggle("hidden", !onPackage || !state.typeChosen);
  $("member-panel")?.classList.toggle("hidden", !onPackage || !state.typeChosen);
  $("compact-package-card")?.classList.toggle("hidden", !onPackage);
  const objectScoped = OBJECT_FILTER_TYPES.includes(state.activeType) || state.activeType === "CustomObject";
  $("object-filter-wrap")?.classList.toggle("hidden", !onPackage || !state.typeChosen || !objectScoped);
  if (state.activeType === "CustomObject") {
    $("member-help").textContent = "Tick objects for this deploy. Pick another type above to add fields, layouts, or flows — earlier ticks stay in the package.";
  } else if (OBJECT_FILTER_TYPES.includes(state.activeType)) {
    $("member-help").textContent = "Tap an object chip to shrink the list, then tick members. Pick another type above when you need a different kind.";
  } else {
    $("member-help").textContent = "Tick every member you need. Pick another type above to add more. Next retrieves only after you are done.";
  }
  if (!onPackage) $("package-hints")?.classList.add("hidden");
}

function membersByTypeFromCache() {
  const map = {};
  for (const [typeName, cache] of Object.entries(state.membersCache || {})) {
    if (cache?.items?.length) map[typeName] = cache.items;
  }
  return map;
}

function renderPackageHints() {
  const wrap = $("package-hints");
  const recentWrap = $("recent-hints");
  const relatedWrap = $("related-hints");
  const recentChips = $("recent-hint-chips");
  const relatedChips = $("related-hint-chips");
  if (!wrap || !recentWrap || !relatedWrap) return;
  const onPackage = currentStepId() === "package";
  if (!onPackage) {
    wrap.classList.add("hidden");
    return;
  }

  const now = Date.now();
  let recent = recentHintItems(membersByTypeFromCache(), { now, windowMs: 7 * 24 * 60 * 60 * 1000, limit: 6 });
  if (recent.length < 3) {
    recent = recentHintItems(membersByTypeFromCache(), { now, windowMs: 30 * 24 * 60 * 60 * 1000, limit: 6 });
  }
  if (recentChips) {
    recentChips.innerHTML = recent.map((row) => {
      const inPack = packageHasMember(state.packageTypes, row.type, row.fullName);
      const when = formatMemberWhen(row.lastModifiedDate);
      return `<button type="button" class="hint-chip ${inPack ? "in-package" : ""}" data-hint-add="1" data-type="${escapeHtml(row.type)}" data-member="${escapeHtml(row.fullName)}" title="${inPack ? "Already in this package" : "Add to this package"}">
        <span class="hint-type">${escapeHtml(shortTypeLabel(row.type))}</span>
        <span class="hint-name">${escapeHtml(row.fullName)}</span>
        <span class="hint-meta">${escapeHtml(when)}${inPack ? " · in package" : ""}</span>
      </button>`;
    }).join("");
  }
  recentWrap.classList.toggle("hidden", !recent.length);

  const related = relatedTypeHints(state.packageTypes, state.activeType, 4);
  if ($("related-hint-kicker")) {
    $("related-hint-kicker").textContent = related.object ? `Also on ${related.object}` : "Also on this object";
  }
  if (relatedChips) {
    relatedChips.innerHTML = related.types.map((row) => `<button type="button" class="hint-chip" data-hint-related="1" data-type="${escapeHtml(row.type)}" data-object="${escapeHtml(related.object)}" title="Show ${escapeHtml(row.label)} for ${escapeHtml(related.object)}">
        <span class="hint-type">${escapeHtml(related.object)}</span>
        <span class="hint-name">${escapeHtml(row.label)}</span>
        <span class="hint-meta">Open list</span>
      </button>`).join("");
  }
  relatedWrap.classList.toggle("hidden", !related.object || !related.types.length);
  wrap.classList.toggle("hidden", recentWrap.classList.contains("hidden") && relatedWrap.classList.contains("hidden"));
}

async function prefetchMembers(typeName) {
  if (!typeName || state.membersCache[typeName]?.items?.length || state.membersCache[typeName]?.loading || state.membersCache[typeName]?.attempted) return;
  const source = selectedOrg("source-org");
  if (!source) return;
  const meta = typesForPicker().find((t) => t.name === typeName);
  state.membersCache[typeName] = { items: [], loading: true, attempted: true, error: "" };
  try {
    const listed = await listMetadataType({
      instanceUrl: source.instanceUrl,
      sid: source.sid,
      typeName,
      folderType: meta?.folderType,
      inFolder: meta?.inFolder,
      apiVersion: apiVersion()
    });
    const items = withStandardObjectMembers(typeName, listed);
    state.membersCache[typeName] = { items, error: "", attempted: true };
  } catch {
    state.membersCache[typeName] = { items: state.membersCache[typeName]?.items || [], error: "", loading: false, attempted: true };
  }
}

async function warmRecentHints() {
  if (currentStepId() !== "package" || !selectedOrg("source-org")) return;
  const gen = ++state.recentWarmGen;
  for (const typeName of RECENT_HINT_TYPES) {
    if (gen !== state.recentWarmGen || currentStepId() !== "package") return;
    await prefetchMembers(typeName);
    if (gen !== state.recentWarmGen) return;
    renderPackageHints();
  }
}

async function addRecentHint(typeName, fullName) {
  if (!typeName || !fullName) return;
  if (packageHasMember(state.packageTypes, typeName, fullName)) {
    openRelatedHint(typeName, memberObjectKey(typeName, fullName) || "");
    return;
  }
  const listed = (state.membersCache[typeName]?.items || []).map((i) => i.fullName);
  state.packageTypes = toggleMember(state.packageTypes, typeName, fullName, true, listed);
  invalidateStaged();
  await persistPackage();
  const object = memberObjectKey(typeName, fullName);
  chooseType(typeName, {
    objectFilter: OBJECT_FILTER_TYPES.includes(typeName) || typeName === "CustomObject" ? object : "",
    memberQuery: object && !OBJECT_FILTER_TYPES.includes(typeName) ? object : ""
  });
  setStatus(`Added ${fullName} · pick more on ${shortTypeLabel(typeName)} if you need them`, "ok");
}

function openRelatedHint(typeName, objectName) {
  if (!typeName) return;
  const objectScoped = OBJECT_FILTER_TYPES.includes(typeName) || typeName === "CustomObject";
  chooseType(typeName, {
    objectFilter: objectScoped ? objectName : "",
    memberQuery: objectScoped ? "" : (objectName || "")
  });
}

function renderObjectChips() {
  const el = $("object-chips");
  if (!el) return;
  const objectScoped = OBJECT_FILTER_TYPES.includes(state.activeType) || state.activeType === "CustomObject";
  const items = state.membersCache[state.activeType]?.items || [];
  const options = objectFilterOptions(state.activeType, items);
  if (!objectScoped || !options.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const current = $("object-filter")?.value || state.objectFilter || "";
  const chips = [`<button type="button" class="obj-chip ${current ? "" : "active"}" data-object="">All objects</button>`];
  for (const name of options.slice(0, 30)) {
    const active = name === current ? "active" : "";
    const tag = isStandardObject(name) ? " · std" : "";
    chips.push(`<button type="button" class="obj-chip ${active}" data-object="${escapeHtml(name)}">${escapeHtml(name)}${tag}</button>`);
  }
  if (options.length > 30) {
    chips.push(`<span class="muted">+${options.length - 30} more — use the Object list</span>`);
  }
  el.innerHTML = chips.join("");
}

function renderObjectFilter() {
  const sel = $("object-filter");
  if (!sel) return;
  const items = state.membersCache[state.activeType]?.items || [];
  const options = objectFilterOptions(state.activeType, items);
  const current = state.objectFilter;
  sel.innerHTML = `<option value="">All objects</option>` +
    options
      .map((name) => {
        const tag = isStandardObject(name) ? " (standard)" : "";
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${tag}</option>`;
      })
      .join("");
  sel.value = options.includes(current) ? current : "";
  state.objectFilter = sel.value;
  renderObjectChips();
}

function formatMemberWhen(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 90) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function memberRowHtml(item, typeName, selected) {
  const checked = selected.has("*") || selected.has(item.fullName);
  const mark = item.extra ? ` <span class="muted">(manual)</span>` : "";
  const std = item.standard || (isStandardObject(item.fullName) && typeName === "CustomObject")
    ? ` <span class="member-tag">standard</span>`
    : "";
  const when = formatMemberWhen(item.lastModifiedDate);
  return `<label class="member-row">
    <input type="checkbox" data-member="${escapeHtml(item.fullName)}" ${checked ? "checked" : ""} />
    <span class="member-mark" aria-hidden="true">✓</span>
    <span class="member-name">${escapeHtml(item.fullName)}${std}${mark}</span>
    ${when ? `<span class="member-when" title="${escapeHtml(item.lastModifiedByName || "last changed")}">${escapeHtml(when)}</span>` : ""}
  </label>`;
}

function renderTypeSelect() {
  renderTypePicker();
}

function renderMembers() {
  const typeName = state.activeType;
  const cache = state.membersCache[typeName];
  const filter = $("member-filter")?.value.trim().toLowerCase() || "";
  const selected = selectedMembersFor(typeName);
  const list = $("member-list");
  const status = $("member-status");
  renderObjectFilter();
  const objectFilter = $("object-filter")?.value || state.objectFilter || "";

  const selectedCount = [...selected].filter((name) => name !== "*").length;
  if ($("member-count")) {
    $("member-count").textContent = selectedCount
      ? `${selectedCount} selected in ${typeName}`
      : "Nothing selected yet — tick members below";
  }

  if (!cache) {
    status.textContent = "Loading members from the source org, or add a member by name below.";
    const extras = [...selected].filter((name) => name !== "*");
    list.innerHTML = extras.length
      ? extras.map((name) => memberRowHtml({ fullName: name, extra: true }, typeName, selected)).join("")
      : `<div class="empty">Members appear here after you pick a type.</div>`;
    updateMemberScrollHint();
    return;
  }
  if (cache.error) {
    status.textContent = cache.error;
  } else {
    const newestFirst = $("show-newest-first") ? $("show-newest-first").checked : true;
    status.textContent = newestFirst
      ? `${cache.items.length} in org · newest first · ${selectedCount} selected in this type`
      : `${cache.items.length} in org · ${selectedCount} selected in this type`;
  }

  let items = cache.items || [];
  if (objectFilter) {
    items = items.filter((i) => {
      if (typeName === "CustomObject") return i.fullName === objectFilter;
      return memberObjectKey(typeName, i.fullName) === objectFilter;
    });
  }
  if (filter) items = items.filter((i) => i.fullName.toLowerCase().includes(filter));
  if ($("show-selected-only")?.checked) {
    items = items.filter((i) => selected.has("*") || selected.has(i.fullName));
  }
  const newestFirst = $("show-newest-first") ? $("show-newest-first").checked : true;
  if (newestFirst) {
    items = [...items].sort((a, b) => {
      const tb = Date.parse(b.lastModifiedDate || "") || 0;
      const ta = Date.parse(a.lastModifiedDate || "") || 0;
      if (tb !== ta) return tb - ta;
      return String(a.fullName).localeCompare(String(b.fullName));
    });
  }
  const extraSelected = [...selected].filter((name) => name !== "*" && !items.some((i) => i.fullName === name));
  const combined = [
    ...extraSelected.map((fullName) => ({ fullName, extra: true })),
    ...items
  ];
  const cap = isWorkbench() ? WORKBENCH_MEMBERS : MAX_MEMBERS;
  const shown = combined.slice(0, cap);
  if (!shown.length) {
    list.innerHTML = `<div class="empty">No members match the filter. Try All objects, or add a name such as Account.My_Field__c.</div>`;
    updateMemberScrollHint();
    return;
  }
  list.innerHTML =
    shown.map((item) => memberRowHtml(item, typeName, selected)).join("") +
    (combined.length > cap
      ? `<div class="muted">Showing ${cap} of ${combined.length}. Filter by object or tick Selected only to find the rest.</div>`
      : "");
  updateMemberScrollHint();
  renderPackageHints();
}

function updateMemberScrollHint() {
  const list = $("member-list");
  const hint = $("member-scroll-hint");
  if (!list || !hint) return;
  const refresh = () => {
    const overflow = list.scrollHeight > list.clientHeight + 12;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    const remaining = overflow && !atBottom;
    hint.classList.toggle("hidden", !remaining);
    if (remaining) {
      hint.textContent = "Scroll for more members ↓";
    }
  };
  if (!list.dataset.scrollBound) {
    list.dataset.scrollBound = "1";
    list.addEventListener("scroll", refresh, { passive: true });
  }
  requestAnimationFrame(refresh);
}

function renderFileList() {
  const el = $("file-list");
  if (!el) return;
  if (!state.stagedFiles?.length) {
    el.innerHTML = `<div class="empty">Retrieve selected components to review files here.</div>`;
    return;
  }
  el.innerHTML = state.stagedFiles
    .map((file) => {
      const editable = typeof isEditablePath === "function" ? isEditablePath(file.path) : true;
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
  const options = state.orgs.length
    ? state.orgs.map((o) => `<option value="${escapeHtml(orgKey(o))}">${escapeHtml(o.label)}</option>`).join("")
    : "";
  const prevSource = state.settings.lastSourceOrgId;
  const prevTarget = state.settings.lastTargetOrgId;
  const sourceBlank = `<option value="">Select source org</option>`;
  const targetBlank = `<option value="">Select target org</option>`;
  const sourceEl = $("source-org");
  const targetEl = $("target-org");
  if (sourceEl) sourceEl.innerHTML = sourceBlank + options;
  if (targetEl) targetEl.innerHTML = targetBlank + options;
  if (sourceEl && prevSource && state.orgs.some((o) => orgKey(o) === prevSource)) sourceEl.value = prevSource;
  if (targetEl && prevTarget && prevTarget !== sourceEl?.value && state.orgs.some((o) => orgKey(o) === prevTarget)) {
    targetEl.value = prevTarget;
  }
  if (sourceEl?.value && !targetEl?.value && state.orgs.length === 2) {
    const other = state.orgs.find((o) => orgKey(o) !== sourceEl.value);
    if (other) targetEl.value = orgKey(other);
  }
  updateActionState();
}

function renderPipelines() {
  const items = state.pipelines?.pipelines || [];
  const lastId = state.settings?.lastPipelineId || "";
  const options = items.length
    ? items.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(pipelinePathLabel(p) || p.name)}</option>`).join("")
    : `<option value="">No paths yet — connecting a repo creates one</option>`;
  for (const id of ["pipeline-select", "deploy-pipeline"]) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = options;
    if (lastId && items.some((p) => p.id === lastId)) el.value = lastId;
  }
  $("deploy-pipeline-wrap")?.classList.toggle("hidden", !useGitEnabled() || !items.length);
  const last = findPipeline(items, lastId);
  const welcome = $("pipeline-welcome");
  if (welcome) {
    if (last) {
      welcome.classList.remove("hidden");
      $("pipeline-welcome-body").textContent = `This release repo’s path is ${pipelinePathLabel(last)}. Same Jira snapshot travels each hop.`;
    } else {
      welcome.classList.add("hidden");
    }
  }
  $("pipeline-status").textContent = items.length
    ? `${items.length} promotion path${items.length === 1 ? "" : "s"} in ${pipelinesFilePath()}.`
    : useGitEnabled()
      ? "Use this repo while From and To are set — OrgFlow saves that hop as the promotion path."
      : "";
  renderReleaseRepoHeading();
  renderPromotionPath();
}

async function loadPipelines() {
  if (!isGitConfigured(state.settings)) {
    state.pipelines = emptyPipelineStore();
    return;
  }
  const creds = gitCreds();
  try {
    const raw = await getFileContent(creds, pipelinesFilePath(), creds.branch);
    if (raw) {
      state.pipelines = parsePipelineStore(raw);
      await savePipelineCache(state.settings, state.pipelines);
      return;
    }
  } catch (err) {
    log(`Could not read ${pipelinesFilePath()} on ${creds.branch}: ${err.message || err}`, "error");
  }
  const cached = await loadPipelineCache(state.settings);
  state.pipelines = cached ? parsePipelineStore(cached) : emptyPipelineStore();
  if (!state.pipelines.pipelines.length) {
    log(`No pipelines on branch ${creds.branch}. They are stored in ${pipelinesFilePath()}.`);
  } else {
    log(`Loaded ${state.pipelines.pipelines.length} pipeline(s) from this browser cache for ${creds.branch}.`);
  }
}

function applyPipeline(record, { keepHop = false } = {}) {
  if (!record) throw new Error("Select a saved pipeline first.");
  const stages = stagesFromPipeline(record);
  let hopSource = record.source;
  let hopTarget = record.target;
  const currentSource = selectedOrg("source-org");
  const currentTarget = selectedOrg("target-org");
  if (keepHop && currentSource && currentTarget) {
    for (let i = 0; i < stages.length - 1; i += 1) {
      if (sameOrg(stages[i], currentSource) && sameOrg(stages[i + 1], currentTarget)) {
        hopSource = stages[i];
        hopTarget = stages[i + 1];
        break;
      }
    }
  }
  const source = matchOrg(state.orgs, hopSource);
  const target = matchOrg(state.orgs, hopTarget);
  if (source && $("source-org")) $("source-org").value = orgKey(source);
  if (target && $("target-org")) $("target-org").value = orgKey(target);
  if (record.testLevel && $("test-level")) $("test-level").value = record.testLevel;
  if ($("pipeline-name")) $("pipeline-name").value = record.name || pipelinePathLabel(record);
  if ($("pipeline-select")) $("pipeline-select").value = record.id;
  if ($("deploy-pipeline")) $("deploy-pipeline").value = record.id;
  $("use-git").checked = record.useGit !== false;
  renderPromotionPath();
}

async function useSelectedPipeline() {
  const id = $("pipeline-select")?.value || $("deploy-pipeline")?.value;
  const record = findPipeline(state.pipelines.pipelines, id);
  if (!record) throw new Error("Save a pipeline on Start first.");
  applyPipeline(record);
  await saveSettings({
    lastPipelineId: record.id,
    lastSourceOrgId: $("source-org").value,
    lastTargetOrgId: $("target-org").value,
    testLevel: $("test-level").value,
    useGit: useGitEnabled()
  });
  state.settings = await loadSettings();
  renderGitUi();
  log(`Using pipeline ${record.name}.`);
  setStatus(`Pipeline: ${record.name}`, "ok");
  updateActionState();
  maybeAdvanceFromStart();
}

async function saveCurrentPipeline() {
  if (!isGitConfigured(state.settings) && ($("gh-repo")?.value || $("gh-repo-input")?.value.trim())) {
    await saveRepo();
  }
  requireGithub();
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  if (!source || !target) throw new Error("Detect orgs and pick From and To in the path bar first.");
  const record = createPipeline({
    id: $("pipeline-select")?.value || undefined,
    name: $("pipeline-name").value.trim() || `${source.label} → ${target.label}`,
    source,
    target,
    testLevel: $("test-level").value,
    useGit: true
  });
  const next = upsertPipeline(state.pipelines, record);
  await commitFiles({
    ...gitCreds(),
    files: [{ path: pipelinesFilePath(), base64: encodeUtf8Base64(JSON.stringify(next, null, 2) + "\n") }],
    message: `chore: save pipeline ${record.name}`
  });
  state.pipelines = next;
  await savePipelineCache(state.settings, next);
  await saveSettings({
    lastPipelineId: record.id,
    lastSourceOrgId: orgKey(source),
    lastTargetOrgId: orgKey(target),
    setupComplete: true,
    useGit: true
  });
  state.settings = await loadSettings();
  applyPipeline(record);
  renderPipelines();
  updateActionState();
  log(`Saved pipeline “${record.name}” to ${pipelinesFilePath()}.`);
  setStatus(`Saved pipeline ${record.name}`, "ok");
}

function renderRepos() {
  const select = $("gh-repo");
  const creds = gitCreds();
  const current = creds.owner && creds.repo
    ? (creds.provider === "azuredevops" && creds.project
      ? `${creds.owner}/${creds.project}/${creds.repo}`
      : `${creds.owner}/${creds.repo}`)
    : "";
  if (!state.repos.length) {
    select.innerHTML = current
      ? `<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>`
      : `<option value="">Connect ${escapeHtml(providerMeta(selectedProvider()).label)} to load repos</option>`;
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
      (o) => `<article class="org-row">
        <strong>${escapeHtml(o.label)}</strong>
        <span>${escapeHtml(o.username || o.instanceUrl || "")}</span>
      </article>`
    )
    .join("");
}

function versionOptionLabel(v) {
  const when = v.createdAt ? new Date(v.createdAt).toLocaleString() : "";
  const comment = v.comment ? ` — ${v.comment}` : "";
  return `${v.id}${comment}${when ? ` (${when})` : ""}`;
}

function fillVersionSelects() {
  const items = sortVersions(state.versions.versions);
  const options = items
    .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(versionOptionLabel(v))}</option>`)
    .join("");
  const left = $("compare-left");
  const right = $("compare-right");
  const revertFrom = $("revert-from");
  const currentOpt = `<option value="current">Current retrieve${state.stagedFiles?.length ? ` (${state.stagedFiles.length} files)` : " (none yet)"}</option>`;
  const versionOpts = items
    .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(versionOptionLabel(v))}</option>`)
    .join("");
  if (left) {
    const prev = left.value;
    left.innerHTML = `${currentOpt}${versionOpts}`;
    if ([...left.options].some((o) => o.value === prev)) left.value = prev;
    else left.value = state.stagedFiles?.length ? "current" : (items[0]?.id || "current");
  }
  if (right) {
    const prev = right.value;
    right.innerHTML = options || `<option value="">No saved versions yet</option>`;
    if (prev && [...right.options].some((o) => o.value === prev)) right.value = prev;
    else {
      const leftId = left?.value;
      const fallback = items.find((v) => v.id !== leftId) || items[0];
      if (fallback) right.value = fallback.id;
    }
  }
  if (revertFrom) {
    const prev = revertFrom.value;
    revertFrom.innerHTML = options || `<option value="">No saved versions yet</option>`;
    if (prev && [...revertFrom.options].some((o) => o.value === prev)) revertFrom.value = prev;
  }
}

function compareStatusLabel(status) {
  if (status === "changed") return "changed";
  if (status === "onlyLeft") return "only left";
  if (status === "onlyRight") return "only right";
  return "same";
}

async function loadVersionFiles(versionId) {
  if (versionId === "current") {
    if (!state.stagedFiles?.length) throw new Error("Retrieve files first, or pick a saved version on the left.");
    return state.stagedFiles;
  }
  if (!versionId) throw new Error("Pick a version.");
  if (state.versionFilesCache[versionId]) return state.versionFilesCache[versionId];
  const version = findVersion(state.versions.versions, versionId);
  if (!version) throw new Error(`No saved version found for "${versionId}".`);
  let files = [];
  if (version.storage === "local" || !useGitEnabled()) {
    files = await loadLocalRelease(version.id);
    if (!files.length && version.storage === "git" && isGitConfigured(state.settings)) {
      /* fall through to Git below */
    } else if (!files.length) {
      throw new Error(`No files found for ${version.id}.`);
    }
  }
  if (!files.length) {
    requireGithub();
    const creds = gitCreds();
    const ref = await getRef(creds);
    const sha = version.commitSha || ref?.object?.sha;
    if (!sha) throw new Error("Repo branch has no commits yet.");
    files = await fetchReleaseFiles({ ...creds, commitSha: sha, prefix: version.path });
    if (!files.length) throw new Error(`No files found at ${version.path}.`);
  }
  state.versionFilesCache[versionId] = files;
  return files;
}

function renderCompareFileList() {
  const el = $("compare-file-list");
  if (!el) return;
  const rows = (state.compareRows || []).filter((r) => r.status !== "same");
  if (!state.compareRows.length) {
    el.innerHTML = `<div class="empty">Pick two versions and click Show diff.</div>`;
    return;
  }
  if (!rows.length) {
    el.innerHTML = `<div class="empty">These versions match — no metadata or Apex differences.</div>`;
    return;
  }
  el.innerHTML = rows
    .map((row) => {
      const active = row.path === state.compareActivePath ? "active" : "";
      return `<button type="button" class="compare-row ${active}" data-compare-file="${escapeHtml(row.path)}">
        <span class="badge ${escapeHtml(row.status)}">${escapeHtml(compareStatusLabel(row.status))}</span>
        <span>${escapeHtml(row.path)}</span>
      </button>`;
    })
    .join("");
}

function showCompareDiff(path) {
  state.compareActivePath = path;
  const row = (state.compareRows || []).find((r) => r.path === path);
  const pane = $("compare-diff");
  if (!pane || !row) return;
  pane.hidden = false;
  const leftText = fileText(row.left);
  const rightText = fileText(row.right);
  if (leftText === null && rightText === null && (row.left || row.right)) {
    pane.innerHTML = `<span class="diff-meta">${escapeHtml(path)} is binary — no text diff.</span>`;
    renderCompareFileList();
    return;
  }
  if (row.status === "onlyLeft") {
    pane.innerHTML = `<span class="diff-meta">${escapeHtml(path)} exists only on the left.</span>\n<span class="diff-del">${escapeHtml(leftText || "")}</span>`;
    renderCompareFileList();
    return;
  }
  if (row.status === "onlyRight") {
    pane.innerHTML = `<span class="diff-meta">${escapeHtml(path)} exists only on the right (selected version).</span>\n<span class="diff-add">${escapeHtml(rightText || "")}</span>`;
    renderCompareFileList();
    return;
  }
  const diff = unifiedDiff(leftText || "", rightText || "", { leftLabel: `left/${path}`, rightLabel: `right/${path}` });
  if (!diff) {
    pane.innerHTML = `<span class="diff-meta">${escapeHtml(path)} is unchanged.</span>`;
    renderCompareFileList();
    return;
  }
  pane.innerHTML = diff
    .split("\n")
    .map((line) => {
      const cls = line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")
        ? "diff-hunk"
        : line.startsWith("+")
          ? "diff-add"
          : line.startsWith("-")
            ? "diff-del"
            : "";
      return `<span class="${cls}">${escapeHtml(line)}</span>`;
    })
    .join("\n");
  renderCompareFileList();
}

async function runCompareVersions() {
  await loadVersionStore();
  fillVersionSelects();
  const leftId = $("compare-left")?.value;
  const rightId = $("compare-right")?.value;
  if (!rightId) throw new Error("Pick a version on the right to compare.");
  if (leftId === rightId) throw new Error("Pick two different versions (or current retrieve vs a saved version).");
  log(`Loading files to compare ${leftId} → ${rightId}…`);
  const [leftFiles, rightFiles] = await Promise.all([loadVersionFiles(leftId), loadVersionFiles(rightId)]);
  state.compareRows = compareFileSets(leftFiles, rightFiles);
  const counts = { changed: 0, onlyLeft: 0, onlyRight: 0, same: 0 };
  for (const row of state.compareRows) counts[row.status] += 1;
  const summary = `${counts.changed} changed · ${counts.onlyLeft} only on left · ${counts.onlyRight} only on right · ${counts.same} same`;
  if ($("compare-summary")) $("compare-summary").textContent = summary;
  state.compareActivePath = "";
  if ($("compare-diff")) {
    $("compare-diff").hidden = true;
    $("compare-diff").textContent = "";
  }
  renderCompareFileList();
  const first = state.compareRows.find((r) => r.status !== "same");
  if (first) showCompareDiff(first.path);
  log(`Compared ${leftId} with ${rightId}: ${summary}`);
}

async function loadRevertFileList() {
  await loadVersionStore();
  fillVersionSelects();
  const fromId = $("revert-from")?.value;
  if (!fromId) throw new Error("Pick a version to restore files from.");
  const fromFiles = await loadVersionFiles(fromId);
  const current = state.stagedFiles || [];
  const compared = compareFileSets(current, fromFiles);
  const el = $("revert-file-list");
  if (!el) return;
  if (!fromFiles.length) {
    el.innerHTML = `<div class="empty">That version has no files.</div>`;
    return;
  }
  el.innerHTML = fromFiles
    .map((file) => {
      const row = compared.find((r) => r.path === file.path);
      const status = !current.length ? "onlyRight" : row?.status || "same";
      return `<label class="revert-item">
        <input type="checkbox" data-revert-path="${escapeHtml(file.path)}" ${status === "same" ? "" : "data-changed='1'"} />
        <span class="badge ${escapeHtml(status)}">${escapeHtml(compareStatusLabel(status))}</span>
        <span>${escapeHtml(file.path)}</span>
      </label>`;
    })
    .join("");
  log(`Loaded ${fromFiles.length} file(s) from ${fromId} for revert.`);
}

function selectChangedRevertFiles() {
  document.querySelectorAll("#revert-file-list input[data-revert-path]").forEach((box) => {
    box.checked = box.dataset.changed === "1";
  });
}

async function revertSelectedFiles() {
  const fromId = $("revert-from")?.value;
  if (!fromId) throw new Error("Pick a version to restore files from.");
  const selected = [...document.querySelectorAll("#revert-file-list input[data-revert-path]:checked")].map((el) => el.dataset.revertPath);
  if (!selected.length) throw new Error("Tick the files you want to restore from that version.");
  const fromFiles = await loadVersionFiles(fromId);
  const next = revertSelectedInto(state.stagedFiles || [], fromFiles, selected);
  if (!next.length) throw new Error("Nothing to restore.");
  state.stagedFiles = next;
  const source = selectedOrg("source-org");
  state.retrieveOk = true;
  state.selectionFrozen = true;
  state.deployFinished = "";
  state.lastDeploy = null;
  state.lastValidate = null;
  state.lastSaved = null;
  state.retrieveSnapshot = {
    sourceKey: source ? orgKey(source) : "reverted",
    fingerprint: packageFingerprint(),
    fileCount: next.length
  };
  renderFileList();
  applyRetrieveLockUi();
  updateActionState();
  log(`Restored ${selected.length} file(s) from ${fromId} into the retrieve package.`);
  setStatus(`Restored ${selected.length} file(s) from ${fromId}. Review, then deploy.`, "ok");
  goStep(stepIndexById("review"), { force: true });
}

function renderVersions() {
  fillVersionSelects();
  const q = $("version-filter")?.value.trim().toLowerCase() || "";
  const items = sortVersions(state.versions.versions).filter((v) => {
    if (!q) return true;
    return `${v.id} ${v.jira} ${v.comment}`.toLowerCase().includes(q);
  });
  if (!items.length) {
    $("version-list").innerHTML = `<div class="empty">${useGitEnabled() ? "No versions in the connected repo yet. Retrieve, then Save to repo." : "No versions in Local snapshots yet. Retrieve, then save a snapshot."}</div>`;
    return;
  }
  $("version-list").innerHTML = items
    .map((v) => {
      const deploys = (v.deployments || []).slice(-3).map((d) => `${d.org?.label || d.org?.name || "org"}: ${d.status}`).join(" · ");
      const comps = v.components?.length ? packageSummary(v.components) : "";
      return `<article class="card" data-id="${escapeHtml(v.id)}">
        <div class="title">${escapeHtml(v.id)}</div>
        <div class="meta">${escapeHtml(v.comment || "No comment")}</div>
        <div class="meta">${escapeHtml(v.storage === "git" ? providerMeta(providerId(state.settings)).label : "Local snapshots")} · ${escapeHtml(v.sourceOrg?.label || "")} · ${escapeHtml(new Date(v.createdAt).toLocaleString())}${v.fileCount ? ` · ${v.fileCount} files` : ""}</div>
        ${comps ? `<div class="meta">${escapeHtml(comps)}</div>` : ""}
        ${deploys ? `<div class="meta">${escapeHtml(deploys)}</div>` : ""}
        <div class="tiny">
          <button class="secondary" data-compare="${escapeHtml(v.id)}">Compare</button>
          <button class="secondary" data-revert="${escapeHtml(v.id)}">Revert files…</button>
          <button class="secondary" data-use="${escapeHtml(v.id)}">Use on Deploy</button>
          <button class="primary" data-deploy="${escapeHtml(v.id)}">Deploy this version</button>
        </div>
      </article>`;
    })
    .join("");
}

function gitCreds() {
  return hostCreds(state.settings);
}

async function loadVersionStore() {
  if (useGitEnabled() && isGitConfigured(state.settings)) {
    const creds = gitCreds();
    const raw = await getFileContent(creds, versionsFilePath(), creds.branch);
    state.versions = parseVersionStore(raw);
    return;
  }
  state.versions = await loadLocalVersionStore();
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
  const n = state.orgs.length;
  const step = currentStepId();
  if (!n) {
    setStatus("Log into your Salesforce orgs in Chrome, then detect them.");
    return;
  }
  if (step === "start") {
    setStatus(`${n} org${n === 1 ? "" : "s"} detected. Set From and To, then continue.`);
    return;
  }
  if (!pack) {
    setStatus(`${n} org${n === 1 ? "" : "s"} · pick types and tick members.`);
    return;
  }
  if (step === "review" && !state.retrieveOk) {
    setStatus("Retrieve from the From org before you can deploy.");
    return;
  }
  if (step === "deploy" && alreadyDeployedToCurrentTarget()) {
    setStatus(`Already sent to ${selectedOrg("target-org")?.label || "the To org"}.`);
    return;
  }
  setStatus(`${n} org${n === 1 ? "" : "s"} · ${pack} in this package.`);
}

async function refreshAll() {
  state.settings = await loadSettings();
  state.packageTypes = normalizePackageTypes(state.settings.packageTypes);
  const creds = hostCreds(state.settings);
  if ($("git-provider")) $("git-provider").value = creds.provider || "github";
  $("gh-token").value = creds.token || "";
  $("git-org") && ($("git-org").value = creds.provider === "azuredevops" ? creds.owner : "");
  $("git-base-url") && ($("git-base-url").value = creds.baseUrl || "https://gitlab.com");
  $("gh-repo-input").value = creds.owner && creds.repo
    ? (creds.provider === "azuredevops" && creds.project ? `${creds.owner}/${creds.project}/${creds.repo}` : `${creds.owner}/${creds.repo}`)
    : "";
  $("gh-branch").value = creds.branch || "main";
  state.availableTypes = fallbackTypeRecords();
  $("test-level").value = state.settings.testLevel || "NoTestRun";
  $("check-only").checked = Boolean(state.settings.checkOnly);
  $("use-git").checked = Boolean(state.settings.useGit) || isGitConfigured(state.settings);
  state.specifiedTests = normalizeTestNames(state.settings.specifiedTests);
  $("package-xml").value = currentXml();
  state.xmlDirty = false;
  fillGitHostUi();
  renderTypeSelect();
  renderRepos();
  renderPackageUi();
  renderFileList();
  try {
    if (creds.token && (creds.provider !== "azuredevops" || creds.owner)) {
      state.githubUser = await getUser(creds);
      $("github-user").textContent = `Signed in as ${state.githubUser.login}`;
    }
  } catch (err) {
    $("github-user").textContent = `${providerMeta(creds.provider).label} token error: ${err.message}`;
  }
  await refreshOrgs().catch((err) => log(err.message, "error"));
  try {
    await loadVersionStore();
    renderVersions();
  } catch (err) {
    log(`Could not read versions.json: ${err.message}`, "error");
  }
  try {
    await loadPipelines();
    renderPipelines();
    const last = findPipeline(state.pipelines.pipelines, state.settings.lastPipelineId);
    if (last) applyPipeline(last);
  } catch (err) {
    log(`Could not read pipelines.json: ${err.message}`, "error");
  }
  updateHeaderStatus();
  goStep(0, { force: true });
  updateHeaderStatus();
  if (isGitConfigured(state.settings) && useGitEnabled()) {
    inspectGitLayout().catch((err) => log(`Could not inspect repo folders: ${err.message}`, "error"));
  }
}

async function connectGithub() {
  const provider = selectedProvider();
  const meta = providerMeta(provider);
  const token = $("gh-token").value.trim();
  if (!token) throw new Error(`Paste a ${meta.label} personal access token first.`);
  const baseUrl = $("git-base-url")?.value.trim() || "https://gitlab.com";
  const owner = $("git-org")?.value.trim() || "";
  if (provider === "azuredevops" && !owner) throw new Error("Enter your Azure DevOps organization name first.");
  await ensureHostAccess(provider, baseUrl);
  const creds = {
    provider,
    token,
    owner,
    repo: "",
    project: "",
    branch: $("gh-branch").value.trim() || "main",
    baseUrl: provider === "gitlab" ? baseUrl : ""
  };
  const user = await getUser(creds);
  state.githubUser = user;
  $("github-user").textContent = `Signed in as ${user.login}`;
  await saveSettings({
    gitHost: {
      provider,
      token,
      owner: provider === "azuredevops" ? owner : state.settings.gitHost?.owner || "",
      repo: state.settings.gitHost?.repo || "",
      project: state.settings.gitHost?.project || "",
      branch: creds.branch,
      baseUrl: creds.baseUrl
    },
    github: provider === "github" ? { ...state.settings.github, token } : state.settings.github
  });
  state.settings = await loadSettings();
  state.repos = await listRepos({ ...creds, owner: provider === "azuredevops" ? owner : creds.owner });
  renderRepos();
  log(`${meta.label} connected as ${user.login}. ${state.repos.length} repos available.`);
  updateActionState();
}

async function saveRepo() {
  const provider = selectedProvider();
  const meta = providerMeta(provider);
  const token = $("gh-token").value.trim() || hostCreds(state.settings).token;
  const fromSelect = parseRepoInput(provider, $("gh-repo").value);
  const fromInput = parseRepoInput(provider, $("gh-repo-input").value);
  const parsed = fromInput || fromSelect;
  const selectedRepo = state.repos.find((r) => r.fullName === $("gh-repo").value);
  if (selectedRepo?.defaultBranch && !$("gh-branch").value.trim()) {
    $("gh-branch").value = selectedRepo.defaultBranch;
  }
  const branch = $("gh-branch").value.trim() || selectedRepo?.defaultBranch || "main";
  if (!token) throw new Error(`${meta.label} token is required.`);
  if (!parsed?.repo) throw new Error(provider === "azuredevops" ? "Choose or paste org/project/repo." : "Choose or paste a repository (owner/name).");
  const owner = parsed.owner || $("git-org")?.value.trim() || selectedRepo?.owner || "";
  const project = parsed.project || selectedRepo?.project || "";
  if (provider === "azuredevops" && (!owner || !project)) {
    throw new Error("Azure DevOps needs organization, project, and repo.");
  }
  if (provider !== "azuredevops" && !owner) throw new Error("Choose or paste a repository (owner/name).");
  const gitHost = {
    provider,
    token,
    owner,
    repo: parsed.repo,
    project: provider === "azuredevops" ? project : "",
    branch: branch || selectedRepo?.defaultBranch || "main",
    baseUrl: provider === "gitlab" ? ($("git-base-url")?.value.trim() || "https://gitlab.com") : ""
  };
  await saveSettings({
    gitHost,
    useGit: true,
    github: provider === "github"
      ? { token, owner, repo: parsed.repo, branch: gitHost.branch }
      : state.settings.github
  });
  $("use-git").checked = true;
  state.settings = await loadSettings();
  $("gh-repo-input").value = provider === "azuredevops" ? `${owner}/${project}/${parsed.repo}` : `${owner}/${parsed.repo}`;
  $("gh-branch").value = gitHost.branch;
  state.gitAutoScaffoldDone = false;
  await loadVersionStore();
  renderVersions();
  await loadPipelines();
  renderPipelines();
  updateHeaderStatus();
  log(`Using ${repoLabel(state.settings)}`);
  const path = await ensureReleasePath();
  setStatus(
    path
      ? `Release repo ${repoLabel(state.settings)} · ${pipelinePathLabel(path)}. Same Jira snapshot travels this path.`
      : `Release repo ${repoLabel(state.settings)}. Set From and To to save the first hop (DEC → QA).`,
    "ok"
  );
  renderGitUi();
  await inspectGitLayout();
  maybeAdvanceFromStart();
}

function gitLayoutViewUrl() {
  const copy = layoutCopy(state.gitLayout, { repoLabel: repoLabel(state.settings) });
  return browseFolderUrl(state.settings, copy.viewPath || "");
}

function renderGitLayoutCard() {
  const card = $("git-layout-card");
  const connected = isGitConfigured(state.settings) && useGitEnabled();
  if (card) card.classList.toggle("hidden", !connected);
  const copy = layoutCopy(state.gitLayout, { repoLabel: repoLabel(state.settings) });
  if ($("git-layout-copy")) $("git-layout-copy").textContent = copy.body;
  const status = $("git-layout-status");
  if (status && !status.dataset.live) {
    status.textContent = "";
    status.classList.add("hidden");
  }
  syncSetupButtons();
}

async function refreshGitLayoutOnly() {
  if (!isGitConfigured(state.settings) || !useGitEnabled()) {
    state.gitLayout = null;
    const status = $("git-layout-status");
    if (status) {
      delete status.dataset.live;
      status.textContent = "";
      status.classList.add("hidden");
    }
    renderGitLayoutCard();
    return;
  }
  try {
    const entries = await listRootEntries(gitCreds());
    state.gitLayout = inspectRepoLayout(entries);
    log(`Repo layout: ${state.gitLayout.kind}${state.gitLayout.hasForceApp ? " (force-app present)" : ""}.`);
    const status = $("git-layout-status");
    if (status) {
      delete status.dataset.live;
      status.textContent = "";
      status.classList.add("hidden");
    }
  } catch (err) {
    state.gitLayout = null;
    log(`Could not inspect repo folders: ${err.message || err}`, "error");
  }
  renderGitLayoutCard();
}

async function inspectGitLayout() {
  await refreshGitLayoutOnly();
  if (shouldAutoScaffold(state.gitLayout) && !state.gitAutoScaffoldDone) {
    state.gitAutoScaffoldDone = true;
    try {
      await createSalesforceLayout();
    } catch (err) {
      log(`Could not create Salesforce folders: ${err.message || err}`, "error");
      if ($("git-layout-status")) {
        $("git-layout-status").dataset.live = "1";
        $("git-layout-status").classList.remove("hidden");
        $("git-layout-status").textContent = err.message || String(err);
      }
    }
  }
}

function openGitFiles() {
  const url = gitLayoutViewUrl();
  if (!url) throw new Error("Connect a repo first, then Open files in Git.");
  window.open(url, "_blank", "noopener,noreferrer");
}

async function salesforceTreeAlreadyInRepo() {
  await refreshGitLayoutOnly();
  if (hasSalesforceProject(state.gitLayout)) return true;
  const creds = gitCreds();
  const existing = await Promise.all([
    getFileContent(creds, "sfdx-project.json", creds.branch),
    getFileContent(creds, "manifest/package.xml", creds.branch),
    getFileContent(creds, "src/package.xml", creds.branch),
    getFileContent(creds, "force-app/main/default/classes/.gitkeep", creds.branch)
  ]);
  return existing.some(Boolean);
}

async function createSalesforceLayout() {
  requireGithub();
  if (await salesforceTreeAlreadyInRepo()) {
    setStatus("This repo already has Salesforce folders. OrgFlow did not overwrite them.", "ok");
    return;
  }
  const inspect = state.gitLayout || inspectRepoLayout([]);
  if (!canScaffold(inspect)) {
    setStatus("This repo already has a Salesforce project. Left it as-is.", "ok");
    return;
  }
  const files = scaffoldProjectFiles({
    apiVersion: apiVersion(),
    repoName: gitCreds().repo || "orgflow"
  }).map((file) => ({ path: file.path, base64: encodeUtf8Base64(file.text) }));
  log(`Adding suggested Salesforce folders (${files.length} files) in ${repoLabel(state.settings)}…`);
  const commit = await commitFiles({
    ...gitCreds(),
    files,
    message: "chore: add Salesforce DX folders for OrgFlow"
  });
  log(`Wrote force-app/main/default/{classes,objects,layouts,…} (${String(commit.sha || "").slice(0, 7) || "commit"}).`);
  setStatus("Suggested Salesforce folders added. Existing project files were not overwritten.", "ok");
  const folderUrl = browseFolderUrl(state.settings, "force-app/main/default");
  if (folderUrl) log(`Open Salesforce folders: ${folderUrl}`);
  await refreshGitLayoutOnly();
}

async function persistShipOptions() {
  await saveSettings({
    testLevel: $("test-level").value,
    checkOnly: $("check-only").checked,
    useGit: useGitEnabled(),
    specifiedTests: state.specifiedTests,
    lastSourceOrgId: $("source-org").value,
    lastTargetOrgId: $("target-org").value
  });
  state.settings = await loadSettings();
}

function requireGithub() {
  if (!useGitEnabled()) throw localError("Choose GitHub, GitLab, or Azure on Start first.");
  if (!isGitConfigured(state.settings)) {
    throw localError(`Connect a ${providerMeta(providerId(state.settings)).label} repo on the Start tab first.`);
  }
}

function requirePackage() {
  const types = normalizePackageTypes(state.packageTypes);
  if (!types.length) throw new Error("Pick configuration on the Pick tab, or paste a package.xml.");
  return types;
}

async function ensurePackage() {
  if (state.xmlDirty) await applyXmlToPicker();
  return requirePackage();
}

function specifiedTests() {
  return normalizeTestNames(state.specifiedTests);
}

function renderTestRunner() {
  const tests = specifiedTests();
  $("test-count").textContent = String(tests.length);
  const hints = suggestedTestClasses(state.packageTypes);
  const suggest = $("suggested-tests");
  const chips = [];
  if (hints.wildcard) {
    chips.push(`<div class="muted">This package includes all Apex classes (*). Scan the org and pick the tests you need.</div>`);
  }
  for (const name of hints.inPackage) {
    const on = tests.includes(name);
    chips.push(`<button type="button" class="suggest-chip" data-test-toggle="${escapeHtml(name)}">${on ? "✓ " : "+ "}${escapeHtml(name)} (in package)</button>`);
  }
  for (const name of hints.suggested) {
    const on = tests.includes(name);
    chips.push(`<button type="button" class="suggest-chip" data-test-toggle="${escapeHtml(name)}">${on ? "✓ " : "+ "}${escapeHtml(name)} (suggested)</button>`);
  }
  suggest.innerHTML = chips.length ? `<div class="suggest-row">${chips.join("")}</div>` : "";

  const filter = ($("test-filter")?.value || "").trim().toLowerCase();
  const cache = state.testClassCache;
  const list = $("test-class-list");
  const status = $("test-runner-status");
  if (packageHasApex(state.packageTypes) && !tests.length) {
    status.textContent = "Apex is in this package. Pick tests here, or Salesforce will require tests on production deploys.";
  } else if (!cache) {
    status.textContent = tests.length
      ? `${tests.length} test class${tests.length === 1 ? "" : "es"} selected.`
      : "Optional for config-only packages. Scan the source org to pick *Test classes.";
  } else if (cache.error) {
    status.textContent = cache.error;
  } else {
    status.textContent = `${cache.items.length} *Test classes in org · ${tests.length} selected to run`;
  }

  const selectedItems = tests.map((fullName) => ({ fullName, extra: true }));
  const orgItems = (cache?.items || []).filter((i) => !tests.includes(i.fullName));
  let combined = [...selectedItems, ...orgItems];
  if (filter) combined = combined.filter((i) => i.fullName.toLowerCase().includes(filter));
  if (!combined.length) {
    list.innerHTML = tests.length
      ? `<div class="empty">No test classes match that filter.</div>`
      : `<div class="empty">No test classes listed yet.</div>`;
    return;
  }
  const cap = isWorkbench() ? WORKBENCH_MEMBERS : MAX_MEMBERS;
  const shown = combined.slice(0, cap);
  list.innerHTML =
    shown
      .map((item) => {
        const checked = tests.includes(item.fullName) ? "checked" : "";
        return `<label><input type="checkbox" data-test="${escapeHtml(item.fullName)}" ${checked} /> ${escapeHtml(item.fullName)}</label>`;
      })
      .join("") +
    (combined.length > cap ? `<div class="muted">Showing ${cap} of ${combined.length}. Filter to find the rest.</div>` : "");
}

async function setSpecifiedTest(name, selected) {
  const set = new Set(specifiedTests());
  if (selected) set.add(name);
  else set.delete(name);
  state.specifiedTests = normalizeTestNames([...set]);
  if (state.specifiedTests.length && $("test-level").value === "NoTestRun") {
    $("test-level").value = "RunSpecifiedTests";
  }
  if (!state.specifiedTests.length && $("test-level").value === "RunSpecifiedTests") {
    $("test-level").value = packageHasApex(state.packageTypes) ? "RunLocalTests" : "NoTestRun";
  }
  await persistShipOptions();
  renderTestRunner();
  renderInspector();
}

async function scanOrgTests() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org on Start or Deploy first.");
  log(`Listing Apex classes in ${source.label} to find test classes…`);
  const items = await listMetadataType({
    instanceUrl: source.instanceUrl,
    sid: source.sid,
    typeName: "ApexClass",
    apiVersion: apiVersion(),
    onProgress: (m) => log(m)
  });
  const tests = items.filter((i) => isTestClassName(i.fullName));
  state.testClassCache = { items: tests, error: "" };
  log(`Found ${tests.length} test class${tests.length === 1 ? "" : "es"} (name ends with Test).`);
  renderTestRunner();
}

function openWorkbench() {
  if (isWorkbench()) return;
  const url = chrome.runtime.getURL("sidepanel.html") + "?layout=workbench";
  if (chrome.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, "orgflow-workbench");
  chrome.runtime?.sendMessage?.({ type: "closeSidePanel" })?.catch?.(() => {});
}

async function persistGitToggle(on) {
  $("use-git").checked = on;
  await saveSettings({ useGit: on });
  state.settings = await loadSettings();
  renderGitUi();
  renderInspector();
  updateHeaderStatus();
  updateActionState();
}

function resolveTicket(store) {
  const details = snapshotValidationItems();
  if (details.length) {
    throw localError(details.map((item) => item.text).join(" "), {
      focus: details[0].kicker === "Jira key" ? "jira" : "comment",
      operation: "save",
      validationItems: details
    });
  }
  return { ticket: jiraKeyValue().toUpperCase(), comment: gitCommitMessage() };
}

async function retrieveIntoReview() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org. Log into it in Chrome first.");
  if (hasFreshRetrieve() && state.retrieveOk) {
    log("Already retrieved this package from the From org. Change members, type, or From org to retrieve again.");
    setStatus("Already retrieved — Next to deploy, or Back to change members", "ok");
    return state.stagedFiles;
  }
  showOutcome({ running: true, operation: "retrieve" });
  try {
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
    state.selectionFrozen = true;
    state.retrieveSnapshot = {
      sourceKey: orgKey(source),
      fingerprint: packageFingerprint(),
      fileCount: files.length
    };
    state.retrieveOk = true;
    state.deployFinished = "";
    state.lastDeploy = null;
    state.lastValidate = null;
    try {
      renderFileList();
    } catch (uiErr) {
      log(`Retrieved files, but the file list could not render: ${uiErr.message || uiErr}`, "error");
    }
    applyRetrieveLockUi();
    showOutcome({ success: true, status: "Succeeded", fileCount: files.length, operation: "retrieve" });
    log(`Retrieved ${files.length} file(s). Next to deploy, or Back to Package to add more members.`);
    if (state.stepIndex !== stepIndexById("review")) goStep(stepIndexById("review"), { force: true });
    setStatus(`Retrieved ${files.length} files — Next to deploy`, "ok");
    return files;
  } catch (err) {
    if (state.stagedFiles?.length && state.retrieveSnapshot) {
      state.retrieveOk = true;
      showOutcome({ success: true, status: "Succeeded", fileCount: state.stagedFiles.length, operation: "retrieve" });
      log(`Retrieved ${state.stagedFiles.length} file(s). A later UI error was ignored: ${err.message || err}`, "error");
      return state.stagedFiles;
    }
    state.retrieveOk = false;
    showOutcome({
      success: false,
      status: "Failed",
      errorMessage: err.message || String(err),
      operation: "retrieve"
    });
    throw err;
  }
}

async function filesForDeploy() {
  if (!hasFreshRetrieve() || !state.retrieveOk) throw new Error(retrieveBlockReason() || "Retrieve must succeed before deploy.");
  return state.stagedFiles;
}

function deployOptions({ checkOnly = false } = {}) {
  const runTests = specifiedTests();
  const selectedLevel = $("test-level").value;
  if (selectedLevel === "RunSpecifiedTests" && !runTests.length) {
    throw new Error("Pick at least one test class in the Test class runner, or choose a different Tests option.");
  }
  return {
    testLevel: runTests.length ? "RunSpecifiedTests" : selectedLevel,
    checkOnly: Boolean(checkOnly),
    runTests
  };
}

function gitSnapshotRecord(version, files) {
  const creds = hostCreds(state.settings);
  return {
    ok: true,
    versionId: version?.id || "",
    path: version?.path || ".orgflow/releases",
    repo: repoLabel(state.settings),
    branch: creds.branch || "main",
    url: browseFolderUrl(state.settings, version?.path || ".orgflow/releases"),
    tree: files?.length ? snapshotTreeText(files, version?.path || ".orgflow/releases") : ""
  };
}

async function deploySelected({ checkOnly = false } = {}) {
  const target = selectedOrg("target-org");
  if (!target) throw new Error("Select a target org. Log into it in Chrome first.");
  if (!state.retrieveOk || !hasFreshRetrieve()) throw new Error(retrieveBlockReason() || "Retrieve must succeed before deploy.");
  if (!checkOnly && alreadyDeployedToCurrentTarget()) {
    throw new Error(`Already deployed this package to ${target.label}. Change To, or start a new package.`);
  }
  requireGitShipReady(checkOnly ? "validate" : "deploy");
  state.shipKind = checkOnly ? "validate" : "deploy";
  state.deployFinished = "running";
  showOutcome({ running: true, operation: checkOnly ? "validate" : "deploy" });
  updateActionState();
  try {
    await persistShipOptions();
    const files = await filesForDeploy();
    const zipBase64 = await zipFromFiles(files);
    const options = deployOptions({ checkOnly });
    if (options.runTests.length) log(`Running specified tests: ${options.runTests.join(", ")}`);
    log(`${checkOnly ? "Validating" : "Deploying"} ${files.length} file(s) to ${target.label} (${options.testLevel})…`);
    const result = await deployMetadata({
      instanceUrl: target.instanceUrl,
      sid: target.sid,
      zipBase64,
      options,
      apiVersion: apiVersion(),
      onProgress: (m) => log(m)
    });
    const operation = checkOnly ? "validate" : "deploy";
    if (checkOnly) {
      state.deployFinished = "";
      state.lastValidate = result.success
        ? { ok: true, targetKey: orgKey(target), fingerprint: packageFingerprint() }
        : null;
    } else {
      state.deployFinished = result.success ? "success" : "failed";
      if (result.success) {
        state.lastDeploy = { targetKey: orgKey(target), fingerprint: packageFingerprint() };
      }
    }
    state.shipKind = "";
    showOutcome({ ...result, operation });
    updateActionState();
    if (!result.success) {
      const formatted = formatOperationOutcome({ ...result, operation });
      const first = formatted.items[0];
      const summary = first?.problem || first?.text || result.status || "Failed";
      log(`${checkOnly ? "Validate" : "Deploy"} failed: ${summary}`, "error");
      setStatus(`${checkOnly ? "Validate" : "Deploy"} failed — see the result on Confirm`, "error");
      return result;
    }
    if (checkOnly) {
      log(`Validated in ${target.label} — nothing was saved. Deploy when you are ready.`);
      setStatus(`Validated in ${target.label} — Deploy when you are ready`, "ok");
      return result;
    }
    log(`Deployed selected package to ${target.label} (${result.status || "Succeeded"}).`);
    setStatus(`Deployed package → ${target.label}`, "ok");
    if (useGitEnabled()) {
      try {
        const version = await recordSuccessfulGitDeploy(target, result, options);
        const gitRecord = gitSnapshotRecord(version, state.stagedFiles);
        showOutcome({ ...result, operation: "deploy", gitRecord });
        log(`Snapshot ${version.id} is in ${gitRecord.path} on ${gitRecord.branch} (${gitRecord.repo}).`);
        setStatus(`Deployed to ${target.label} · snapshot in ${gitRecord.path}`, "ok");
      } catch (gitErr) {
        const gitRecord = { ok: false, error: gitErr.message || String(gitErr) };
        showOutcome({ ...result, operation: "deploy", gitRecord });
        log(`Salesforce deploy succeeded, but ${providerMeta(providerId(state.settings)).label} could not record it: ${gitRecord.error}`, "error");
        setStatus(`Deployed to Salesforce, but Git was not updated`, "error");
      }
    }
    return result;
  } catch (err) {
    state.deployFinished = "failed";
    state.shipKind = "";
    if (err.local) showLocalFailure(err.operation || (checkOnly ? "validate" : "deploy"), err);
    else showOutcome({ success: false, status: "Failed", errorMessage: err.message || String(err), operation: checkOnly ? "validate" : "deploy" });
    updateActionState();
    throw err;
  }
}

async function recordSuccessfulGitDeploy(target, result, options, existingVersion) {
  await loadVersionStore();
  let version = existingVersion;
  if (!version && state.lastSaved?.id && state.lastSaved.fingerprint === stagedFilesFingerprint()) {
    version = findVersion(state.versions.versions, state.lastSaved.id);
  }
  const message = requireGitCommitMessage();
  const deployment = {
    org: { id: target.id, label: target.label, instanceUrl: target.instanceUrl },
    status: result.status || "Succeeded",
    comment: message,
    checkOnly: options.checkOnly,
    testLevel: options.testLevel
  };
  if (!version) return saveVersion({ deployment });
  const updated = addDeployment(version, deployment);
  const store = upsertVersion(state.versions, updated);
  if (useGitEnabled() && version.storage !== "local") {
    requireGithub();
    await commitFiles({
      ...gitCreds(),
      files: [{ path: versionsFilePath(), base64: encodeUtf8Base64(JSON.stringify(store, null, 2) + "\n") }],
      message: `${message}\n\n${version.id}: deployed to ${target.label}${options.checkOnly ? " (validate)" : ""}`
    });
  } else {
    await saveLocalVersionStore(store);
  }
  state.versions = store;
  state.lastSaved = { id: updated.id, fingerprint: stagedFilesFingerprint() };
  renderVersions();
  return updated;
}

async function saveVersion(options = {}) {
  if (useGitEnabled()) requireGitShipReady("save");
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org. Log into it in Chrome first.");
  const types = await ensurePackage();
  await persistShipOptions();
  await persistPackage();

  const files = hasFreshRetrieve() ? state.stagedFiles : null;
  if (!files?.length) throw new Error(retrieveBlockReason());
  await loadVersionStore();
  const { ticket, comment } = resolveTicket(state.versions);
  const increment = nextIncrement(state.versions.versions, ticket);
  let record = createVersionRecord({
    jira: ticket,
    increment,
    comment,
    author: state.githubUser?.login || "",
    sourceOrg: { id: source.id, label: source.label, instanceUrl: source.instanceUrl, username: source.username },
    fileCount: files.length,
    components: types
  });
  record.storage = useGitEnabled() ? "git" : "local";
  if (options.deployment) record = addDeployment(record, options.deployment);

  if (!useGitEnabled()) {
    const nextStore = upsertVersion(state.versions, record);
    await saveLocalRelease(record.id, files);
    state.versions = await saveLocalVersionStore(nextStore);
    state.lastSaved = { id: record.id, fingerprint: stagedFilesFingerprint() };
    renderVersions();
    $("jira").value = record.jira;
    log(`Saved ${record.id} in Local snapshots (${files.length} files).`);
    setStatus(`Saved ${record.id} in Local snapshots`, "ok");
    return record;
  }

  const prefixed = files.map((f) => ({ path: `${record.path}/${f.path}`, base64: f.base64 }));
  const nextStore = upsertVersion(state.versions, record);
  prefixed.push({
    path: versionsFilePath(),
    base64: encodeUtf8Base64(JSON.stringify(nextStore, null, 2) + "\n")
  });

  log(`Writing ${files.length} files to ${repoLabel(state.settings)}…`);
  const commit = await commitFiles({
    ...gitCreds(),
    files: prefixed,
    message: `${record.id}: ${comment}`
  });
  record.commitSha = commit.sha;
  const withSha = upsertVersion(nextStore, record);
  state.versions = withSha;
  state.lastSaved = { id: record.id, fingerprint: stagedFilesFingerprint() };
  renderVersions();
  $("jira").value = record.jira;
  log(`Saved ${record.id} (${files.length} files, commit ${commit.sha.slice(0, 7)}) under ${record.path}.`);
  setStatus(`Saved ${record.id} to ${record.path} on ${gitCreds().branch}`, "ok");
  const folderUrl = browseFolderUrl(state.settings, record.path);
  if (folderUrl) log(`Open snapshot folder: ${folderUrl}`);
  if (state.deployFinished !== "running") {
    showOutcome({
      success: true,
      status: "Saved",
      operation: "save",
      gitRecord: gitSnapshotRecord(record, files)
    });
  }
  return record;
}

async function deployVersion(explicitId) {
  const target = selectedOrg("target-org");
  if (!target) throw new Error("Select a target org. Log into it in Chrome first.");
  await persistShipOptions();
  await loadVersionStore();
  const wanted = explicitId || $("jira").value.trim();
  if (!wanted) throw new Error("Enter a Jira ticket or version id (for example PROJ-123 or PROJ-123-v2).");
  const version = findVersion(state.versions.versions, wanted);
  if (!version) throw new Error(`No saved version found for "${wanted}". Save it from the source org first.`);
  if (useGitEnabled() && version.storage !== "local") {
    requireGitShipReady("deploy");
  }

  let files = [];
  if (version.storage === "local" || !useGitEnabled()) {
    files = await loadLocalRelease(version.id);
    if (!files.length) throw new Error(`No local files found for ${version.id}. Save the version again from Review.`);
    log(`Loading ${version.id} from Local snapshots…`);
  } else {
    requireGithub();
    const creds = gitCreds();
    const ref = await getRef(creds);
    const sha = version.commitSha || ref?.object?.sha;
    if (!sha) throw new Error("Repo branch has no commits yet.");
    log(`Loading ${version.id} from the repo (${version.path})…`);
    files = await fetchReleaseFiles({ ...creds, commitSha: sha, prefix: version.path });
    if (!files.length) throw new Error(`No files found at ${version.path}.`);
  }

  const zipBase64 = await zipFromFiles(files);
  const options = deployOptions();
  if (options.runTests.length) log(`Running specified tests: ${options.runTests.join(", ")}`);
  log(`Deploying ${version.id} to ${target.label} (${options.testLevel})…`);
  const result = await deployMetadata({
    instanceUrl: target.instanceUrl,
    sid: target.sid,
    zipBase64,
    options,
    apiVersion: apiVersion(),
    onProgress: (m) => log(m)
  });
  showOutcome({ ...result, operation: "deploy" });
  if (!result.success) {
    log(`Deploy of ${version.id} failed: ${result.errorMessage || result.status || "Failed"}`, "error");
    setStatus(`Deploy failed — see the result panel`, "error");
    return version;
  }
  try {
    const updated = await recordSuccessfulGitDeploy(target, result, options, version);
    const gitRecord = useGitEnabled() ? gitSnapshotRecord(updated, files) : null;
    showOutcome({ ...result, operation: "deploy", gitRecord });
    log(`Deployed ${version.id} to ${target.label} (${result.status || "Succeeded"}).`);
    if (gitRecord) log(`Snapshot ${updated.id} is in ${gitRecord.path} on ${gitRecord.branch}.`);
    setStatus(`Deployed ${version.id} → ${target.label}`, "ok");
    return updated;
  } catch (gitErr) {
    if (useGitEnabled()) {
      showOutcome({ ...result, operation: "deploy", gitRecord: { ok: false, error: gitErr.message || String(gitErr) } });
    }
    throw gitErr;
  }
}

async function loadOrgTypes() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org on Start or Deploy first.");
  log(`Loading every metadata type from ${source.label}…`);
  const described = await describeOrgMetadata({
    instanceUrl: source.instanceUrl,
    sid: source.sid,
    apiVersion: apiVersion()
  });
  state.availableTypes = mergeDescribedTypes(described);
  renderTypePicker();
  log(`Loaded ${state.availableTypes.length} metadata types (including child types like fields).`);
}

async function loadMembers() {
  const source = selectedOrg("source-org");
  if (!source) throw new Error("Select a source org on Start or Deploy first.");
  const typeName = state.activeType;
  if (!typeName) throw new Error("Pick a metadata type first.");
  const meta = typesForPicker().find((t) => t.name === typeName);
  log(`Listing ${typeName} in ${source.label}…`);
  try {
    const listed = await listMetadataType({
      instanceUrl: source.instanceUrl,
      sid: source.sid,
      typeName,
      folderType: meta?.folderType,
      inFolder: meta?.inFolder,
      apiVersion: apiVersion(),
      onProgress: (m) => log(m)
    });
    const items = withStandardObjectMembers(typeName, listed);
    state.membersCache[typeName] = { items, error: "" };
    const extra = typeName === "CustomObject" ? " (standard objects included)" : "";
    log(`Found ${items.length} ${typeName} member(s)${extra}.`);
  } catch (err) {
    const fallback = withStandardObjectMembers(typeName, []);
    state.membersCache[typeName] = {
      items: fallback,
      error: fallback.length ? `${err.message} Standard objects are still listed.` : err.message
    };
    if (!fallback.length) throw err;
    log(err.message, "error");
  }
  renderMembers();
}

function applyXmlToPicker() {
  const parsed = assertPackageXml($("package-xml").value);
  state.packageTypes = parsed.types;
  state.xmlDirty = false;
  invalidateStaged();
  $("package-xml").value = buildPackageXmlFromTypes(state.packageTypes, parsed.version || apiVersion());
  maybeTrackApexTests("ApexClass", suggestedTestClasses(state.packageTypes).inPackage);
  return persistPackage();
}

function rebuildXmlFromPicker() {
  state.xmlDirty = false;
  $("package-xml").value = currentXml();
  $("xml-status").textContent = "XML rebuilt from the picker.";
  renderInspector();
}

function maybeTrackApexTests(typeName, names) {
  if (typeName !== "ApexClass") return;
  const set = new Set(state.specifiedTests);
  for (const name of names || []) {
    if (isTestClassName(name)) set.add(name);
  }
  state.specifiedTests = normalizeTestNames([...set]);
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
  if (name === "start") goStep(0, { force: true });
  else if (name === "components") goStep(stepIndexById("package"), { force: true });
  else if (name === "ship") goStep(canAdvanceTo(stepIndexById("deploy")) ? stepIndexById("deploy") : farthestStep(), { force: true });
  else if (name === "versions") showVersions();
}

function switchSubtab(name) {
  document.querySelectorAll(".subtab").forEach((t) => t.classList.toggle("active", t.dataset.subtab === name));
  document.querySelectorAll(".subview").forEach((v) => v.classList.toggle("active", v.id === `subview-${name}`));
}

async function run(action) {
  if (state.busy) {
    setStatus("Wait — OrgFlow is still finishing the last action.", "error");
    return;
  }
  setBusy(true);
  try {
    await action();
  } catch (err) {
    console.error(err);
    log(err.message || String(err), "error");
    const step = currentStepId();
    const local = Boolean(err.local);
    const operation = err.operation
      || (local ? (step === "review" ? "save" : "deploy") : (step === "review" ? "retrieve" : "deploy"));
    if (step === "review" && state.retrieveOk && !local) {
      /* retrieve already succeeded — don't paint the result as failed */
    } else if (step === "review" || step === "deploy" || local) {
      if (local) showLocalFailure(operation, err);
      else {
        showOutcome({
          success: false,
          status: "Failed",
          errorMessage: err.message || String(err),
          operation
        });
      }
    }
    if (step === "deploy" && state.deployFinished === "running") state.deployFinished = "failed";
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
$("stepper")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-step]");
  if (!btn || btn.disabled) return;
  goStep(Number(btn.dataset.step));
});
$("btn-back")?.addEventListener("click", wizardBack);
$("btn-next")?.addEventListener("click", async () => {
  if (state.busy) return;
  if (state.stepIndex === 0) {
    await run(async () => {
      await saveSettings({ setupComplete: true, useGit: useGitEnabled() });
      state.settings = await loadSettings();
      if (useGitEnabled() && isGitConfigured(state.settings)) await ensureReleasePath();
    });
  }
  wizardNext();
});
$("btn-goto-versions")?.addEventListener("click", () => run(openVersionsPanel));
$("open-versions")?.addEventListener("click", () => run(openVersionsPanel));
$("btn-compare-before-deploy")?.addEventListener("click", () => run(openVersionsPanel));
$("btn-open-versions-deploy")?.addEventListener("click", () => run(openVersionsPanel));
$("btn-compare-versions")?.addEventListener("click", () => run(runCompareVersions));
$("btn-load-revert-files")?.addEventListener("click", () => run(loadRevertFileList));
$("btn-revert-select-changed")?.addEventListener("click", selectChangedRevertFiles);
$("btn-revert-files")?.addEventListener("click", () => run(revertSelectedFiles));
$("compare-file-list")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-compare-file]");
  if (btn) showCompareDiff(btn.dataset.compareFile);
});
$("jira")?.addEventListener("input", () => {
  updateActionState();
  if (currentStepId() === "deploy") renderDeployManifest();
});
$("comment")?.addEventListener("input", () => {
  if (gitCommitMessage()) state.gitShipWarned = false;
  updateActionState();
  if (currentStepId() === "deploy") renderDeployManifest();
});
$("btn-show-xml")?.addEventListener("click", () => {
  state.xmlReview = true;
  switchSubtab("xml");
});
$("btn-back-to-files")?.addEventListener("click", () => {
  state.xmlReview = false;
  switchSubtab("review");
});

$("goto-components").addEventListener("click", () => goStep(stepIndexById("package"), { force: true }));
$("goto-workbench")?.addEventListener("click", openWorkbench);
$("open-workbench")?.addEventListener("click", openWorkbench);
$("open-workbench-banner")?.addEventListener("click", openWorkbench);
$("btn-connect-github").addEventListener("click", () => run(connectGithub));
$("git-provider")?.addEventListener("change", () => {
  fillGitHostUi();
  const help = $("git-help");
  if (help) help.open = true;
  state.repos = [];
  renderRepos();
});
$("git-org")?.addEventListener("input", fillGitHostUi);
$("git-base-url")?.addEventListener("input", fillGitHostUi);
$("btn-save-repo").addEventListener("click", () => run(saveRepo));
$("btn-view-git-files")?.addEventListener("click", () => {
  try {
    openGitFiles();
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
});
$("btn-create-sf-layout")?.addEventListener("click", () => run(createSalesforceLayout));
$("pipeline-select")?.addEventListener("change", () => {
  if ($("pipeline-select")?.value) run(useSelectedPipeline);
  else syncSetupButtons();
});
$("pipeline-name")?.addEventListener("input", syncSetupButtons);
$("gh-branch")?.addEventListener("input", syncSetupButtons);
$("gh-token")?.addEventListener("input", syncSetupButtons);
$("gh-repo-input")?.addEventListener("input", syncSetupButtons);
$("gh-repo")?.addEventListener("change", () => {
  const selectedRepo = state.repos.find((r) => r.fullName === $("gh-repo").value);
  if (selectedRepo?.defaultBranch && !$("gh-branch").value.trim()) {
    $("gh-branch").value = selectedRepo.defaultBranch;
  }
  if ($("gh-token")?.value.trim() || hostCreds(state.settings).token) run(saveRepo);
});
$("gh-repo-input")?.addEventListener("change", () => {
  if (($("gh-repo-input")?.value.trim()) && ($("gh-token")?.value.trim() || hostCreds(state.settings).token)) {
    run(saveRepo);
  }
});
$("btn-refresh-orgs").addEventListener("click", () => run(refreshOrgs));
$("refresh-all").addEventListener("click", () => run(refreshAll));
$("btn-save").addEventListener("click", () => run(saveVersion));
$("btn-deploy").addEventListener("click", () => run(() => deployVersion()));
$("btn-validate-selected")?.addEventListener("click", () => run(() => deploySelected({ checkOnly: true })));
$("btn-deploy-selected").addEventListener("click", () => run(() => deploySelected({ checkOnly: false })));
$("btn-deploy-from-pick").addEventListener("click", () => run(deploySelected));
$("btn-deploy-review").addEventListener("click", () => run(deploySelected));
$("btn-retrieve").addEventListener("click", () => run(retrieveIntoReview));
$("btn-retrieve-review").addEventListener("click", () => run(retrieveIntoReview));
$("btn-both").addEventListener("click", () => run(async () => {
  await saveVersion();
  await deployVersion();
}));
$("btn-load-members").addEventListener("click", () => run(loadMembers));
$("btn-load-types").addEventListener("click", () => run(loadOrgTypes));
$("btn-apply-xml").addEventListener("click", () => run(applyXmlToPicker));
$("btn-rebuild-xml").addEventListener("click", rebuildXmlFromPicker);
$("btn-save-file").addEventListener("click", () => run(saveFileEdits));
const clearPackage = () => run(async () => {
  state.packageTypes = [];
  state.xmlDirty = false;
  invalidateStaged();
  await persistPackage();
});
$("btn-clear-package")?.addEventListener("click", clearPackage);
$("btn-clear-package-inspector")?.addEventListener("click", clearPackage);
$("btn-clear-type").addEventListener("click", () => run(async () => {
  state.packageTypes = setTypeMembers(state.packageTypes, state.activeType, []);
  invalidateStaged();
  await persistPackage();
}));
$("btn-select-visible").addEventListener("click", () => run(async () => {
  const boxes = [...document.querySelectorAll("#member-list input[data-member]")];
  const names = boxes.map((b) => b.dataset.member);
  if (!names.length) throw new Error("Load or filter members first.");
  const typeName = state.activeType;
  const current = selectedMembersFor(typeName);
  names.forEach((n) => current.add(n));
  state.packageTypes = setTypeMembers(state.packageTypes, typeName, [...current]);
  maybeTrackApexTests(typeName, names);
  invalidateStaged();
  await persistPackage();
}));
$("btn-add-member").addEventListener("click", () => run(async () => {
  const name = $("manual-member").value.trim();
  if (!name) throw new Error("Enter a metadata member name.");
  const typeName = state.activeType;
  state.packageTypes = toggleMember(state.packageTypes, typeName, name, true);
  maybeTrackApexTests(typeName, [name]);
  $("manual-member").value = "";
  invalidateStaged();
  await persistPackage();
}));
$("type-search").addEventListener("input", () => {
  renderTypePicker();
});
$("type-picklist")?.addEventListener("change", () => {
  chooseType($("type-picklist").value);
});
$("type-shortcuts")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-type]");
  if (btn) chooseType(btn.dataset.type);
});
$("type-picker").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-type]");
  if (btn) chooseType(btn.dataset.type);
});
$("package-hints")?.addEventListener("click", (event) => {
  const add = event.target.closest("[data-hint-add]");
  if (add) {
    run(() => addRecentHint(add.dataset.type, add.dataset.member));
    return;
  }
  const related = event.target.closest("[data-hint-related]");
  if (related) openRelatedHint(related.dataset.type, related.dataset.object || "");
});
$("btn-change-type")?.addEventListener("click", () => {
  $("type-search")?.focus();
  $("type-browse")?.scrollIntoView({ block: "start", behavior: "smooth" });
});
$("object-chips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-object]");
  if (!chip) return;
  state.objectFilter = chip.dataset.object || "";
  if ($("object-filter")) $("object-filter").value = state.objectFilter;
  renderMembers();
});
$("object-filter")?.addEventListener("change", () => {
  state.objectFilter = $("object-filter").value;
  renderMembers();
});
$("mode-simple")?.addEventListener("click", () => run(() => persistGitToggle(false)));
$("mode-git")?.addEventListener("click", () => run(() => persistGitToggle(true)));
$("btn-start-continue")?.addEventListener("click", () => run(async () => {
  await saveSettings({ setupComplete: true, useGit: useGitEnabled() });
  state.settings = await loadSettings();
  wizardNext();
}));
$("btn-use-pipeline")?.addEventListener("click", () => run(useSelectedPipeline));
$("btn-save-pipeline")?.addEventListener("click", () => run(saveCurrentPipeline));
$("btn-add-stage")?.addEventListener("click", () => run(addOrgToPromotionPath));
$("deploy-pipeline")?.addEventListener("change", () => {
  if ($("pipeline-select") && $("deploy-pipeline").value) $("pipeline-select").value = $("deploy-pipeline").value;
  run(useSelectedPipeline);
});
$("member-filter").addEventListener("input", renderMembers);
$("show-newest-first")?.addEventListener("change", renderMembers);
$("show-selected-only")?.addEventListener("change", renderMembers);
$("member-list").addEventListener("change", (event) => {
  const box = event.target.closest("input[data-member]");
  if (!box) return;
  run(async () => {
    const typeName = state.activeType;
    const listed = (state.membersCache[typeName]?.items || []).map((i) => i.fullName);
    state.packageTypes = toggleMember(state.packageTypes, typeName, box.dataset.member, box.checked, listed);
    if (box.checked) maybeTrackApexTests(typeName, [box.dataset.member]);
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
  const compareId = event.target.dataset.compare;
  const revertId = event.target.dataset.revert;
  const useId = event.target.dataset.use;
  const deployId = event.target.dataset.deploy;
  if (compareId) {
    if ($("compare-left")) $("compare-left").value = state.stagedFiles?.length ? "current" : compareId;
    if ($("compare-right")) $("compare-right").value = compareId;
    run(runCompareVersions);
  }
  if (revertId) {
    if ($("revert-from")) $("revert-from").value = revertId;
    run(loadRevertFileList);
    $("version-revert-card")?.scrollIntoView({ block: "nearest" });
  }
  if (useId) {
    $("jira").value = useId;
    goStep(stepIndexById("deploy"), { force: true });
  }
  if (deployId) {
    if (useGitEnabled() && !gitCommitMessage()) {
      log("Enter a commit message before deploying this version.", "error");
      $("comment")?.focus();
      return;
    }
    $("jira").value = deployId;
    goStep(stepIndexById("deploy"), { force: true });
    run(() => deployVersion(deployId));
  }
});
$("use-git")?.addEventListener("change", () => run(() => persistGitToggle($("use-git").checked)));
$("btn-unlock-retrieve")?.addEventListener("click", unlockSelection);
$("source-org")?.addEventListener("change", () => run(async () => {
  const previous = state.retrieveSnapshot?.sourceKey;
  await saveSettings({ lastSourceOrgId: $("source-org").value, lastTargetOrgId: $("target-org").value });
  state.settings = await loadSettings();
  if ($("source-org").value && !$("target-org").value && state.orgs.length === 2) {
    const other = state.orgs.find((o) => orgKey(o) !== $("source-org").value);
    if (other) $("target-org").value = orgKey(other);
  }
  if (previous && previous !== $("source-org").value) {
    if (state.promotingHop) state.promotingHop = false;
    else {
      state.membersCache = {};
  state.recentWarmGen += 1;
      state.availableTypes = fallbackTypeRecords();
      invalidateStaged();
    }
  }
  updateActionState();
  maybeAdvanceFromStart();
}));
$("target-org")?.addEventListener("change", () => run(async () => {
  await saveSettings({ lastSourceOrgId: $("source-org").value, lastTargetOrgId: $("target-org").value });
  state.settings = await loadSettings();
  if (alreadyDeployedToCurrentTarget()) state.deployFinished = "success";
  else if (state.deployFinished === "success") state.deployFinished = "";
  updateActionState();
  maybeAdvanceFromStart();
}));
$("inspector-filter")?.addEventListener("input", renderInspector);
document.querySelectorAll(".insp-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.inspectorView = btn.dataset.insp;
    renderInspector();
  });
});
$("btn-scan-tests")?.addEventListener("click", () => run(scanOrgTests));
$("btn-clear-tests")?.addEventListener("click", () => run(async () => {
  state.specifiedTests = [];
  if ($("test-level").value === "RunSpecifiedTests") {
    $("test-level").value = packageHasApex(state.packageTypes) ? "RunLocalTests" : "NoTestRun";
  }
  await persistShipOptions();
  renderTestRunner();
  renderInspector();
}));
$("btn-add-test")?.addEventListener("click", () => run(async () => {
  const name = $("manual-test").value.trim();
  if (!name) throw new Error("Enter a test class name.");
  $("manual-test").value = "";
  await setSpecifiedTest(name, true);
}));
$("test-filter")?.addEventListener("input", renderTestRunner);
$("test-class-list")?.addEventListener("change", (event) => {
  const box = event.target.closest("input[data-test]");
  if (!box) return;
  run(() => setSpecifiedTest(box.dataset.test, box.checked));
});
$("suggested-tests")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-test-toggle]");
  if (!btn) return;
  const name = btn.dataset.testToggle;
  const on = !specifiedTests().includes(name);
  run(() => setSpecifiedTest(name, on));
});
$("test-level")?.addEventListener("change", () => run(persistShipOptions));

if (isWorkbench()) {
  chrome.runtime?.sendMessage?.({ type: "closeSidePanel" })?.catch?.(() => {});
}

refreshAll();
