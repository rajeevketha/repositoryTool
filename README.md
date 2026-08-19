# OrgFlow

Chrome extension for **Salesforce configurators**: build fields, layouts, flows, permission sets (and other metadata) in a sandbox, then deploy that same package to QA, UAT, or production.

GitHub storage versions each Jira ticket (`PROJ-123-v1`) so later orgs get the identical snapshot. **Use Git repo for versioning** is on by default. Turn that toggle off only for a one-off sandbox → target deploy with no version history.

## Configurator workflow

1. **Start** — choose **Simple deploy** or **Git version control**. Detect logged-in orgs. If Git: paste a token (help steps are on the tab), connect the repo, save a **pipeline** (source → target) to `.orgflow/pipelines.json`.
2. **Pick** — choose a type (Objects, Fields, Layouts…). The type list then hides so you can tick **members**. Standard objects (Account, Contact, …) are listed. Filter fields by object when the list is long.
3. Confirm the live **Selected package** (by category / `package.xml`), or open **Workbench**.
4. **Deploy** — Jira + comment, then deploy. Git pipelines are reused the next time you open OrgFlow.
5. If the package includes Apex, pick test classes in the **Test class runner**.

Typical configuration you can pick by name: **CustomField** (`Account.Status__c`), record types, validation rules, page layouts, Lightning pages, flows, permission sets, apps, tabs, picklists, reports, email templates. Search the type list for any other Metadata API type (Apex, LWC, Experience Cloud, settings, and so on). **Load all types from source org** refreshes the list from that sandbox.

## One-minute user manual

Watch [docs/orgflow-user-manual.mp4](docs/orgflow-user-manual.mp4) (about 1 minute). Open [docs/user-manual.html](docs/user-manual.html) in a browser to replay the same slides.

The flow is: detect orgs → pick components → confirm the live selected package → deploy. Git versioning stays on unless you turn it off for a one-off org-to-org push.

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

### GitHub repo (versioning)

On **Start**, choose **Git version control** if you want reusable Jira versions and pipelines.

1. Open [github.com/settings/tokens](https://github.com/settings/tokens) and create a token (`repo` scope, or fine-grained **Contents: Read and write**).
2. Paste it on Start → **Connect GitHub** → pick or paste `owner/repo` → **Use this repo**.
3. Name a pipeline (for example `Sandbox → UAT`), pick source and target, **Save pipeline to Git**.

Each configurator connects **their** repo with **their** token. Pipelines are stored in the repo at `.orgflow/pipelines.json` (no passwords, no session ids). Direct org-to-org deploy still works if you choose **Simple deploy**.

### Components

On the **Components** tab:

1. **Pick** — common configurator types first, every Metadata API type searchable. Load members from the source sandbox, tick what belongs to this Jira, or type a member such as `Account.Customer_Status__c`. Use **Selected only** and member search when an object has thousands of fields.
2. **Selected package** (side of the workbench, or below the picker in the side panel) updates on every tick:
   - **By category** — columns/groups by metadata type, and by object for fields/layouts
   - **package.xml** — the exact manifest Salesforce will retrieve
3. **package.xml** sub-tab — edit the XML by hand, then **Apply XML to picker**. Or **Rebuild from picker**.
4. **Review / edit** — retrieve the package, then open metadata XML and edit it before deploy.

**Deploy configuration to target org** still works with Git off. With Git on, **Save Git version & deploy** stores the same snapshot under the Jira key so you can redeploy it later.

Wildcard `*` for a type still works if you want everything of that type. For real releases, pick named members so the version is reviewable.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account status field + layout + flow` |
| Source org | Config sandbox |
| Target org | UAT |
| Tests | `No tests` for config-only; **Test class runner** → `RunSpecifiedTests`; `Run local tests` if you prefer the whole org’s local tests |

- **Use Git repo for versioning** — on by default. Connect a repo and save `PROJ-123-v1`. Off = one-off org-to-org, no Git write.
- **Workbench** — wide window: picker on the left, live selected package on the right (category columns + package.xml).
- **Test class runner** — tick `*Test` classes from the package or scan the source org. Deploy SOAP includes `<runTests>`.
- **Deploy configuration to target org** — retrieve the picked components (or use files already in Review) and Metadata API deploy to the target org.
- **Save version to Git** — commit that snapshot + version record under the Jira key.
- **Deploy saved version** — read a previous Jira version from Git and deploy it.
- **Save Git version & deploy** — both in one step.
- **Validate only** — `checkOnly` deploy (no changes committed on the org).

## Can this be a real deployment / version tool?

Yes, for metadata. OrgFlow talks to the same **Salesforce Metadata API** that Salesforce CLI, change sets, and tools like Gearset use: retrieve a package, optionally edit files, deploy the zip, and keep Jira-keyed snapshots in Git.

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
