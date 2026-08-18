# OrgFlow

Chrome extension for **Jira-versioned Salesforce deployments**. Retrieve metadata from one org, store a snapshot in **your GitHub repo**, then deploy that same version to QA, UAT, or production.

Each user connects their own repository. Nothing in this project is hard-wired to a single Git remote.

## What it does

1. You work in a Salesforce org against a Jira ticket (for example `PROJ-123`).
2. On **Components**, pick the exact metadata (or edit `package.xml`), optionally retrieve and edit the XML files.
3. Enter the Jira key and a comment, then **Save version to Git** and/or **Deploy selected to target**.
4. Later, enter the same Jira key (or `PROJ-123-v1`) and **Deploy saved version** so every org gets that snapshot.
5. Every Git-backed deploy is appended to that version’s history (target org, status, comment, test level).

If you only type a comment, OrgFlow mints an id like `CHANGE-20260818-1`.

## Install (unpacked Chrome extension)

1. Clone this repository.
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. Pin OrgFlow and open it. Chrome opens a side panel.

## First-time setup

### GitHub repo (required, per user)

1. Create a GitHub personal access token:
   - Classic: `repo` scope
   - Fine-grained: **Contents: Read and write** on the target repository
2. Open the **Setup** tab, paste the token, click **Connect GitHub**.
3. Pick a repo from the list **or** paste `owner/repo` (or a github.com URL).
4. Set the branch (default `main`) and click **Use this repo**.

Another teammate installs the same extension and points it at **their** repo with **their** token. Settings live in `chrome.storage.local` for that browser profile only.

### Salesforce orgs

Log into each org in Chrome (the same profile), then **Detect logged-in orgs**. OrgFlow reads the `sid` cookie and calls the Salesforce REST API — the same approach as Salesforce Inspector. No Connected App is required for v1.

If an org does not appear, open it (Lightning or Setup) so a `*.my.salesforce.com` session cookie exists, then detect again.

Source and target can be any detected org (sandbox → sandbox, sandbox → prod, and so on).

### Components

On the **Components** tab:

1. **Pick** — choose a metadata type, **Load from source org**, tick the exact classes/LWCs/objects/flows for this Jira. You can also type a member name if it is not in the list.
2. **package.xml** — edit the XML by hand, then **Apply XML to picker**. Or **Rebuild from picker**.
3. **Review / edit** — retrieve the package, then open any metadata file (object XML, Apex, LWC, `package.xml`) and edit it before deploy.

**Deploy selected to target** pushes that package to the target org (Git is optional). **Save version to Git** stores the same snapshot under the Jira key so you can redeploy it later.

Wildcard `*` for a type still works if you want everything of that type. For real releases, pick named members so the version is reviewable.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account validation + LWC fix` |
| Source org | Dev sandbox |
| Target org | UAT |
| Tests | `No tests` in sandboxes; `Run local tests` on production |

- **Deploy selected to target** — retrieve the picked components (or use files already in Review) and Metadata API deploy to the target org.
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
