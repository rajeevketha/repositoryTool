# OrgFlow

Chrome extension for **Salesforce configurators**: build fields, layouts, flows, permission sets (and other metadata) in a sandbox, then deploy that same package to QA, UAT, or production.

GitHub, GitLab, or Azure DevOps is **optional**. OrgFlow always versions by Jira (`PROJ-123-v1`). Without a team repo, snapshots live in this Chrome profile so you can promote the same package sandbox → QA → prod. Choose **GitHub, GitLab, or Azure** when the team needs a shared warehouse.

## Configurator workflow

Use **Back** / **Next** at the bottom. The numbered stepper (Start → Package → Retrieve → Confirm) is sequential: you cannot skip ahead.

1. **Start** — Detect logged-in orgs. Set **From** and **To** in the path bar (they must be different). Stay on Start and choose **Local snapshots** or **Release repo** (GitHub, GitLab, or Azure). Click **Next** when that choice is done. If a release repo: follow **Help · connecting Git**, then **Use this repo**. OrgFlow saves From → To as the promotion path (for example DEC → QA). Add Staging and Prod when those orgs are logged in so the same Jira snapshot can travel Dev → QA → Staging → Prod. Pipelines are optional — connecting the repo is enough.
2. **Package** — pick a type (Custom Field, Layout, Flow…) and tick members on the **same screen**. **Changed recently** shows what you just built in the From org — tap to add. After you tick something on an object, **Also on Account** (or that object) opens layouts, record types, and rules for the same object. Pick another type to add more; earlier ticks stay in the package. **Back** from Retrieve returns here so you can add more — nothing is frozen.
3. **Retrieve** — click **Retrieve from From org** when the package is complete. Then enter a **Jira key** and **comment** — both are required. **Back** returns to Package. After you add members, retrieve again before Confirm.
4. **Confirm** — review org names, Jira, comment, and what is going to the To org. **Validate in To org** is a dry run (nothing is saved). **Deploy** sends it. The result stays on this screen. After a successful deploy, **New package** starts over from Start.

The UI uses a warm charcoal + bronze theme. Accent color is used on the current step and the main action, not on every heading.

Typical configuration you can pick by name: **CustomField** (`Account.Status__c`), record types, validation rules, page layouts, Lightning pages, flows, permission sets, apps, tabs, picklists, reports, email templates. Search the type list for any other Metadata API type (Apex, LWC, Experience Cloud, settings, and so on). **Load all types from source org** refreshes the list from that sandbox.

## One-minute user manual

Watch [docs/orgflow-user-manual.mp4](docs/orgflow-user-manual.mp4) (about 1 minute). Open [docs/user-manual.html](docs/user-manual.html) in a browser to replay the same slides. Team-repo slides: [docs/git-repo-walkthrough.html](docs/git-repo-walkthrough.html).

## Chrome Web Store

Submission kit (listing copy, privacy URL, permission justifications, screenshots): [docs/chrome-web-store.md](docs/chrome-web-store.md).

- **Load unpacked:** [files/orgflow-extension.zip](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip) (unzip to an `orgflow/` folder)
- **Store upload:** [files/orgflow-chrome-web-store.zip](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-chrome-web-store.zip) (`manifest.json` at the zip root, version **1.11.14**)
- **Privacy policy:** [docs/privacy.html](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/docs/privacy.html)

## Install (unpacked Chrome extension)

The **From → To path bar** at the top of every screen is the live route (for example Dev sandbox → QA). **Next** and **Deploy** stay disabled until those two orgs are selected and different.

**Download (this is a zip file, not Cursor artifacts):**  
https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip

If that asks you to save a file named `orgflow-extension.zip`, that is the right one. Unzip it, then load the `orgflow` folder.

GitHub page for the same file (use **Download raw file**):  
https://github.com/rajeevketha/repositoryTool/blob/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip

1. Unzip `orgflow-extension.zip`.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the unzipped `orgflow` folder (or the repo `extension/` folder).
4. Pin OrgFlow and open it. Chrome opens a side panel. Use **Workbench** when you need a wide picker plus the live selected-package pane.

## First-time setup

### Salesforce orgs (required)

Log into each org in Chrome (the same profile), then **Detect logged-in orgs**. OrgFlow reads the `sid` cookie — the same idea as Salesforce Inspector. No Connected App is required.

If an org does not appear, open it (Lightning or Setup) so a `*.my.salesforce.com` session cookie exists, then detect again.

### Versioning (always on)

On **Start**, choose where snapshots are stored:

- **Local snapshots** — no token. Jira versions (`PROJ-123-v1`) stay on this Chrome profile. Promote that same snapshot to QA, then prod.
- **GitHub, GitLab, or Azure** — same Jira versions, written to the host you pick so teammates can reuse them. Token stays in this browser.

Git hosts are the shared warehouse, not the versioning itself. Without a place to keep the retrieved files, there is no version — only a one-shot copy, which OrgFlow no longer treats as the main path.

On Start, pick the host. Open **How to connect** for token steps for that host:

