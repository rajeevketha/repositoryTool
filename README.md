# OrgFlow

Chrome extension for **Salesforce configurators**: build fields, layouts, flows, permission sets (and other metadata) in a sandbox, then deploy that same package to QA, UAT, or production.

Optional GitHub storage versions each Jira ticket (`PROJ-123-v1`) so later orgs get the identical snapshot. Git is not required for a one-off sandbox → target deploy.

## Configurator workflow

1. Log into the **source sandbox** and the **target org** in Chrome. Setup → **Detect logged-in orgs**.
2. **Components** (defaults to configuration types, not Apex):
   - Objects & fields, pages/layouts, automation, access, picklists, reports/email
   - Load members from the sandbox, tick what belongs to the Jira
   - Or edit `package.xml` / retrieved XML on the other sub-tabs
3. **Deploy** tab: source org = sandbox, target org = QA/UAT/prod, Jira key + comment.
4. **Deploy configuration to target org**. Tick **Validate only** first if you want a dry run.
5. Optionally **Save version to Git** so the next org gets `PROJ-123-v1` instead of re-picking.

Typical configuration you can pick by name: **CustomField** (`Account.Status__c`), record types, validation rules, page layouts, Lightning pages, flows, permission sets, apps, tabs, picklists, reports, email templates. Search the type list for any other Metadata API type (Apex, LWC, Experience Cloud, settings, and so on). **Load all types from source org** refreshes the list from that sandbox.

## One-minute user manual

Watch [docs/orgflow-user-manual.mp4](docs/orgflow-user-manual.mp4) (about 1 minute). Open [docs/user-manual.html](docs/user-manual.html) in a browser to replay the same slides.

The flow is: detect orgs → pick components → deploy to the target org. Git is optional if you want `PROJ-123-v1` for later orgs.

## Install (unpacked Chrome extension)

1. Clone this repository.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. Pin OrgFlow and open it. Chrome opens a side panel.

## First-time setup

### Salesforce orgs (required)

Log into each org in Chrome (the same profile), then **Detect logged-in orgs**. OrgFlow reads the `sid` cookie — the same idea as Salesforce Inspector. No Connected App is required.

If an org does not appear, open it (Lightning or Setup) so a `*.my.salesforce.com` session cookie exists, then detect again.

### GitHub repo (optional)

Use this when several orgs should receive the **same** Jira version later.

1. Create a GitHub personal access token (`repo` scope, or fine-grained **Contents: Read and write**).
2. Setup → paste the token → **Connect GitHub** → pick or paste `owner/repo` → **Use this repo**.

Each configurator connects **their** repo with **their** token. Settings stay in that browser profile.

### Components

On the **Components** tab:

1. **Pick** — common configurator types first, every Metadata API type searchable. Load members from the source sandbox, tick what belongs to this Jira, or type a member such as `Account.Customer_Status__c`.
2. **package.xml** — edit the XML by hand, then **Apply XML to picker**. Or **Rebuild from picker**.
3. **Review / edit** — retrieve the package, then open metadata XML and edit it before deploy.

**Deploy selected to target** pushes that package to the target org (Git is optional). **Save version to Git** stores the same snapshot under the Jira key so you can redeploy it later.

Wildcard `*` for a type still works if you want everything of that type. For real releases, pick named members so the version is reviewable.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account status field + layout + flow` |
| Source org | Config sandbox |
| Target org | UAT |
| Tests | `No tests (config-only)`; `Run local tests` if Apex is included or the target is production |

- **Deploy configuration to target org** — retrieve the picked components (or use files already in Review) and Metadata API deploy to the target org.
- **Save version to Git** — commit that snapshot + version record under the Jira key.
- **Deploy saved version** — read a previous Jira version from Git and deploy it.
- **Save version & deploy** — both in one step.
- **Validate only** — `checkOnly` deploy (no changes committed on the org).

## Can this be a real deployment / version tool?

Yes, for metadata. OrgFlow talks to the same **Salesforce Metadata API** that Salesforce CLI, change sets, and tools like Gearset use: retrieve a package, optionally edit files, deploy the zip, and keep Jira-keyed snapshots in Git.

Use it that way when:

- You select **named components** (not an entire org wildcard) for a ticket
- You **validate** (`checkOnly`) on the target, then deploy
- Production deploys use **Run local tests** (or your required test level)
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
- Production deploys should use **Run local tests** (or your org’s required test level).

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
Chrome side panel
  ├─ Salesforce cookies → REST identity + SOAP Metadata retrieve/deploy
  └─ GitHub PAT → Git Data API (blobs / tree / commit) on the repo you selected
```

The Metadata API zip is unpacked and stored as normal files so you can review a Jira version in GitHub like any other commit.
