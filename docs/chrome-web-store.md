# Chrome Web Store submission (OrgFlow 1.11.8)

Use this tomorrow morning after you smoke-test in Chrome. Upload **`files/orgflow-chrome-web-store.zip`** — `manifest.json` is at the zip root (required). Do **not** upload `orgflow-extension.zip`; that nested `orgflow/` folder is only for Load unpacked.

Privacy policy URL (must stay public):

https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/docs/privacy.html

After merge to `main`, switch the URL to the `main` blob or GitHub Pages copy of `docs/privacy.html`.

## Developer dashboard fields

**Name:** OrgFlow

**Summary (132 characters max):**  
Sequential Salesforce metadata deploys with Jira versions in this browser, or in GitHub, GitLab, or Azure DevOps.

**Category:** Productivity (or Developer Tools)

**Language:** English

**Website:** https://github.com/rajeevketha/repositoryTool

### Detailed description (paste)

OrgFlow helps Salesforce configurators move metadata from a sandbox to QA, UAT, or production.

Work in order: Start → Type → Members → Retrieve → Deploy. You cannot skip ahead. Log into both orgs in Chrome, detect them, and set From and To in the path bar.

Versioning is always on. Snapshots are keyed by Jira (PROJ-123-v1). Keep them in this Chrome profile, or share them in GitHub, GitLab, or Azure DevOps so teammates can reuse the same package.

With a team repo you can:

- Save pipelines (From, To, test level) to .orgflow/pipelines.json
- Save each retrieve as v1, v2, … with a required commit message, under .orgflow/releases with Salesforce metadata folders (classes, objects, layouts, lwc)
- Detect an existing force-app / src / manifest project so OrgFlow never overwrites it; optionally add DX folders on an empty repo
- Compare a retrieve with a previous version before you deploy (metadata XML and Apex diffs)
- Revert selected files into the current retrieve
- Deploy a saved version to the next org

OrgFlow talks to the Salesforce Metadata API using your existing browser session. No Connected App is required. Git tokens stay in this browser and are never written to the repo.

Not a full Copado/Gearset replacement: no data (records) deploy, no dependency graph.

### Screenshots

Upload every PNG in `docs/store/screenshots/` (1280×800). Optional promo tile: `docs/store/promo-small.png` (440×280). Store icon: `extension/icons/icon128.png`.

## Privacy practices questionnaire

Answer to match `docs/privacy.html` and the actual code:

| Question | Answer |
| --- | --- |
| Does this item collect user data? | Yes — stored locally; Salesforce/Git only as the user directs |
| Personally identifiable information | Yes, locally: Salesforce username/org name from the session APIs; optional Git display name |
| Remote code | No |
| Used for purposes unrelated to the feature | No |
| Transferred to third parties | Only to Salesforce and, if enabled, the Git host the user connected |
| Sold | No |
| Used for creditworthiness or lending | No |

## Permission justifications (paste if asked)

- **storage** — save package selection, org list, Git host settings, and local Jira versions on this Chrome profile.
- **cookies** — read the Salesforce `sid` cookie so retrieve/deploy can use the org the user is already logged into. Same idea as Salesforce Inspector. No other cookies.
- **sidePanel** — the configurator UI.
- **Host permissions (Salesforce)** — Metadata API retrieve/deploy on `*.salesforce.com`, `*.force.com`, and related Salesforce hosts.
- **Host permissions (Git)** — GitHub/GitLab/Azure REST APIs when the user turns on a team repo.
- **Optional host permission `https://*/*`** — requested only if the user enters a self-hosted GitLab URL. Not used at install time.

## Single purpose (if asked)

OrgFlow retrieves and deploys Salesforce metadata between orgs the user is logged into, with optional Jira-keyed snapshots in this browser or a Git repository.

## After upload

1. Load unpacked from `extension/` or unzip `files/orgflow-extension.zip` → `orgflow/`.
2. Confirm From/To, retrieve, deploy, and (if you use Git) Save to repo.
3. Submit for review. First review can take several days.