- **GitHub** — [github.com/settings/tokens](https://github.com/settings/tokens) (`repo` or Contents: Read and write). Connect, pick `owner/repo`, **Use this repo**.
- **GitLab** — Preferences → Access tokens (`api`, or `read_repository` + `write_repository`). gitlab.com or your company GitLab URL. Connect, pick `group/project`.
- **Azure DevOps** — User settings → Personal access tokens (**Code: Read & write**). Enter the organization name, connect, pick `org/project/repo`.

Optional: save a pipeline (`Sandbox → UAT`) to `.orgflow/pipelines.json`.

Each configurator can version **without Git**. Connect a Git host only when the team needs one shared history. Pipelines are stored in the repo at `.orgflow/pipelines.json` (no passwords, no session ids).

### Pick configuration (Package → Retrieve)

1. **Package** — one screen, not two tabs. Common configurator types first, every Metadata API type searchable. Tap a type, tick members, then tap another type to add more (fields, then layouts, then flows…). Earlier ticks stay in the package. Members list **newest first** so the field you just built is at the top. Type a member such as `Account.Customer_Status__c` if you know the name. Object chips and **Selected only** help when an object has thousands of fields.
2. **Selected package** (side of the workbench, or below the picker in the side panel) updates on every tick:
   - **By category** — columns/groups by metadata type, and by object for fields/layouts
   - **package.xml** — the exact manifest Salesforce will retrieve
3. **Retrieve** — retrieve the package when it looks complete. Then enter a **Jira key** and **comment** (both required). **Back** returns to Package unlocked so you can add more members, then retrieve again. Errors from Salesforce show in the result panel (component name + problem).
4. **Confirm** — org names, Jira, comment, and the component list. **Validate in To org** is a dry run. **Deploy** sends it. The Salesforce result stays on this screen.

Wildcard `*` for a type still works if you want everything of that type. For real releases, pick named members so the version is reviewable.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account status field + layout + flow` |
| Source org | Config sandbox |
| Target org | UAT |
| Tests | `No tests` for config-only; **Test class runner** → `RunSpecifiedTests`; `Run local tests` if you prefer the whole org’s local tests |

- **Local snapshots / GitHub, GitLab, or Azure** — versioning is always on. A team repo is optional sharing.
- **Workbench** — wide window: picker on the left, live selected package on the right (category columns + package.xml). On Retrieve/Deploy the right pane is the Salesforce result panel.
- **Deploy** — one button on the last step. It stays off until Salesforce returns success or failure. Component and test errors (name + problem) show in the result panel.

## Can this be a real deployment / version tool?

Yes, for metadata. OrgFlow talks to the same **Salesforce Metadata API** that Salesforce CLI, change sets, and tools like Gearset use: retrieve a package, optionally edit files, deploy the zip, and keep Jira-keyed snapshots (this browser, or GitHub / GitLab / Azure).

Use it that way when:

- You select **named components** (not an entire org wildcard) for a ticket
- You **validate** (`checkOnly`) on the target, then deploy
- Production deploys use the **Test class runner** (`RunSpecifiedTests`) or **Run local tests**
- Git is the system of record so QA/UAT/prod get the same `PROJ-123-v2` zip

It is **not** a full Copado/Gearset replacement: no dependency graph, no data (records) deploy, no conflict UI across branches, and Profiles/Experience Cloud/huge static resources are painful. Those limits are the Metadata API’s, not the Chrome shell.

## How versions are stored

```
.orgflow/versions.json
.orgflow/releases/PROJ-123/v1/package.xml
.orgflow/releases/PROJ-123/v1/classes/...
.orgflow/releases/PROJ-123/v1/objects/...
.orgflow/releases/PROJ-123/v2/...
```

Those inner folders are the same Metadata API names as `force-app/main/default` in VS Code (`classes`, `lwc`, `layouts`, `objects`, …). **Open files in Git** on Start jumps to that tree.

When you connect a repo, OrgFlow inspects the root:

- If it already has `force-app`, `src`, `manifest`, or `sfdx-project.json`, OrgFlow **does not overwrite it** — even if you click Add folders. Snapshots stay under `.orgflow/releases/`.
- If it is new (README only, or only `.orgflow/pipelines.json`), OrgFlow **creates** `force-app/main/default/{classes,objects,layouts,…}` automatically.
- On an empty warehouse, **Add folders** is a small hint link (not a warehouse card). Suggested layout: `force-app/main/default/{classes, objects, layouts, lwc}`. Each Jira version is still a separate snapshot so v1 is never replaced by v2.

`versions.json` keeps increment history, comments, source org, Git commit SHA, and deployment audit entries. A second save of the same Jira key creates `v2` so `v1` stays deployable.

When a release repo is on:

- **Compare** — picklist of versions, newest first. Diff metadata XML and Apex against the current retrieve or another version.
- **Revert selected files** — restore specific files from any version into the current retrieve, then deploy.
- **Commit message** — required for Save to Git, Salesforce deploy, and deploying a saved Git version.

## Security

- Git host tokens and Salesforce session ids stay in the extension’s local storage. They are never committed to this repository.
- Treat the token like a password. Use a least-privilege PAT and revoke it if the browser is shared.
- Production deploys should use the **Test class runner** or **Run local tests** (or your org’s required test level).

## Limits

- Large retrieves (profiles, Experience Cloud, huge static resources) can be slow or hit Metadata API limits. Prefer the component types you actually changed.
- Sessions expire when you log out of Salesforce. Detect orgs again after logging in.
- Git host API rate limits apply when committing many files; OrgFlow batches blob uploads.

## Develop

```bash
npm test
```

Load `extension/` unpacked after changes. There is no bundler — ES modules run as-is in Manifest V3.

## Architecture

```
Chrome side panel / workbench
  ├─ Live selected-package inspector (category columns + package.xml)
  ├─ Salesforce cookies → REST identity + SOAP Metadata retrieve/deploy + runTests
  └─ Git host PAT → GitHub / GitLab / Azure Repos APIs when Git versioning is on
```

The Metadata API zip is unpacked and stored as normal files so you can review a Jira version in the connected repo like any other commit.
