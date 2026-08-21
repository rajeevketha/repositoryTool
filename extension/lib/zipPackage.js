import { assertPackageXml, parsePackageXml } from "./packageXml.js";

/** Metadata API directories Salesforce deploy() expects (Workbench / Ant / mdapi). */
export const MDAPI_DIRECTORIES = new Set([
  "applications",
  "appMenus",
  "approvalProcesses",
  "assignmentRules",
  "aura",
  "autoResponseRules",
  "brandingSets",
  "classes",
  "cleanDataServices",
  "communities",
  "components",
  "connectedApps",
  "contentassets",
  "corsWhitelistOrigins",
  "customMetadata",
  "customPermissions",
  "dashboards",
  "documents",
  "duplicateRules",
  "email",
  "escalationRules",
  "experiences",
  "flexipages",
  "flows",
  "globalValueSets",
  "groups",
  "homePageLayouts",
  "labels",
  "layouts",
  "letterhead",
  "lwc",
  "matchingRules",
  "namedCredentials",
  "networks",
  "notificationtypes",
  "objects",
  "objectTranslations",
  "pages",
  "pathAssistants",
  "permissionsets",
  "permissionsetgroups",
  "platforms",
  "profiles",
  "queues",
  "quickActions",
  "remoteSiteSettings",
  "reports",
  "reportTypes",
  "roles",
  "settings",
  "sharingRules",
  "sites",
  "standardValueSets",
  "staticresources",
  "tabs",
  "topicsForObjects",
  "triggers",
  "workflows",
  "installedPackages"
]);

const IGNORE_FILES = /(?:^|\/)(?:\.DS_Store|Thumbs\.db|__MACOSX\/)/i;

