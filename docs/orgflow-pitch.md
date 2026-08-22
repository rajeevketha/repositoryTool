# OrgFlow — manager briefing

11 widescreen slides. Present in a browser, import into Google Slides, or print to PDF.

| Share as | File or link |
| --- | --- |
| Open in Chrome now | [orgflow-pitch.html](orgflow-pitch.html) (arrow keys / Next) |
| Direct HTML preview | https://htmlpreview.github.io/?https://github.com/rajeevketha/repositoryTool/blob/cursor/orgflow-salesforce-deploy-c0ed/docs/orgflow-pitch.html |
| Alternate CDN link | https://cdn.jsdelivr.net/gh/rajeevketha/repositoryTool@cursor/orgflow-salesforce-deploy-c0ed/docs/orgflow-pitch.html |
| Google Slides / PowerPoint | [orgflow-manager-briefing.pptx](orgflow-manager-briefing.pptx) — Drive → Open with Google Slides |
| Download pack | [files/orgflow-manager-pitch.zip](../files/orgflow-manager-pitch.zip) |
| PDF | Open the HTML → Print → Save as PDF |

---

## Slide 1 — Title

**Promote Salesforce configuration without a developer toolchain**

OrgFlow is a Chrome extension for admins and configurators. They pick the change they just built in a sandbox and send that same package to QA, then production.

No new IDE. No mandatory Git repo. No Copado-class license. A guided From → To hop in the browser they already use.

---

## Slide 2 — Why this is on a manager’s desk

**Small config changes are still expensive**

- **Handoffs** — A field or layout often waits on someone who knows VS Code, a change set, or a release tool. The work took twenty minutes. The promotion takes a day.
- **Tool sprawl** — Workbench for zips. VS Code for source. A DevOps platform for releases. None match “send this named change to the next org.”
- **Wrong package risk** — People rebuild the list in each org. OrgFlow keeps one snapshot and walks it DEC → QA → prod.

---

## Slide 3 — Fit

**Who should use it — and who should not**

Good fit  
- Admins and configurators who live in Setup  
- Teams that promote a handful of named items at a time  
- Orgs that want a shared history later, not on day one  
- Managers who want a pilot without a platform RFP  

Not a replacement for  
- Developer source work (Apex, LWC, CI) in VS Code  
- Enterprise release trains (Copado, Gearset, Flosum)  
- Data / record migration  
- Automatic dependency analysis of a whole org  

---

## Slide 4 — The work

**One path. Four steps. They cannot skip.**

1. **Start — Choose the route** — Log into both orgs in Chrome. Detect. Set From and To. They must be different.
2. **Package — Name the change** — What’s new in From. Tick the items to move.
3. **Retrieve — Take a snapshot** — Pull those items. Optional Jira. Same files can travel later.
4. **Confirm — Dry-run, then send** — See the path and what will land. Validate if you want. Then Deploy.

---

## Slide 5 — Adoption

**Training is measured in minutes, not weeks**

What people already have  
Chrome. Two Salesforce logins. That is the setup. No Connected App, no CLI, no project folder.

What the product refuses to do  
Next stays off until From and To differ. Deploy stays off until retrieve succeeded. Changing From clears the old selection so yesterday’s package does not go to the wrong place.

---

## Slide 6 — Versus Workbench

**Workbench is a console. OrgFlow is a promotion.**

| | Workbench | OrgFlow |
| --- | --- | --- |
| Role | Expert API tool. Retrieve or deploy a zip someone already prepared. | Daily path for “I built this in sandbox — send it to QA.” |
| Skill | You must know package.xml and Metadata API layout. | Tick names. The package is built for them. |
| Repeatability | Each org is a new session. Easy to send a different list next time. | One snapshot. Same files can hop to the next environment. |
| Oversight | No From → To bar. Easy to deploy back into the same org. | From and To must differ. Confirm shows the path before send. |

---

## Slide 7 — Versus VS Code

**Do not send configurators into an IDE to move a layout**

| | VS Code + Salesforce CLI | OrgFlow |
| --- | --- | --- |
| Staffing | Developers and technical admins. Scratch orgs, source, CI. | Configurators who work in Setup all day. |
| Onboarding | Authorize an org, create a DX project, learn retrieve/deploy. | Install a Chrome extension. Detect orgs. Follow Next. |
| System of record | The Git repo is the product. Correct for engineering. | Git is optional. A shared repo is a later decision. |
| Cost of a small change | Worth it for Apex and LWC. Overhead for one field and a layout. | Built for that small change. |

---

## Slide 8 — Versus other tools you may already pay for

**Complement, do not rip and replace**

- **Change Sets** — Slow and awkward to reuse. OrgFlow is a named list, one hop, result on the same screen.
- **Copado / Gearset / Flosum** — Right for release trains. Wrong as the only way to send two fields to QA. OrgFlow sits beside those platforms.
- **Git-only process** — A repo without a picker still needs a developer. OrgFlow can write versions to Git after members are chosen.
- **Limits** — No data (records). No full-org compare. No automatic dependency graph. People promote what they selected.

---

## Slide 9 — Controls

**What you can tell security and release owners**

- **Access** — Uses the Salesforce session already in Chrome. No Connected App. Git tokens, if used, stay in that browser.
- **Blast radius** — Named members only. From and To cannot be the same org. Validate is a dry run. Production can run Apex tests.
- **Audit** — On this device: local snapshots, optional Jira. With a release repo: Jira key and comment required; versions live in the team warehouse.

---

## Slide 10 — Suggested next step

**A two-week pilot, not a program**

Pilot  
- Two people, two sandbox or disposable orgs  
- One real config change (field + layout or a flow)  
- Promote sandbox → QA with storage on this device  
- Optional: a test Git repo in week two  

Success looks like  
- They complete a hop without a developer  
- QA receives the same members they picked  
- No new platform license to evaluate first  
- You decide later if the team needs a shared repo  

---

## Slide 11 — How to get it

**Install, detect, send**

Chrome Web Store, or load the unpacked extension from the team zip.  
Two logged-in Salesforce orgs. From and To must be different.

https://chromewebstore.google.com/detail/orgflow/cldfmnjjonlakccebbfnaaihneonhflc
