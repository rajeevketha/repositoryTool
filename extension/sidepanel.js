import { loadSettings, saveSettings, isGithubConfigured, repoLabel } from "./lib/storage.js";
import { catalogGroupsFromTypes, memberHint, fallbackTypeRecords, mergeDescribedTypes, withStandardObjectMembers, objectFilterOptions, memberObjectKey, OBJECT_FILTER_TYPES, isStandardObject } from "./lib/metadataTypes.js";
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
import {
  pipelinesFilePath,
  emptyPipelineStore,
  parsePipelineStore,
  createPipeline,
  upsertPipeline,
  findPipeline,
  matchOrg
} from "./lib/pipelines.js";
import { discoverOrgsFromCookies, orgKey } from "./lib/salesforce.js";
import { retrieveMetadata, deployMetadata, unzipToFiles, zipFromFiles, listMetadataType, describeOrgMetadata } from "./lib/metadata.js";
import {
  buildPackageXmlFromTypes,
  assertPackageXml,
  memberCount,
  packageSummary,
  toggleMember,
  setTypeMembers,
  normalizePackageTypes
} from "./lib/packageXml.js";
import {
  categoryColumns,
  filterCategoryColumns,
  suggestedTestClasses,
  packageHasApex,
  isTestClassName,
  normalizeTestNames
} from "./lib/packageView.js";
import { isEditablePath, decodeUtf8Base64, withEditedText } from "./lib/files.js";

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
  { id: "type", label: "Type", view: "components" },
  { id: "members", label: "Members", view: "components" },
  { id: "review", label: "Review", view: "components" },
  { id: "deploy", label: "Deploy", view: "ship" }
];

const state = {
  settings: null,
  orgs: [],
  versions: emptyVersionStore(),
  githubUser: null,
  repos: [],
  busy: false,
  packageTypes: [],
  xmlDirty: false,
  activeType: "CustomField",
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
  retrieveSnapshot: null
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
  const frozen = Boolean(state.selectionFrozen && hasFreshRetrieve());
  const stale = Boolean(state.retrieveSnapshot && !hasFreshRetrieve());
  document.body.classList.toggle("retrieve-frozen", frozen);
  document.body.classList.toggle("retrieve-stale", stale);
  const sourceEl = $("source-org");
  if (sourceEl) sourceEl.disabled = frozen;
  const lock = $("retrieve-lock");
  const copy = $("retrieve-lock-copy");
  const unlock = $("btn-unlock-retrieve");
  if (lock) {
    lock.classList.toggle("hidden", !frozen && !stale);
    lock.classList.toggle("stale", stale && !frozen);
  }
  if (copy) {
    const source = selectedOrg("source-org");
    if (frozen) {
      copy.textContent = `Retrieved ${state.stagedFiles.length} files from ${source?.label || "From org"}. From org and members are frozen to that snapshot.`;
    } else if (stale) {
      copy.textContent = "From org or members changed after retrieve. Retrieve again — deploy stays off until then.";
    }
  }
  if (unlock) {
    unlock.classList.toggle("hidden", !frozen);
    unlock.disabled = !frozen;
  }
  for (const id of ["btn-change-type", "btn-clear-type", "btn-select-visible", "btn-add-member", "btn-clear-package", "btn-clear-package-inspector", "btn-apply-xml"]) {
    const el = $(id);
    if (el) el.disabled = frozen || state.busy;
  }
}

function unlockSelection() {
  state.selectionFrozen = false;
  applyRetrieveLockUi();
  setStatus("From org and members are unlocked. If you change them, retrieve again before deploy.", "ok");
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
  const retrieve = retrieveBlockReason();
  if (retrieve && !hasFreshRetrieve()) return retrieve;
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
    if (needs.includes("git") && (!useGitEnabled() || !isGithubConfigured(state.settings))) disabled = true;
    btn.disabled = disabled;
  });
  const callout = $("deploy-reason");
  if (callout) {
    const blocking = reason && (reason.includes("target") || reason.includes("same org") || reason.includes("Detect"));
    callout.textContent = reason || `Ready to deploy ${selectedOrg("source-org")?.label} → ${selectedOrg("target-org")?.label}.`;
    callout.className = `callout ${reason ? "warn" : "ok"}`;
    callout.classList.toggle("hidden", !reason && !selectedOrg("target-org"));
  }
  renderOrgPath();
  applyRetrieveLockUi();
  updateWizardNav();
  renderStepper();
}