/** type → Metadata API folder + how members map to files */
export const TYPE_LAYOUT = {
  ApexClass: { dir: "classes", ext: ".cls", meta: true },
  ApexTrigger: { dir: "triggers", ext: ".trigger", meta: true },
  ApexPage: { dir: "pages", ext: ".page", meta: true },
  ApexComponent: { dir: "components", ext: ".component", meta: true },
  ApexTestSuite: { dir: "testSuites", ext: ".testSuite" },
  AuraDefinitionBundle: { dir: "aura", bundle: true },
  LightningComponentBundle: { dir: "lwc", bundle: true },
  CustomObject: { dir: "objects", ext: ".object", dxMeta: "-meta.xml" },
  CustomField: { dir: "objects", child: "fields", childExt: ".field-meta.xml", parentExt: ".object" },
  ValidationRule: { dir: "objects", child: "validationRules", childExt: ".validationRule-meta.xml", parentExt: ".object" },
  RecordType: { dir: "objects", child: "recordTypes", childExt: ".recordType-meta.xml", parentExt: ".object" },
  ListView: { dir: "objects", child: "listViews", childExt: ".listView-meta.xml", parentExt: ".object" },
  CompactLayout: { dir: "objects", child: "compactLayouts", childExt: ".compactLayout-meta.xml", parentExt: ".object" },
  FieldSet: { dir: "objects", child: "fieldSets", childExt: ".fieldSet-meta.xml", parentExt: ".object" },
  BusinessProcess: { dir: "objects", child: "businessProcesses", childExt: ".businessProcess-meta.xml", parentExt: ".object" },
  WebLink: { dir: "objects", child: "webLinks", childExt: ".webLink-meta.xml", parentExt: ".object" },
  Layout: { dir: "layouts", ext: ".layout" },
  FlexiPage: { dir: "flexipages", ext: ".flexipage" },
  Flow: { dir: "flows", ext: ".flow" },
  FlowDefinition: { dir: "flowDefinitions", ext: ".flowDefinition" },
  PermissionSet: { dir: "permissionsets", ext: ".permissionset" },
  PermissionSetGroup: { dir: "permissionsetgroups", ext: ".permissionsetgroup" },
  Profile: { dir: "profiles", ext: ".profile" },
  CustomApplication: { dir: "applications", ext: ".app" },
  CustomTab: { dir: "tabs", ext: ".tab" },
  CustomLabel: { dir: "labels", file: "CustomLabels.labels" },
  CustomLabels: { dir: "labels", file: "CustomLabels.labels" },
  CustomMetadata: { dir: "customMetadata", ext: ".md" },
  GlobalValueSet: { dir: "globalValueSets", ext: ".globalValueSet" },
  StandardValueSet: { dir: "standardValueSets", ext: ".standardValueSet" },
  StaticResource: { dir: "staticresources", ext: ".resource", meta: true },
  QuickAction: { dir: "quickActions", ext: ".quickAction" },
  PathAssistant: { dir: "pathAssistants", ext: ".pathAssistant" },
  AssignmentRules: { dir: "assignmentRules", ext: ".assignmentRules" },
  AutoResponseRules: { dir: "autoResponseRules", ext: ".autoResponseRules" },
  EscalationRules: { dir: "escalationRules", ext: ".escalationRules" },
  MatchingRules: { dir: "matchingRules", ext: ".matchingRules" },
  DuplicateRule: { dir: "duplicateRules", ext: ".duplicateRule" },
  SharingRules: { dir: "sharingRules", ext: ".sharingRules" },
  Workflow: { dir: "workflows", ext: ".workflow" },
  ApprovalProcess: { dir: "approvalProcesses", ext: ".approvalProcess" },
  RemoteSiteSetting: { dir: "remoteSiteSettings", ext: ".remoteSite" },
  NamedCredential: { dir: "namedCredentials", ext: ".namedCredential" },
  Group: { dir: "groups", ext: ".group" },
  Queue: { dir: "queues", ext: ".queue" },
  Role: { dir: "roles", ext: ".role" },
  EmailTemplate: { dir: "email", nested: true, ext: ".email", meta: true },
  Report: { dir: "reports", nested: true, ext: ".report" },
  Dashboard: { dir: "dashboards", nested: true, ext: ".dashboard" },
  Document: { dir: "documents", nested: true },
  ReportType: { dir: "reportTypes", ext: ".reportType" },
  HomePageLayout: { dir: "homePageLayouts", ext: ".homePageLayout" },
  CustomPermission: { dir: "customPermissions", ext: ".customPermission" },
  ConnectedApp: { dir: "connectedApps", ext: ".connectedApp" },
  AppMenu: { dir: "appMenus", ext: ".appMenu" },
  Settings: { dir: "settings", ext: ".settings" },
  ContentAsset: { dir: "contentassets", ext: ".asset", meta: true }
};

const ROOT_XML = new Set([
  "package.xml",
  "destructivechanges.xml",
  "destructivechangespre.xml",
  "destructivechangespost.xml"
]);

export function normalizeZipPath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isIgnorable(path) {
  const p = normalizeZipPath(path);
  if (!p || p.endsWith("/")) return true;
  if (IGNORE_FILES.test(p)) return true;
  if (p.startsWith("__MACOSX/")) return true;
  return false;
}

function fileBody(file) {
  if (file?.text != null) return String(file.text);
  return "";
}

function looksLikeDx(paths) {
  return paths.some((p) => {
    const n = p.toLowerCase();
    return n === "sfdx-project.json"
      || n.startsWith("force-app/")
      || n.includes("/main/default/")
      || n.endsWith("/sfdx-project.json");
  });
}

/**
 * Strip unpackaged/, src/ (mdapi), or a single wrapper folder so package.xml sits at the root.
 */
