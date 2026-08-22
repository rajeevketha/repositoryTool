# OrgFlow — management briefing

Standard 11-slide executive deck (16:9). Light theme, navy headers, page footers.

| Share as | Location |
| --- | --- |
| Present in Chrome | [orgflow-pitch.html](orgflow-pitch.html) |
| Direct HTML link | https://htmlpreview.github.io/?https://github.com/rajeevketha/repositoryTool/blob/cursor/orgflow-salesforce-deploy-c0ed/docs/orgflow-pitch.html |
| CDN backup | https://cdn.jsdelivr.net/gh/rajeevketha/repositoryTool@cursor/orgflow-salesforce-deploy-c0ed/docs/orgflow-pitch.html |
| Google Slides / PowerPoint | [orgflow-manager-briefing.pptx](orgflow-manager-briefing.pptx) — Drive → Open with Google Slides |
| Download pack | [files/orgflow-manager-pitch.zip](../files/orgflow-manager-pitch.zip) |
| PDF | Open the HTML → Print → Save as PDF |

---

## 1. Title

**OrgFlow**  
Internal briefing

A lightweight way for Salesforce administrators to promote configuration between environments—without a developer workstation or a release-management platform.

---

## 2. Agenda

1. Context and the recommendation  
2. Intended users and operating model  
3. Comparison with tools already in use  
4. Scope, governance, and a proposed pilot  

---

## 3. Context

**Small configuration changes still consume disproportionate time**

Administrators typically complete a field, layout, or flow in a sandbox in well under an hour. Moving that work to QA or production often takes much longer than building it.

- **Handoffs** — Promotion frequently waits on someone fluent in VS Code, change sets, or a release tool. The delay is process, not complexity.
- **Fragmented tooling** — Workbench, the Salesforce CLI, and enterprise DevOps platforms each solve a different job. None is designed for a short, named configuration move.
- **Inconsistent packages** — Rebuilding the component list in each environment increases the chance that QA and production do not receive the same change.

---

## 4. Recommendation

**Adopt OrgFlow for administrator-led promotions**

OrgFlow is a Chrome extension. Staff select the configuration they built, retrieve a snapshot from the source organization, and deploy that same snapshot to the target organization.

**What this provides**  
Guided source-to-target path in the existing browser. No Salesforce CLI, DX project, or Connected App. Optional team repository later. No incremental platform license to evaluate first.

**What this is not**  
Not a replacement for VS Code or engineering CI. Not a substitute for Copado, Gearset, or Flosum. Not a data-migration or full-org compare product. Not an automated dependency analyzer.

---

## 5. Intended users

**Appropriate** — Administrators and configurators working primarily in Setup. Named metadata promotions. Shared history later, not as a prerequisite. Time-boxed pilot before any platform discussion.

**Not appropriate** — Apex, LWC, and CI. Multi-stream release trains. Record or data movement. Discovery of unknown dependencies across an entire org.

---

## 6. Operating model

Four sequential steps; later steps stay closed until the prior one is complete.

1. **Start** — Sign in to source and target in Chrome. Detect. Select From and To. They must be different.  
2. **Package** — Review recent source changes and select components. Staff do not author XML.  
3. **Retrieve** — Snapshot from source. Jira optional on the device; required with a shared repository.  
4. **Confirm** — Review path and contents. Validate if required. Deploy. The same snapshot can move to the next environment.

---

## 7. Comparison — Workbench and VS Code

| | Workbench | VS Code and Salesforce CLI | OrgFlow |
| --- | --- | --- | --- |
| Primary job | API console for a prepared zip | Source-driven development and CI | Administrator-led promotion of named configuration |
| Skill required | Metadata API and package.xml | DX project, authorize, retrieve, deploy | Salesforce Setup and a Chrome sign-in |
| Repeatability | Each organization is a new session | Repository is the system of record | One snapshot can move source → QA → production |
| Oversight | No enforced source and target pair | Branch and pipeline policy | Source and target must differ; confirmation precedes deploy |

---

## 8. Comparison — change sets and DevOps platforms

**Change sets** — Slow to assemble and inconvenient to reuse. OrgFlow keeps a single named list and snapshot.

**Copado, Gearset, Flosum** — Appropriate for release trains and compliance. Disproportionate for a two-item move. OrgFlow sits beside those platforms.

**Repository-only process** — Still requires a developer without a selection interface. OrgFlow can write versions to GitHub, GitLab, or Azure DevOps after selection.

**Deliberate limits** — No record migration, full-org compare, or inferred dependencies. Staff promote what they selected.

---

## 9. Governance

**Access** — Existing Chrome Salesforce session. No Connected App. Optional Git credentials stay in that browser profile.

**Blast radius** — Named metadata only. Source and target cannot be the same organization. Validation available. Apex tests may run in production if policy requires coverage.

**Audit** — Device storage: local snapshots; Jira optional. Shared repository: Jira key and comment required.

---

## 10. Proposed pilot

**Scope** — Two administrators; two sandbox or disposable organizations; one representative change; source → QA on device storage; optional test repository in week two.

**Success criteria** — Complete promotion without a developer; target receives selected components; no new platform license; decision on whether a shared repository is needed.

---

## 11. Requested action

Approve a two-week pilot with two administrators. Defer any discussion of replacing existing DevOps tooling until that pilot has a written outcome.

https://chromewebstore.google.com/detail/orgflow/cldfmnjjonlakccebbfnaaihneonhflc
