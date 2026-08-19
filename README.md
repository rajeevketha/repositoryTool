# OrgFlow

Chrome extension for **Salesforce configurators**: build fields, layouts, flows, permission sets (and other metadata) in a sandbox, then deploy that same package to QA, UAT, or production.

GitHub is **optional**. OrgFlow always versions by Jira (`PROJ-123-v1`). Without GitHub, snapshots live in this Chrome profile so you can promote the same package sandbox → QA → prod. Turn on **Version in GitHub** when the team needs a shared repo.

## Configurator workflow

Use **Back** / **Next** at the bottom. The numbered stepper (Start → Type → Members → Retrieve → Deploy) is sequential: you cannot skip ahead.

1. **Start** — choose **Version in this browser** (default) or **Version in GitHub**. Detect logged-in orgs. Set **From** and **To** in the path bar (they must be different). If GitHub: paste a token, connect the repo, save a **pipeline** to `.orgflow/pipelines.json`.
2. **Type** — search, use the picklist, or tap a common type (Custom Field, Custom Object, Flow…). That opens the member list for only that type.
3. **Members** — tick rows (orange check = in the package). The orange scrollbar and “Scroll for more” cue mean the list continues. Use **object chips** to shrink a long list. Next goes to Retrieve (not another picker). Use **Back** later if you need more members.
4. **Retrieve** — pulls files from the From org. This screen does not change members. Failures (and a successful file count) show in the result panel. Unlock only if you need to change From or members, then retrieve again.
5. **Deploy** — lists the components in this package and one **Deploy** button. The button stays off until Salesforce returns success or failure. Component errors (name + problem + line) and successes appear in the result panel.

The UI uses a dark charcoal + orange theme so the current step and selected members stay obvious.

Typical configuration you can pick by name: **CustomField** (`Account.Status__c`), record types, validation rules, page layouts, Lightning pages, flows, permission sets, apps, tabs, picklists, reports, email templates. Search the type list for any other Metadata API type (Apex, LWC, Experience Cloud, settings, and so on). **Load all types from source org** refreshes the list from that sandbox.

## One-minute user manual

Watch [docs/orgflow-user-manual.mp4](docs/orgflow-user-manual.mp4) (about 1 minute). Open [docs/user-manual.html](docs/user-manual.html) in a browser to replay the same slides.

The **From → To path bar** at the top of every screen is the live route (for example Dev sandbox → QA). **Next** and **Deploy** stay disabled until those two orgs are selected and different.

## Install (unpacked Chrome extension)

**Download the test zip:** [files/orgflow-extension.zip](files/orgflow-extension.zip) (unzip, then load the `orgflow` folder).

1. Clone this repository, or unzip `files/orgflow-extension.zip`.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the unzipped `orgflow` folder (or the repo `extension/` folder).
4. Pin OrgFlow and open it. Chrome opens a side panel. Use **Workbench** when you need a wide picker plus the live selected-package pane.

## First-time setup

### Salesforce orgs (required)

Log into each org in Chrome (the same profile), then **Detect logged-in orgs**. OrgFlow reads the `sid` cookie — the same idea as Salesforce Inspector. No Connected App is required.

If an org does not appear, open it (Lightning or Setup) so a `*.my.salesforce.com` session cookie exists, then detect again.

### Versioning (always on)

On **Start**, choose where snapshots are stored:

- **Version in this browser** — no GitHub token. Jira versions (`PROJ-123-v1`) stay on this Chrome profile. Promote that same snapshot to QA, then prod.
- **Version in GitHub** — same Jira versions, written to a repo so teammates can reuse them. Token stays in this browser.

Git is the shared warehouse, not the versioning itself. Without a place to keep the retrieved files, there is no version — only a one-shot copy, which OrgFlow no longer treats as the main path.

If you choose GitHub: create a token at [github.com/settings/tokens](https://github.com/settings/tokens) (`repo` or fine-grained **Contents: Read and write**), paste it on Start → **Connect GitHub**, pick `owner/repo`, then **Use this repo**. Optional: save a pipeline (`Sandbox → UAT`) to `.orgflow/pipelines.json`.

Each configurator can version **without Git**. Connect GitHub only when the team needs one shared history. Pipelines are stored in the repo at `.orgflow/pipelines.json` (no passwords, no session ids).

### Pick configuration (Type → Members → Retrieve)

1. **Type** — common configurator types first, every Metadata API type searchable. Tap a type to open its members (the type grid goes away on purpose).
2. **Members** — load from the source sandbox, tick what belongs to this Jira, or type a member such as `Account.Customer_Status__c`. Object chips and **Selected only** help when an object has thousands of fields.
3. **Selected package** (side of the workbench, or below the picker in the side panel) updates on every tick:
   - **By category** — columns/groups by metadata type, and by object for fields/layouts
   - **package.xml** — the exact manifest Salesforce will retrieve
4. **Retrieve** — retrieve the package. To add members, use **Back**. Errors from Salesforce show in the result panel (component name + problem).
5. **Deploy** — the component list and one Deploy button. After you click it, it stays disabled until Salesforce answers. Success and failure details stay in the result panel.

Wildcard `*` for a type still works if you want everything of that type. For real releases, pick named members so the version is reviewable.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account status field + layout + flow` |
| Source org | Config sandbox |
| Target org | UAT |
| Tests | `No tests` for config-only; **Test class runner** → `RunSpecifiedTests`; `Run local tests` if you prefer the whole org’s local tests |

- **Version in this browser / GitHub** — versioning is always on. GitHub is optional sharing.
- **Workbench** — wide window: picker on the left, live selected package on the right (category columns + package.xml). On Retrieve/Deploy the right pane is the Salesforce result panel.
- **Deploy** — one button on the last step. It stays off until Salesforce returns success or failure. Component and test errors (name + problem) show in the result panel.

## Can this be a real deployment / version tool?

Yes, for metadata. OrgFlow talks to the same **Salesforce Metadata API** that Salesforce CLI, change sets, and tools like Gearset use: retrieve a package, optionally edit files, deploy the zip, and keep Jira-keyed snapshots (this browser, or GitHub).

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
.orgflow/releases/PROJ-123/v2/...
```

`versions.json` keeps increment history, comments, source org, Git commit SHA, and deployment audit entries. A second save of the same Jira key creates `v2` so `v1` stays deployable.

## Security

- GitHub tokens and Salesforce session ids stay in the extension’s local storage. They are never committed to this repository.
- Treat the token like a password. Use a least-privilege PAT and revoke it if the browser is shared.
- Production deploys should use the **Test class runner** or **Run local tests** (or your org’s required test level).

## Limits

- Large retrieves (profiles, Experience Cloud, huge static resources) can be slow or hit Metadata API limits. Prefer the component types you actually changed.
- Sessions expire when you log out of Salesforce. Detect orgs again after logging in.
- GitHub API rate limits apply when committing many files; OrgFlow batches blob uploads.

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
  └─ GitHub PAT → Git Data API (blobs / tree / commit) when Git versioning is on
```

The Metadata API zip is unpacked and stored as normal files so you can review a Jira version in GitHub like any other commit.