export function stripZipPrefix(paths) {
  const names = [...new Set(paths.map(normalizeZipPath).filter((p) => p && !isIgnorable(p)))];
  if (!names.length) return { prefix: "", paths: [] };

  const strip = (prefix) => names
    .filter((p) => p === prefix || p.startsWith(`${prefix}/`))
    .map((p) => (p === prefix ? "" : p.slice(prefix.length + 1)))
    .filter(Boolean);

  if (names.some((p) => p === "package.xml" || p === "destructiveChanges.xml")) {
    return { prefix: "", paths: names };
  }
  if (names.some((p) => p === "unpackaged/package.xml" || p.startsWith("unpackaged/"))) {
    return { prefix: "unpackaged", paths: strip("unpackaged") };
  }
  if (names.some((p) => p === "src/package.xml")) {
    return { prefix: "src", paths: strip("src") };
  }

  const roots = new Set(names.map((p) => p.split("/")[0]));
  if (roots.size === 1) {
    const [root] = [...roots];
    const inner = strip(root);
    if (inner.includes("package.xml") || inner.includes("src/package.xml") || inner.includes("unpackaged/package.xml")) {
      const nested = stripZipPrefix(inner);
      return { prefix: nested.prefix ? `${root}/${nested.prefix}` : root, paths: nested.paths };
    }
  }
  return { prefix: "", paths: names };
}

export function candidatePathsForMember(typeName, member) {
  const layout = TYPE_LAYOUT[typeName];
  const name = String(member || "").trim();
  if (!name || name === "*") return [];
  if (!layout) return [];
  if (layout.file) return [layout.dir ? `${layout.dir}/${layout.file}` : layout.file];

  if (layout.child) {
    const [object, child] = name.includes(".") ? name.split(/\.(.+)/) : [name, ""];
    const out = [];
    if (object) {
      out.push(`${layout.dir}/${object}${layout.parentExt || ".object"}`);
      out.push(`${layout.dir}/${object}/${object}.object-meta.xml`);
    }
    if (object && child) {
      out.push(`${layout.dir}/${object}/${layout.child}/${child}${layout.childExt}`);
    }
    return out;
  }

  if (layout.bundle) {
    return [`${layout.dir}/${name}/`, `${layout.dir}/${name}`];
  }

  if (layout.nested) {
    const path = `${layout.dir}/${name}${layout.ext || ""}`;
    const out = [path];
    if (layout.meta) out.push(`${path}-meta.xml`);
    return out;
  }

  const base = `${layout.dir}/${name}${layout.ext || ""}`;
  const out = [base];
  if (layout.meta) out.push(`${base}-meta.xml`);
  if (layout.dxMeta) out.push(`${layout.dir}/${name}/${name}${layout.dxMeta}`);
  return out;
}

function pathExists(files, candidate) {
  const want = normalizeZipPath(candidate);
  if (!want) return false;
  if (want.endsWith("/")) {
    const prefix = want;
    return files.some((p) => p === prefix.slice(0, -1) || p.startsWith(prefix));
  }
  return files.includes(want);
}

function typeDirectoryPresent(files, typeName) {
  const layout = TYPE_LAYOUT[typeName];
  if (!layout?.dir) return files.some((p) => p.split("/")[0] && MDAPI_DIRECTORIES.has(p.split("/")[0]));
  const prefix = `${layout.dir}/`;
  return files.some((p) => p === layout.dir || p.startsWith(prefix) || (layout.file && p === `${layout.dir}/${layout.file}`));
}

export function unknownMetadataFolders(paths) {
  const folders = new Set();
  for (const path of paths) {
    const root = normalizeZipPath(path).split("/")[0];
    if (!root) continue;
    if (ROOT_XML.has(root.toLowerCase())) continue;
    if (MDAPI_DIRECTORIES.has(root)) continue;
    folders.add(root);
  }
  return [...folders].sort();
}

/**
 * Validate a Workbench-style metadata zip: Salesforce folder layout + package.xml members.
 * `files` is `{ path, text? }[]` (text only needed for package.xml).
 */
