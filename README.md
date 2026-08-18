# OrgFlow

Chrome extension for **Jira-versioned Salesforce deployments**. Retrieve metadata from one org, store a snapshot in **your GitHub repo**, then deploy that same version to QA, UAT, or production.

Each user connects their own repository. Nothing in this project is hard-wired to a single Git remote.

## What it does

1. You work in a Salesforce org against a Jira ticket (for example `PROJ-123`).
2. In the OrgFlow side panel you enter that Jira key and a comment.
3. **Save version to Git** retrieves the metadata types you selected, writes them under `.orgflow/releases/PROJ-123/v1/`, and records the version in `.orgflow/versions.json`.
4. Later, in another org, enter the same Jira key (or `PROJ-123-v1`) and **Deploy version to org**.
5. Every deploy is appended to that version’s history (target org, status, comment, test level).

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

On the **Components** tab, choose which metadata types to retrieve (`ApexClass`, LWC, `CustomObject`, `Flow`, …). Those types are snapshotted into Git for that Jira version.

## Typical flow

| Field | Example |
| --- | --- |
| Jira ticket | `PROJ-123` |
| Comment | `Account validation + LWC fix` |
| Source org | Dev sandbox |
| Target org | UAT |
| Tests | `No tests` in sandboxes; `Run local tests` on production |

- **Save version to Git** — retrieve from source, commit snapshot + version record.
- **Deploy version to org** — read that snapshot from Git, Metadata API deploy to target.
- **Save & deploy** — both in one step.
- **Validate only** — `checkOnly` deploy (no changes committed on the org).

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
