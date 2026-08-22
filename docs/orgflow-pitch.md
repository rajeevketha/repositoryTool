# OrgFlow pitch slides

Open [orgflow-pitch.html](orgflow-pitch.html) in a browser (arrow keys / Next). Copy the blocks below into Google Slides or PowerPoint (widescreen 16:9). One slide per heading.

---

## Slide 1 — Title

**OrgFlow**  
Move Salesforce config the way configurators work

Build a field, a layout, a flow in a sandbox. Send that same named package to QA, then prod — in Chrome.

No project setup. Git is optional.

*A sequential From → To promotion tool. Not a second IDE. Not a DevOps platform.*

---

## Slide 2 — The gap

**A field change should not require a repo**

Left — What configurators actually ship  
Custom fields, record types, layouts, Lightning pages, flows, permission sets, validation rules. Named members. One hop: DEC → QA → Staging → Prod.

Right — What most tools ask for  
A DX project, a CLI, a change set, or a release train. Fine for developers. Heavy when you just built `Account.Status__c` and need it in QA today.

---

## Slide 3 — Who it is for

**Salesforce configurators first**

1. **Admins & configurators** — Pick members by name. Tick what you just built. Deploy. Stay in the browser.
2. **Small teams** — Snapshots on this device. Promote the same package to the next org. Jira optional.
3. **Teams with a repo** — GitHub, GitLab, or Azure when you need a shared warehouse. Same wizard. Jira required on that path.

---

## Slide 4 — How it works

**Four steps. You cannot skip ahead.**

| Step | What you do |
| --- | --- |
| **1 Start** | Log into From and To in Chrome. Detect. They must be different. This device or a release repo. |
| **2 Package** | What’s new in the From org. Search a type if you know the name. One related add — not every layout. |
| **3 Retrieve** | Pull files from From. Download a zip if you want. Compare with a saved snapshot. |
| **4 Confirm** | See From → To and what is going. Validate (dry run) or Deploy. Result stays on the screen. |

---

## Slide 5 — Easy on purpose

**If you can log into Salesforce, you can use this**

No setup tax  
- No Connected App  
- No Salesforce CLI / VS Code project  
- No force-app to learn first  
- Uses the Chrome session you already have  

Guides the next click  
- Next stays off until From and To differ  
- Deploy stays off until retrieve succeeds  
- Changing From clears the old org’s members  
- Each open starts a new package  

---

## Slide 6 — Versus Salesforce Workbench

**Workbench retrieves. OrgFlow promotes.**

| | Workbench | OrgFlow |
| --- | --- | --- |
| Job | API console. Retrieve or deploy a zip you already built. | Pick named members, retrieve, send that package to the next org. |
| Package | You write or upload `package.xml`. | What’s new + tick by name. `package.xml` is built for you. |
| Path | One org at a time. No From → To memory. | From and To stay in the path bar. Same snapshot can hop QA → prod. |
| Zip | The zip is the product. | Optional. You can still upload a Workbench-style zip. |

*Workbench stays useful for raw API work. OrgFlow is the daily “I built this field, send it” path.*

---

## Slide 7 — Versus VS Code + Salesforce CLI

**VS Code is for source. OrgFlow is for a hop.**

| | VS Code + CLI | OrgFlow |
| --- | --- | --- |
| Who | Developers. Apex, LWC, scratch orgs, CI. | Configurators. Fields, layouts, flows, permission sets. |
| Start | Authorize an org, open a DX project, retrieve into `force-app`. | Open the side panel. Detect logged-in orgs. Tick names. |
| Deploy | Deploy source / manifest from the project. | Sequential retrieve then deploy. No project folder required. |
| Git | The repo is the system of record. | Git is optional. This device is enough to promote the same files. |

*Teams that already live in VS Code should stay there. OrgFlow is for people who should not open an IDE to move a layout.*

---

## Slide 8 — Versus other deploy / repo tools

**Not Copado. Not Gearset. Not a change set.**

**Change Sets** — Upload, wait, download, remember dependencies. OrgFlow is named members, one hop, result on the same screen.

**Copado / Gearset / Flosum** — Release trains, dependency graphs, data, seats. OrgFlow does not replace them. It does the small promotion those platforms make expensive: this field, this layout, this org, now.

**Git-only tools** — A repo without a picker is still a developer workflow. OrgFlow can write Jira versions into GitHub, GitLab, or Azure *after* you picked members in the UI.

**What OrgFlow will not do** — No data / records deploy. No full org compare. No automatic dependency graph. Tick the members you know you built.

---

## Slide 9 — What you get

**Useful on the first afternoon**

- **What’s new** — Package opens on recent From-org changes, not a 400-type grid.
- **Already in To?** — Overwrite vs new vs missing custom object. Does not block Deploy.
- **Same snapshot** — Auto-save on this device after a successful deploy. Promote those files next.
- **Zip when you need it** — Download the retrieve, or start From a zip (Workbench layout).
- **Optional tests** — Run Apex tests in To if you want coverage. Skip them in a sandbox.
- **API that lasts** — After Detect, 68 / 69 appear from the org.

---

## Slide 10 — Close

**Detect. Tick. Retrieve. Deploy.**

Chrome Web Store, or load unpacked from the repo zip.  
Two logged-in orgs. From and To must be different.

https://chromewebstore.google.com/detail/orgflow/cldfmnjjonlakccebbfnaaihneonhflc
