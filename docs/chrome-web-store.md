# Chrome Web Store submission (OrgFlow 1.11.23)

Paste kit for [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole). This environment cannot submit for you. You upload the zip, paste the fields below, and click **Submit for review**.

## What you still must do (our end vs yours)

### Already prepared in this repo (paste / upload)

| Asset | Where |
| --- | --- |
| Store zip (`manifest.json` at zip root) | [files/orgflow-chrome-web-store.zip](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-chrome-web-store.zip) |
| Load-unpacked zip (do **not** upload this) | [files/orgflow-extension.zip](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip) |
| Privacy policy URL | [docs/privacy.html](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/docs/privacy.html) |
| Store icon 128×128 | `extension/icons/icon128.png` |
| Small promo tile 440×280 | `docs/store/promo-small.png` |
| Five screenshots 1280×800 | `docs/store/screenshots/01`–`05` |
| Listing copy, privacy answers, permission justifications, test script | this file |

### Required from you before Submit

1. **Chrome Web Store developer account** — [Register](https://chrome.google.com/webstore/devconsole) (one-time **$5** USD). Turn on **2-step verification**. New publishers often must complete **identity verification** (government ID) in the dashboard before the first publish.
2. **Smoke-test in Chrome** with two real Salesforce orgs on the same profile: Detect → From/To (**On this device**) → Package (What’s new) → Retrieve (Jira optional on this path) → Validate → Deploy. Optional: switch to Release repo, enter Jira `PROJ-123` + comment, Save to a test Git repo. Load unpacked from `extension/` or unzip `orgflow-extension.zip` → `orgflow/`.
3. **Reviewer test login** — Chrome reviewers cannot retrieve/deploy without Salesforce. Create **two disposable Developer Editions** (or one DE + one Trailhead Playground). Put username, password, and MFA steps in the **Test instructions** tab. Do **not** use production or customer orgs. From and To must be different.
4. **Contact email** — dashboard account email, and optionally add the same address to `docs/privacy.html` Contact (today it only says “open a GitHub issue”).
5. **Distribution** — pick Public, Unlisted, or Private (trusted testers). For a first Salesforce tool, **Unlisted** or **Private testers** is safer until review passes; you can switch to Public later.
6. **Screenshots** — the five PNGs in `docs/store/screenshots/` are the right size. They were captured against an older Type / Members split. After your smoke test, **replace them with live 1280×800 captures** of Start, Package (What’s new), Retrieve (side-by-side), and Confirm (optional Apex tests). Upload those instead if they look different.
7. **Merge PR #2 to `main`** when you are ready for a stable privacy URL, then change the dashboard Privacy policy URL from the feature-branch raw link to:
   `https://raw.githubusercontent.com/rajeevketha/repositoryTool/main/docs/privacy.html`
   You can submit **before** merge using the branch URL below; just update it after merge so it does not rot if the branch is deleted.

### Optional from you (not required to submit)

- YouTube promo URL (listing shows video first if you add one).
- Marquee tile 1400×560 (`docs/store/` does not include one).
- Official URL / publisher verification in Search Console.
- Support URL (GitHub Issues is fine: `https://github.com/rajeevketha/repositoryTool/issues`).
- GitHub Pages for `docs/privacy.html` instead of raw.githubusercontent.com.

---

## 1. Package tab — upload the zip

Dashboard → **Add new item** (or **New item**) → upload:

https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-chrome-web-store.zip

Also on GitHub (Download raw file):  
https://github.com/rajeevketha/repositoryTool/blob/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-chrome-web-store.zip

**Do not** upload `orgflow-extension.zip`. That zip nests an `orgflow/` folder; the store requires `manifest.json` at the zip root.

After upload you should see:

- Name: **OrgFlow**
- Version: **1.11.23**
- Manifest V3

If Chrome rejects the zip, the usual cause is uploading the nested Load-unpacked zip. Use the store zip only.

---

## 2. Store listing tab — paste these

**Product name:** OrgFlow

**Summary** (132 characters max; this string is 113):

```
Sequential Salesforce metadata deploys with Jira versions in this browser, or in GitHub, GitLab, or Azure DevOps.
```

**Category:** Productivity  
(Developer Tools is also accurate if Productivity is missing.)

**Language:** English (United States)

**Mature content:** No / off

**Homepage URL:** https://github.com/rajeevketha/repositoryTool

**Support URL:** https://github.com/rajeevketha/repositoryTool/issues

### Detailed description (paste)

```
OrgFlow helps Salesforce configurators move named metadata from a sandbox to QA, UAT, or production.

Work in order: Start → Package → Retrieve → Confirm. You cannot skip ahead. Log into both orgs in Chrome, detect them, and set From and To in the path bar (org names, not usernames). Package starts with what just changed in the From org; you can browse types when you need them. After you pick members on an object, OrgFlow can add a small set of matching layouts or record types in one tap. Back from Retrieve returns to Package unlocked so you can add members, then retrieve again. On this device, a Jira key and comment are optional. They are required only when you choose a release repo. After retrieve you can compare this package (left) with a saved snapshot (right) on the same screen, download the zip, and check whether members already exist in the To org. Confirm shows what will go to the To org. If Apex is in the package, running tests is optional and does not add test classes to the package; coverage appears after Validate or Deploy when tests ran. Validate in To org is a dry run; Deploy sends it; the result stays on that screen.

Versioning is always on. Keep snapshots on this device (Jira optional; blank keys save as CHANGE-YYYYMMDD-N), or share them in GitHub, GitLab, or Azure DevOps so teammates can reuse the same package. A Jira key (PROJ-123) and comment are required only for the repo path.

With a team repo you can:

- Save pipelines (From, To, test level) to .orgflow/pipelines.json
- Save each retrieve as v1, v2, … with a required commit message, under .orgflow/releases with Salesforce metadata folders (classes, objects, layouts, lwc)
- Detect an existing force-app / src / manifest project so OrgFlow never overwrites it
- Compare a retrieve with a previous version before you deploy (metadata XML and Apex diffs)
- Revert selected files into the current retrieve
- Deploy a saved version to the next org

OrgFlow talks to the Salesforce Metadata API using your existing browser session. No Connected App is required. Git tokens stay in this browser and are never written to the repo.

Not a full Copado or Gearset replacement: no data (records) deploy, no dependency graph.
```

### Graphic assets (upload from the repo)

| Dashboard field | File | Size |
| --- | --- | --- |
| Store icon | `extension/icons/icon128.png` | 128×128 PNG |
| Small promotional tile (required) | `docs/store/promo-small.png` | 440×280 PNG |
| Screenshot 1 | `docs/store/screenshots/01-start.png` | 1280×800 |
| Screenshot 2 | `docs/store/screenshots/02-type.png` | 1280×800 |
| Screenshot 3 | `docs/store/screenshots/03-members.png` | 1280×800 |
| Screenshot 4 | `docs/store/screenshots/04-retrieve.png` | 1280×800 |
| Screenshot 5 | `docs/store/screenshots/05-versions-diff.png` | 1280×800 |
| Marquee promo | skip unless you create 1400×560 | optional |
| Promo video | skip unless you have a YouTube URL | optional |

Rules: square corners, no padding, actual UI (not a marketing collage). Prefer live captures after smoke test.

---

## 3. Privacy practices tab — paste these

**Privacy policy URL** (must stay public HTTPS):

```
https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/docs/privacy.html
```

After merge to `main`:

```
https://raw.githubusercontent.com/rajeevketha/repositoryTool/main/docs/privacy.html
```

Open that URL in an incognito window before submit and confirm it loads.

### Single purpose

```
OrgFlow retrieves and deploys Salesforce metadata between orgs the user is logged into, with optional Jira-keyed snapshots in this browser or a Git repository.
```

### Remote code

Select: **No, I am not using remote code.**

Justification if a text box appears:

```
All logic ships in the packaged extension files. OrgFlow does not load or execute JavaScript from the network. It only calls Salesforce Metadata APIs and, if the user enables a team repo, GitHub / GitLab / Azure REST APIs.
```

### Data usage — check these types

Chrome asks which types of user data the item **handles** (including data stored only on this device).

| Type | Check? | Why |
| --- | --- | --- |
| Personally identifiable information | **Yes** | Salesforce username and org name from session APIs; optional Git display name |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | **Yes** | Salesforce `sid` cookie already in Chrome; optional Git personal access token pasted by the user, stored locally |
| Personal communications | No | |
| Location | No | |
| Web history | No | OrgFlow does not log browsing. It only reads Salesforce `sid` cookies to talk to orgs the user is already logged into |
| User activity | **Yes** | Package selection, From/To path, and last retrieve/deploy state stored in this Chrome profile |
| Website content | **Yes** | Salesforce metadata XML/Apex the user retrieves and deploys; optional `.orgflow/` files in the user’s Git repo |
| User-generated content | **Yes** | Jira key, retrieve comment, and Git commit message the user types |

Leave other types unchecked.

### Certifications (second group of checkboxes)

Check **all** of the compliance statements. OrgFlow:

- Does not sell user data
- Does not use data for purposes unrelated to the single purpose
- Does not use data for creditworthiness or lending
- Transfers data only to Salesforce and, if the user enables it, the Git host they connected
- Complies with the Chrome Web Store User Data Policy, including Limited Use

The privacy policy includes a Limited Use statement.

### Permission justifications (paste next to each permission Chrome lists)

Copy the matching paragraph. Host permissions may appear as one field or several.

**storage**

```
Save package selection, From/To org labels, Git host settings, and local Jira-keyed snapshots on this Chrome profile. Nothing is written to an OrgFlow server.
```

**cookies**

```
Read the Salesforce sid cookie so retrieve and deploy use the org the user is already logged into in Chrome. Same approach as Salesforce Inspector. OrgFlow does not read cookies from other sites.
```

**sidePanel**

```
The configurator UI is a Chrome side panel opened from the toolbar icon.
```

**Host permissions — Salesforce** (`https://*.salesforce.com/*`, `https://*.force.com/*`, `https://*.cloudforce.com/*`, `https://*.salesforce-setup.com/*`, `https://*.sfcrmapps.cn/*`)

```
Call the Salesforce Metadata API and identity APIs on the org the user selected (retrieve, deploy, describe, list metadata). Hosts cover commercial, Government Cloud-related, and Salesforce China login/API hosts. OrgFlow does not scrape Lightning pages.
```

**Host permissions — GitHub** (`https://api.github.com/*`)

```
Optional. Used only when the user turns on a GitHub release repo, to read and write .orgflow/ files with the token they pasted.
```

**Host permissions — GitLab** (`https://gitlab.com/*`, `https://*.gitlab.com/*`)

```
Optional. Used only when the user turns on a GitLab.com release repo.
```

**Host permissions — Azure DevOps** (`https://dev.azure.com/*`, `https://*.dev.azure.com/*`, `https://*.visualstudio.com/*`)

```
Optional. Used only when the user turns on an Azure DevOps release repo.
```

**Optional host permission** (`https://*/*`)

```
Not granted at install. Chrome prompts only if the user enters a self-hosted GitLab URL on Start. That host is unknown ahead of time, so the optional permission is requested at that moment and used only for that GitLab API.
```

---

## 4. Distribution tab

| Field | Recommended first submit |
| --- | --- |
| Visibility | **Unlisted** or **Private** (trusted testers), then Public after a clean review |
| Regions | All regions |
| Pricing | Free |

Private testers: add Google account emails under developer account → **Trusted testers**.

---

## 5. Test instructions tab (required for this product)

Reviewers have no Salesforce session unless you give them one. Paste this after you fill in the two DE logins:

```
OrgFlow is a Salesforce Metadata retrieve/deploy side panel. It cannot be fully tested without two Salesforce logins in the same Chrome profile.

TEST ORGS (disposable Developer Editions — not production):
From org:  [USERNAME]  /  [PASSWORD]  MFA: [how to pass, or "no MFA"]
To org:    [USERNAME]  /  [PASSWORD]  MFA: [how to pass, or "no MFA"]

STEPS:
1. In this Chrome profile, log into both orgs (Lightning home is enough).
2. Pin OrgFlow and open the side panel.
3. Start → Detect logged-in orgs → set From and To (must differ). Leave storage set to On this device.
4. Next → Package. Add any small member from What’s new, or browse CustomField / ApexClass.
5. Next → Retrieve from From org. Jira and comment are optional on this path. Then Next.
6. Next → Confirm. Click Validate in To org (dry run). Then Deploy if validate succeeds.
7. Expected: retrieve zip, Confirm summary, validate/deploy status on the same screen.

GitHub/GitLab/Azure is optional and does not need to be tested for the core path.
Do not use customer or production credentials.
```

Replace the bracketed fields. If you cannot share even a DE login, say so in Test instructions and expect a slower or failed functional review; static review of the zip may still proceed.

---

## 6. Submit for review

1. Click **Submit for review**.
2. Keep **Publish automatically after review** checked only if you want it live the moment Google approves. Uncheck (deferred publish) if you want to flip visibility yourself.
3. First review often takes several days. Watch the dashboard email.

If Google asks for a justification of `https://*/*`, paste the optional-host paragraph above and point at the self-hosted GitLab field on Start.

---

## After upload (your smoke test, before or in parallel)

1. Load unpacked from `extension/` or unzip [orgflow-extension.zip](https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip) → `orgflow/`.
2. Confirm From/To, retrieve (Jira optional unless Release repo is on), validate, deploy, and (if you use Git) Jira `PROJ-123` + comment then Save to repo.
3. If anything fails, **do not submit** until it is fixed; bump `extension/manifest.json` version and rebuild the store zip.

---

## Downloads (same files as the PR)

- Load unpacked: https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip
- GitHub page: https://github.com/rajeevketha/repositoryTool/blob/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-extension.zip
- Store zip: https://raw.githubusercontent.com/rajeevketha/repositoryTool/cursor/orgflow-salesforce-deploy-c0ed/files/orgflow-chrome-web-store.zip