function renderOrgPath() {
  const source = selectedOrg("source-org");
  const target = selectedOrg("target-org");
  const caption = $("path-caption");
  const sub = $("path-sub");
  const bar = $("org-path");
  if ($("source-org-meta")) {
    $("source-org-meta").textContent = source
      ? `${orgKind(source)} · ${source.username || source.instanceUrl}`
      : "Where you built the change";
  }
  if ($("target-org-meta")) {
    $("target-org-meta").textContent = target
      ? `${orgKind(target)} · ${target.username || target.instanceUrl}`
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
    sub.textContent = ready
      ? `Simple path: configuration moves ${orgKind(source)} → ${orgKind(target)}.`
      : "Next stays off until From and To are different Salesforce orgs.";
  }
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
  if (!state.typeChosen) return 1;
  if (!memberCount(state.packageTypes)) return 2;
  if (!hasFreshRetrieve()) return 3;
  return 4;
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
  if (index === 1 && !state.typeChosen) return "Tap a configuration type — for example Custom Field or Custom Object.";
  if (index === 2 && !memberCount(state.packageTypes)) return "Tick at least one member (orange check) before review.";
  if (index === 3 && !hasFreshRetrieve()) return retrieveBlockReason();
  return "";
}

function stepBlockReason(index) {
  if (canAdvanceTo(index)) return "";
  if (index > 0 && !pathReady()) return leaveReason(0);
  if (index > 1 && !state.typeChosen) return leaveReason(1);
  if (index > 2 && !memberCount(state.packageTypes)) return leaveReason(2);
  if (index > 3) return retrieveBlockReason() || "Open Review and retrieve first, then you can deploy.";
  return "Finish the current step before skipping ahead.";
}