export function validateZipPackage(files = []) {
  const errors = [];
  const warnings = [];
  const raw = (files || [])
    .map((f) => ({ ...f, path: normalizeZipPath(f.path) }))
    .filter((f) => f.path && !isIgnorable(f.path));
  const rawPaths = raw.map((f) => f.path);

  if (looksLikeDx(rawPaths)) {
    errors.push("This looks like a Salesforce DX project (force-app or sfdx-project.json). Zip a Metadata API package instead: package.xml plus classes/, objects/, layouts/, lwc/, … — the same layout Workbench retrieve produces.");
  }

  const stripped = stripZipPrefix(rawPaths);
  const byNorm = new Map();
  for (const file of raw) {
    let next = file.path;
    if (stripped.prefix && next === stripped.prefix) continue;
    if (stripped.prefix && next.startsWith(`${stripped.prefix}/`)) next = next.slice(stripped.prefix.length + 1);
    if (!next) continue;
    byNorm.set(next, { ...file, path: next });
  }
  const deployFiles = [...byNorm.values()];
  const deployPaths = deployFiles.map((f) => f.path);

  const packageFile = deployFiles.find((f) => f.path.toLowerCase() === "package.xml");
  if (!packageFile) {
    errors.push("Zip must include package.xml at the root (or inside unpackaged/ or src/).");
    return {
      ok: false,
      errors,
      warnings,
      files: deployFiles,
      types: [],
      version: "",
      packageXml: "",
      folders: unknownMetadataFolders(deployPaths)
    };
  }

  let parsed;
  try {
    const xml = fileBody(packageFile);
    if (!xml.trim()) {
      errors.push("package.xml is empty.");
      parsed = { types: [], version: "" };
    } else {
      parsed = assertPackageXml(xml);
    }
  } catch (err) {
    errors.push(err.message || "package.xml is not valid.");
    parsed = parsePackageXml(fileBody(packageFile));
  }

  const unknown = unknownMetadataFolders(deployPaths);
  if (unknown.length) {
    errors.push(`Zip folders are not Metadata API layout: ${unknown.join(", ")}. Expected folders such as classes/, objects/, layouts/, lwc/, flows/, permissionsets/.`);
  }

  const missing = [];
  for (const entry of parsed.types || []) {
    const typeName = entry.name;
    const members = entry.members || [];
    if (members.includes("*")) {
      if (!typeDirectoryPresent(deployPaths, typeName)) {
        missing.push(`${typeName} (*)`);
      }
      continue;
    }
    for (const member of members) {
      const candidates = candidatePathsForMember(typeName, member);
      if (!candidates.length) {
        const layout = TYPE_LAYOUT[typeName];
        if (!layout) {
          warnings.push(`${typeName}/${member} is not a mapped type — OrgFlow could not confirm the file. Deploy may still work if the zip is a valid Metadata API package.`);
          continue;
        }
      }
      const found = candidates.some((c) => pathExists(deployPaths, c));
      if (!found) missing.push(`${typeName}/${member}`);
    }
  }

  if (missing.length) {
    const shown = missing.slice(0, 12);
    const extra = missing.length > shown.length ? ` (+${missing.length - shown.length} more)` : "";
    errors.push(`package.xml lists members that are not in the zip: ${shown.join(", ")}${extra}`);
  }

  const listedTypes = new Set((parsed.types || []).map((t) => t.name));
  const extraDirs = [...new Set(deployPaths.map((p) => p.split("/")[0]).filter((d) => MDAPI_DIRECTORIES.has(d)))]
    .filter((dir) => {
      const used = [...listedTypes].some((t) => TYPE_LAYOUT[t]?.dir === dir);
      return listedTypes.size && !used && dir !== "objects";
    });
  if (extraDirs.length) {
    warnings.push(`Zip has folders not named in package.xml: ${extraDirs.join(", ")}. Salesforce deploys only what package.xml lists.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    files: deployFiles,
    types: parsed.types || [],
    version: parsed.version || "",
    packageXml: fileBody(packageFile),
    folders: unknown
  };
}
