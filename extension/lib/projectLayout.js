/** Salesforce DX / Metadata API folders people already know from VS Code. */
export const SALESFORCE_METADATA_FOLDERS = [
  "applications",
  "aura",
  "classes",
  "contentassets",
  "flexipages",
  "flows",
  "layouts",
  "lwc",
  "objects",
  "permissionsets",
  "staticresources",
  "tabs",
  "triggers"
];

const IGNORE_ROOT = new Set([
  "readme.md",
  "readme",
  "license",
  "license.md",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  "package.json",
  "package-lock.json"
]);

function entryName(entry) {
  const raw = String(entry?.name || entry?.path || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return raw.split("/")[0];
}

export function inspectRepoLayout(entries = []) {
  const names = new Set(
    (entries || [])
      .map(entryName)
      .filter(Boolean)
      .map((n) => n.toLowerCase())
  );
  const hasForceApp = names.has("force-app");
  const hasSfdxJson = names.has("sfdx-project.json");
  const hasManifest = names.has("manifest");
  const hasSrc = names.has("src");
  const hasOrgflow = names.has(".orgflow");
  const looksLikeOrgflowApp = names.has("extension") && (names.has("files") || names.has("tests"));
  const significant = [...names].filter((n) => !IGNORE_ROOT.has(n) && n !== ".git");
  const empty = significant.length === 0;

  let kind = "other";
  if (empty) kind = "empty";
  else if (hasForceApp || hasSfdxJson) kind = "sfdx";
  else if (hasManifest || hasSrc) kind = "mdapi";
  else if (hasOrgflow) kind = "orgflow";

  return {
    kind,
    hasForceApp,
    hasSfdxJson,
    hasManifest,
    hasSrc,
    hasOrgflow,
    looksLikeOrgflowApp,
    empty,
    names: [...names].sort()
  };
}

/** True unless the repo already has a Salesforce DX / mdapi tree. */
export function canScaffold(inspect) {
  if (!inspect) return false;
  return !inspect.hasForceApp && !inspect.hasSfdxJson && !inspect.hasSrc && !inspect.hasManifest;
}

/** Brand-new warehouse: empty, or only OrgFlow pipelines — no force-app yet. */
export function shouldAutoScaffold(inspect) {
  if (!canScaffold(inspect)) return false;
  if (inspect.looksLikeOrgflowApp) return false;
  return inspect.empty || inspect.kind === "orgflow";
}

export function layoutCopy(inspect, { repoLabel: label = "this repo" } = {}) {
  if (!inspect) {
    return {
      title: "Salesforce files in Git",
      body: `After the first Save or Deploy, snapshots appear under .orgflow/releases/ in ${label}. Folders match Salesforce metadata (classes, objects, layouts, lwc, …).`,
      canScaffold: false,
      viewPath: ".orgflow"
    };
  }
  if (inspect.kind === "sfdx") {
    return {
      title: "This repo already has a Salesforce project",
      body: `${label} already has force-app (Salesforce DX). OrgFlow will not overwrite those folders. Jira snapshots go to .orgflow/releases/PROJ-123/v1/ with the same metadata folders — classes, objects, layouts, lwc, and so on.`,
      canScaffold: false,
      viewPath: inspect.hasOrgflow ? ".orgflow" : "force-app/main/default"
    };
  }
  if (inspect.kind === "mdapi") {
    return {
      title: "This repo already has Salesforce metadata",
      body: `${label} already has a Metadata API tree (src or manifest). OrgFlow leaves it alone. Snapshots are stored under .orgflow/releases/<Jira>/vN/ using Salesforce folder names.`,
      canScaffold: false,
      viewPath: inspect.hasOrgflow ? ".orgflow" : inspect.hasSrc ? "src" : "manifest"
    };
  }
  if (inspect.looksLikeOrgflowApp) {
    return {
      title: "This repo looks like the OrgFlow app, not a Salesforce warehouse",
      body: `${label} contains the OrgFlow extension source. Snapshots can live here, but a dedicated empty Salesforce repo is cleaner. You can still create force-app folders if you want this repo to hold metadata too.`,
      canScaffold: true,
      viewPath: inspect.hasOrgflow ? ".orgflow" : ""
    };
  }
  if (inspect.kind === "orgflow" || inspect.kind === "empty") {
    return {
      title: "New Salesforce warehouse",
      body: `${label} does not have force-app yet — only a README and/or OrgFlow pipelines. OrgFlow will create Salesforce DX folders (force-app/main/default/classes, objects, layouts, lwc, …) so you can browse files like in VS Code. Retrieved packages still version under .orgflow/releases/ after Save or Deploy — empty folders appear immediately.`,
      canScaffold: true,
      viewPath: inspect.hasOrgflow ? ".orgflow" : ""
    };
  }
  return {
    title: "This is not a Salesforce project yet",
    body: `${label} does not look like Salesforce DX. Create force-app/main/default/{classes,objects,layouts,…} for a familiar tree, or skip — snapshots still go to .orgflow/releases/.`,
    canScaffold: true,
    viewPath: inspect.hasOrgflow ? ".orgflow" : ""
  };
}

export function snapshotTreeText(files, rootPath = ".orgflow/releases") {
  const paths = (files || [])
    .map((f) => String(f.path || f).replace(/^\/+/, ""))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const root = String(rootPath || "").replace(/\/+$/, "");
  const groups = new Map();
  for (const path of paths) {
    const slash = path.indexOf("/");
    const folder = slash === -1 ? "" : path.slice(0, slash);
    const key = folder || "(root)";
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const lines = [root ? `${root}/` : "/"];
  for (const [folder, count] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (folder === "(root)") lines.push(`  ${count} file${count === 1 ? "" : "s"}`);
    else lines.push(`  ${folder}/    ${count} file${count === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

function gitkeep(folder) {
  return `force-app/main/default/${folder}/.gitkeep`;
}

export function scaffoldProjectFiles({ apiVersion = "61.0", repoName = "orgflow" } = {}) {
  const name = String(repoName || "orgflow").replace(/[^A-Za-z0-9._-]/g, "-") || "orgflow";
  const sfdx = `${JSON.stringify({
    packageDirectories: [{ path: "force-app", default: true }],
    name,
    namespace: "",
    sfdcLoginUrl: "https://login.salesforce.com",
    sourceApiVersion: String(apiVersion || "61.0")
  }, null, 2)}\n`;
  const forceignore = `# Salesforce CLI should not push OrgFlow version snapshots
.orgflow/**
**/.gitkeep
`;
  const readme = `# OrgFlow snapshots

Retrieved Salesforce metadata is stored here as Jira versions:

\`\`\`
.orgflow/releases/PROJ-123/v1/classes/...
.orgflow/releases/PROJ-123/v1/objects/...
.orgflow/releases/PROJ-123/v1/package.xml
\`\`\`

Folder names match the Metadata API (the same ones you see under \`force-app/main/default\` in VS Code: classes, lwc, layouts, objects, flows, …).

- \`force-app/\` is the Salesforce DX working tree for CLI / VS Code. OrgFlow does not overwrite it when you save a version.
- Each save of the same Jira key creates \`v2\`, \`v3\`, … so older snapshots stay reviewable.
`;
  const files = [
    { path: "sfdx-project.json", text: sfdx },
    { path: ".forceignore", text: forceignore },
    { path: ".orgflow/README.md", text: readme }
  ];
  for (const folder of SALESFORCE_METADATA_FOLDERS) {
    files.push({ path: gitkeep(folder), text: "" });
  }
  files.push({ path: "manifest/.gitkeep", text: "" });
  return files;
}