function updatePickCopy() {
  const stepId = currentStepId();
  const type = typesForPicker().find((t) => t.name === state.activeType);
  if ($("pick-kicker")) $("pick-kicker").textContent = `Step ${state.stepIndex + 1} of 5`;
  if (stepId === "type") {
    if ($("pick-heading")) $("pick-heading").textContent = "Choose a configuration type";
    if ($("pick-lead")) {
      $("pick-lead").textContent = "Tap one card (Custom Field, Custom Object, Flow…). That opens the member list for only that type.";
    }
  } else if (stepId === "members") {
    if ($("pick-heading")) $("pick-heading").textContent = type ? `Tick ${type.label} members` : "Tick members";
    if ($("pick-lead")) {
      $("pick-lead").textContent = "Orange tick = in the package. Use the object chips to shrink a long list, then Next to review files.";
    }
  } else if (stepId === "review") {
    if ($("pick-heading")) $("pick-heading").textContent = "Review files";
    if ($("pick-lead")) {
      $("pick-lead").textContent = "Retrieve from the From org. That freezes From and members. Unlock only if you need to change them, then retrieve again before deploy.";
    }
  }
  if ($("header-sub")) {
    const labels = {
      start: "Step 1 · Connect orgs",
      type: "Step 2 · Choose a type",
      members: "Step 3 · Tick members",
      review: "Step 4 · Review files",
      deploy: "Step 5 · Deploy",
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
    return `<button type="button" class="step ${active} ${done}" data-step="${i}" ${allowed ? "" : "disabled"} aria-current="${i === current ? "step" : "false"}">
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
    back.textContent = "Back to deploy";
    next.textContent = "Next";
    hint.textContent = "Versions are snapshots. Back returns to Deploy.";
    return;
  }
  back.disabled = state.stepIndex === 0;
  back.textContent = "Back";
  const last = state.stepIndex >= STEPS.length - 1;
  const reason = leaveReason(state.stepIndex);
  next.disabled = last || Boolean(reason) || state.busy;
  const labels = ["Next: pick type", "Next: members", "Next: review", "Next: deploy", "Deploy above"];
  next.textContent = labels[state.stepIndex] || "Next";
  hint.textContent = reason
    || (last ? "Last step — use Deploy to target org above." : `Step ${state.stepIndex + 1} of 5 · ${currentStep().label}`);
}

function applyStepUi() {
  const names = ["start", "components", "ship", "versions"];
  names.forEach((name) => $(`view-${name}`)?.classList.toggle("active", false));
  if (state.showingVersions) {
    $("view-versions")?.classList.add("active");
    document.body.dataset.step = "versions";
    updatePickCopy();
    renderStepper();
    updateWizardNav();
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
  if (step.id === "type" && selectedOrg("source-org") && !typesForPicker().some((t) => t.fromOrg)) {
    setTimeout(() => run(loadOrgTypes), 0);
  }
  updatePickCopy();
  syncTypeChosenUi();
  renderStepper();
  updateWizardNav();
}

function goStep(index, { force = false } = {}) {
  if (state.showingVersions && index >= 0) state.showingVersions = false;
  if (!force && !canAdvanceTo(index)) {
    setStatus(stepBlockReason(index), "error");
    renderStepper();
    updateWizardNav();
    return;
  }
  if (index === 3) state.reviewSeen = true;
  state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
  applyStepUi();
}

function wizardBack() {
  if (state.showingVersions) {
    state.showingVersions = false;
    state.stepIndex = 4;
    applyStepUi();
    return;
  }
  if (state.stepIndex === 0) return;
  goStep(state.stepIndex - 1, { force: true });
}

function wizardNext() {
  if (state.showingVersions) return;
  const reason = leaveReason(state.stepIndex);
  if (reason) {
    setStatus(reason, "error");
    updateWizardNav();
    return;
  }
  if (state.stepIndex >= STEPS.length - 1) return;
  goStep(state.stepIndex + 1, { force: true });
}

function showVersions() {
  state.showingVersions = true;
  applyStepUi();
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
  $("file-editor-wrap")?.classList.add("hidden");
  renderFileList();
  if (hadFiles) {
    setStatus("From org or members changed. Retrieve again before deploy.", "error");
    if (state.stepIndex === 4) goStep(3, { force: true });
  }
}

function useGitEnabled() {
  return Boolean($("use-git")?.checked);
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
  $("selected-package").textContent = count
    ? "See the live selected package beside this list (category columns or package.xml)."
    : "Nothing selected.";
  $("xml-status").textContent = state.xmlDirty ? "XML edited — click Apply to use it." : "XML matches the picker.";
  renderMembers();
  renderInspector();
  renderTestRunner();
  renderGitUi();
  updateActionState();
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
  const repo = isGithubConfigured(state.settings) ? repoLabel(state.settings) : "no repo connected";
  $("inspector-git").textContent = gitOn ? `Git versioning on · ${repo}` : "Git versioning off · direct org-to-org deploy";
  const tests = state.specifiedTests;
  $("inspector-tests").textContent = tests.length
    ? `${tests.length} specified test${tests.length === 1 ? "" : "s"}: ${tests.slice(0, 8).join(", ")}${tests.length > 8 ? "…" : ""}`
    : packageHasApex(state.packageTypes)
      ? "Apex is in this package — pick test classes on Deploy."
      : "No specified tests (config-only is fine).";
}

function renderGitUi() {
  const on = useGitEnabled();
  const connected = isGithubConfigured(state.settings);
  $("git-actions")?.classList.toggle("hidden", !on);
  $("versions-hint").textContent = on
    ? connected
      ? `Versions are stored in ${repoLabel(state.settings)}.`
      : "Git is on — connect a repo on Start so versions can be saved."
    : "Git is off. Direct org-to-org deploy still works. Turn Git on to keep Jira versions.";
  $("git-status").textContent = on
    ? connected
      ? `Saving versions to ${repoLabel(state.settings)}.`
      : "Connect a GitHub repo on the Start tab. Deploy without Git still works until then."
    : "One-off deploy: nothing is written to Git.";
  $("git-hint").textContent = on
    ? "Each Jira save creates v1, v2, … in the repo so QA/UAT/prod can take the same snapshot."
    : "Git is off. Use this only when you do not need a reusable version.";
  $("git-setup-block")?.classList.toggle("hidden", !on);
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.mode === (on ? "git" : "simple"));
  });
  $("mode-status").textContent = on
    ? "Git version control is on. Connect a repo and save a pipeline so you can reuse it next time."
    : "Simple deploy is on. You can move configuration org-to-org without Git.";
  renderPipelines();
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
          const active = t.name === state.activeType ? "active" : "";
          return `<button type="button" class="type-chip ${active}" data-type="${escapeHtml(t.name)}">
            <span>${escapeHtml(t.label)}</span>
            <span class="api">${escapeHtml(t.name)}</span>
          </button>`;
        })
        .join("");
      return `<div class="type-group-label">${escapeHtml(group.label)}</div>${chips}${extra}`;
    })
    .join("") || `<div class="empty">No types match that search.</div>`;
  const fromOrg = types.some((t) => t.fromOrg);
  $("type-count").textContent = fromOrg
    ? `${types.length} metadata types from the source org. Search to find any of them.`
    : `${types.length} metadata types ready. Load from the source org to match that org exactly.`;
  const active = types.find((t) => t.name === state.activeType) || types[0];
  if (active) {
    state.activeType = active.name;
    $("active-type-title").textContent = `Selected type: ${active.label}`;
    $("active-type-meta").textContent = active.name;
    const hint = memberHint(state.activeType);
    $("manual-member").placeholder = hint;
    $("member-filter").placeholder = `Filter… e.g. ${hint}`;
  }
  syncTypeChosenUi();
}

function syncTypeChosenUi() {
  const stepId = currentStepId();
  const onType = stepId === "type";
  const onMembers = stepId === "members";
  $("type-browse")?.classList.toggle("hidden", !onType);
  $("type-chosen")?.classList.toggle("hidden", !onMembers);
  $("member-panel")?.classList.toggle("hidden", !onMembers);
  $("compact-package-card")?.classList.toggle("hidden", !(onType || onMembers));
  const objectScoped = OBJECT_FILTER_TYPES.includes(state.activeType) || state.activeType === "CustomObject";
  $("object-filter-wrap")?.classList.toggle("hidden", !onMembers || !objectScoped);
  if (state.activeType === "CustomObject") {
    $("member-help").textContent = "Standard objects (Account, Contact, Opportunity, …) are listed first. Custom objects (__c) follow. Tick a row — orange check means it is in the package.";
  } else if (OBJECT_FILTER_TYPES.includes(state.activeType)) {
    $("member-help").textContent = "Tap an object chip (Account, Case, …) to shrink the list, then tick members. Orange check = selected.";
  } else {
    $("member-help").textContent = "Tick members that belong in this deploy. Orange check means selected. You can also add a name at the bottom.";
  }
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

function memberRowHtml(item, typeName, selected) {
  const checked = selected.has("*") || selected.has(item.fullName);
  const mark = item.extra ? ` <span class="muted">(manual)</span>` : "";
  const std = item.standard || (isStandardObject(item.fullName) && typeName === "CustomObject")
    ? ` <span class="member-tag">standard</span>`
    : "";
  return `<label class="member-row">
    <input type="checkbox" data-member="${escapeHtml(item.fullName)}" ${checked ? "checked" : ""} />
    <span class="member-mark" aria-hidden="true">✓</span>
    <span class="member-name">${escapeHtml(item.fullName)}${std}${mark}</span>
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
    return;
  }
  if (cache.error) {
    status.textContent = cache.error;
  } else {
    status.textContent = `${cache.items.length} in org · ${selectedCount} selected in this type`;
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
  const extraSelected = [...selected].filter((name) => name !== "*" && !items.some((i) => i.fullName === name));
  const combined = [
    ...extraSelected.map((fullName) => ({ fullName, extra: true })),
    ...items
  ];
  const cap = isWorkbench() ? WORKBENCH_MEMBERS : MAX_MEMBERS;
  const shown = combined.slice(0, cap);
  if (!shown.length) {
    list.innerHTML = `<div class="empty">No members match the filter. Try All objects, or add a name such as Account.My_Field__c.</div>`;
    return;
  }
  list.innerHTML =
    shown.map((item) => memberRowHtml(item, typeName, selected)).join("") +
    (combined.length > cap
      ? `<div class="muted">Showing ${cap} of ${combined.length}. Filter by object or tick Selected only to find the rest.</div>`
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
  const options = state.orgs.length
    ? state.orgs.map((o) => `<option value="${escapeHtml(orgKey(o))}">${escapeHtml(o.label)} — ${escapeHtml(o.username || o.instanceUrl)}</option>`).join("")
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
  for (const id of ["pipeline-source", "pipeline-target"]) {
    const el = $(id);
    if (!el) continue;
    const blank = id.includes("target") ? targetBlank : sourceBlank;
    el.innerHTML = blank + options;
    if (id.includes("source") && sourceEl?.value) el.value = sourceEl.value;
    if (id.includes("target") && targetEl?.value) el.value = targetEl.value;
  }
  updateActionState();
}

function renderPipelines() {
  const items = state.pipelines?.pipelines || [];
  const lastId = state.settings?.lastPipelineId || "";
  const options = items.length
    ? items.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.source?.label || "")} → ${escapeHtml(p.target?.label || "")}</option>`).join("")
    : `<option value="">No pipelines yet — create one below</option>`;
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
      $("pipeline-welcome-body").textContent = `Use “${last.name}” again (${last.source?.label || "source"} → ${last.target?.label || "target"}) or create a new pipeline.`;
    } else {
      welcome.classList.add("hidden");
    }
  }
  $("pipeline-status").textContent = items.length
    ? `${items.length} pipeline${items.length === 1 ? "" : "s"} in Git (${pipelinesFilePath()}).`
    : useGitEnabled()
      ? "No pipeline saved yet. Name it, pick source and target, then save to Git."
      : "";
}

async function loadPipelines() {
  if (!isGithubConfigured(state.settings) || !useGitEnabled()) {
    state.pipelines = emptyPipelineStore();
    return;
  }
  const { token, owner, repo, branch } = ghCreds();
  const raw = await getFileContent(token, owner, repo, pipelinesFilePath(), branch);
  state.pipelines = parsePipelineStore(raw);
}

function applyPipeline(record) {
  if (!record) throw new Error("Select a saved pipeline first.");
  const source = matchOrg(state.orgs, record.source);
  const target = matchOrg(state.orgs, record.target);
  if (source && $("source-org")) $("source-org").value = orgKey(source);
  if (target && $("target-org")) $("target-org").value = orgKey(target);
  if (source && $("pipeline-source")) $("pipeline-source").value = orgKey(source);
  if (target && $("pipeline-target")) $("pipeline-target").value = orgKey(target);
  if (record.testLevel && $("test-level")) $("test-level").value = record.testLevel;
  if ($("pipeline-name")) $("pipeline-name").value = record.name;
  if ($("pipeline-select")) $("pipeline-select").value = record.id;
  if ($("deploy-pipeline")) $("deploy-pipeline").value = record.id;
  $("use-git").checked = record.useGit !== false;
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
}

async function saveCurrentPipeline() {
  requireGithub();
  const source = selectedOrg("pipeline-source") || selectedOrg("source-org");
  const target = selectedOrg("pipeline-target") || selectedOrg("target-org");
  if (!source || !target) throw new Error("Detect orgs and pick source and target first.");
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
    ...ghCreds(),
    files: [{ path: pipelinesFilePath(), base64: encodeUtf8Base64(JSON.stringify(next, null, 2) + "\n") }],
    message: `chore: save pipeline ${record.name}`
  });
  state.pipelines = next;
  await saveSettings({
    lastPipelineId: record.id,
    lastSourceOrgId: orgKey(source),
    lastTargetOrgId: orgKey(target),
    setupComplete: true
  });
  state.settings = await loadSettings();
  applyPipeline(record);
  renderPipelines();
  log(`Saved pipeline “${record.name}” to ${pipelinesFilePath()}.`);
  setStatus(`Saved pipeline ${record.name}`, "ok");
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
          <button class="secondary" data-use="${escapeHtml(v.id)}">Use on Deploy</button>
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
  const n = state.orgs.length;
  if (!n) {
    setStatus("Start here: choose Simple deploy or Git, then Detect logged-in orgs.");
    return;
  }
  if (!pack) {
    setStatus(`${n} org${n === 1 ? "" : "s"} ready · Next to pick a configuration type.`);
    return;
  }
  const git = useGitEnabled() && isGithubConfigured(state.settings) ? ` · ${repoLabel(state.settings)}` : useGitEnabled() ? " · Git on (connect a repo)" : "";
  setStatus(`${n} org${n === 1 ? "" : "s"} · ${pack} component${pack === 1 ? "" : "s"} ready to deploy${git}`, "ok");
}

async function refreshAll() {
  state.settings = await loadSettings();
  state.packageTypes = normalizePackageTypes(state.settings.packageTypes);
  $("gh-token").value = state.settings.github.token || "";
  $("gh-repo-input").value = state.settings.github.owner && state.settings.github.repo
    ? `${state.settings.github.owner}/${state.settings.github.repo}`
    : "";
  $("gh-branch").value = state.settings.github.branch || "main";
  state.availableTypes = fallbackTypeRecords();
  $("test-level").value = state.settings.testLevel || "NoTestRun";
  $("check-only").checked = Boolean(state.settings.checkOnly);
  $("use-git").checked = state.settings.useGit !== false;
  state.specifiedTests = normalizeTestNames(state.settings.specifiedTests);
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
  await loadPipelines();
  renderPipelines();
  updateHeaderStatus();
  log(`Using ${repoLabel(state.settings)}`);
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
  if (!useGitEnabled()) throw new Error("Choose Git version control on the Start tab first.");
  if (!isGithubConfigured(state.settings)) throw new Error("Connect a GitHub repo on the Start tab first.");
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
  const url = chrome.runtime.getURL("sidepanel.html") + "?layout=workbench";
  if (chrome.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, "orgflow-workbench");
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
  state.selectionFrozen = true;
  state.retrieveSnapshot = {
    sourceKey: orgKey(source),
    fingerprint: packageFingerprint(),
    fileCount: files.length
  };
  renderFileList();
  applyRetrieveLockUi();
  goStep(3, { force: true });
  log(`Retrieved ${files.length} file(s). From org and members are frozen until you unlock.`);
  setStatus(`Retrieved ${files.length} files — review or deploy`, "ok");
  return files;
}

async function filesForDeploy() {
  if (!hasFreshRetrieve()) throw new Error(retrieveBlockReason());
  return state.stagedFiles;
}

function deployOptions() {
  const runTests = specifiedTests();
  const selectedLevel = $("test-level").value;
  if (selectedLevel === "RunSpecifiedTests" && !runTests.length) {
    throw new Error("Pick at least one test class in the Test class runner, or choose a different Tests option.");
  }
  return {
    testLevel: runTests.length ? "RunSpecifiedTests" : selectedLevel,
    checkOnly: $("check-only").checked,
    runTests
  };
}

async function deploySelected() {
  const target = selectedOrg("target-org");
  if (!target) throw new Error("Select a target org. Log into it in Chrome first.");
  await persistShipOptions();
  const files = await filesForDeploy();
  const zipBase64 = await zipFromFiles(files);
  const options = deployOptions();
  if (options.runTests.length) log(`Running specified tests: ${options.runTests.join(", ")}`);
  log(`Deploying ${files.length} file(s) to ${target.label} (${options.testLevel})…`);
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

  const files = hasFreshRetrieve() ? state.stagedFiles : null;
  if (!files?.length) throw new Error(retrieveBlockReason());
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
  else if (name === "components") goStep(state.typeChosen ? 2 : 1, { force: true });
  else if (name === "ship") goStep(canAdvanceTo(4) ? 4 : farthestStep(), { force: true });
  else if (name === "versions") showVersions();
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
    });
  }
  wizardNext();
});
$("btn-goto-versions")?.addEventListener("click", showVersions);
$("btn-show-xml")?.addEventListener("click", () => {
  state.xmlReview = true;
  switchSubtab("xml");
});
$("btn-back-to-files")?.addEventListener("click", () => {
  state.xmlReview = false;
  switchSubtab("review");
});

$("goto-components").addEventListener("click", () => goStep(state.typeChosen ? 2 : 1, { force: true }));
$("goto-workbench")?.addEventListener("click", openWorkbench);
$("open-workbench")?.addEventListener("click", openWorkbench);
$("open-workbench-banner")?.addEventListener("click", openWorkbench);
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
$("type-picker").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-type]");
  if (!btn) return;
  if (state.selectionFrozen && hasFreshRetrieve()) {
    setStatus("Unlock the retrieved snapshot first if you need a different type.", "error");
    return;
  }
  state.activeType = btn.dataset.type;
  state.typeChosen = true;
  state.objectFilter = "";
  if (state.activeType === "CustomObject" && !state.membersCache.CustomObject) {
    state.membersCache.CustomObject = { items: withStandardObjectMembers("CustomObject", []), error: "" };
  }
  goStep(2, { force: true });
  renderMembers();
  if (selectedOrg("source-org")) run(loadMembers);
});
$("btn-change-type")?.addEventListener("click", () => {
  if (state.selectionFrozen && hasFreshRetrieve()) {
    setStatus("Unlock the retrieved snapshot first to change type.", "error");
    return;
  }
  state.typeChosen = false;
  goStep(1, { force: true });
  renderTypePicker();
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
$("deploy-pipeline")?.addEventListener("change", () => {
  if ($("pipeline-select") && $("deploy-pipeline").value) $("pipeline-select").value = $("deploy-pipeline").value;
  run(useSelectedPipeline);
});
$("member-filter").addEventListener("input", renderMembers);
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
  const useId = event.target.dataset.use;
  const deployId = event.target.dataset.deploy;
  if (useId) {
    $("jira").value = useId;
    goStep(4, { force: true });
  }
  if (deployId) {
    $("jira").value = deployId;
    goStep(4, { force: true });
    run(() => deployVersion(deployId));
  }
});
$("use-git")?.addEventListener("change", () => run(() => persistGitToggle($("use-git").checked)));
$("btn-unlock-retrieve")?.addEventListener("click", unlockSelection);
$("source-org")?.addEventListener("change", () => run(async () => {
  const previous = state.retrieveSnapshot?.sourceKey;
  await saveSettings({ lastSourceOrgId: $("source-org").value, lastTargetOrgId: $("target-org").value });
  state.settings = await loadSettings();
  if ($("pipeline-source") && $("source-org").value) $("pipeline-source").value = $("source-org").value;
  if ($("source-org").value && !$("target-org").value && state.orgs.length === 2) {
    const other = state.orgs.find((o) => orgKey(o) !== $("source-org").value);
    if (other) $("target-org").value = orgKey(other);
  }
  if (previous && previous !== $("source-org").value) {
    state.membersCache = {};
    state.availableTypes = fallbackTypeRecords();
    invalidateStaged();
  }
  updateActionState();
}));
$("target-org")?.addEventListener("change", () => run(async () => {
  await saveSettings({ lastSourceOrgId: $("source-org").value, lastTargetOrgId: $("target-org").value });
  state.settings = await loadSettings();
  if ($("pipeline-target") && $("target-org").value) $("pipeline-target").value = $("target-org").value;
  updateActionState();
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

refreshAll();
