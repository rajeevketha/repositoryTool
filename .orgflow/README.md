# OrgFlow snapshots

Retrieved Salesforce metadata is stored here as Jira versions:

```
.orgflow/releases/PROJ-123/v1/classes/...
.orgflow/releases/PROJ-123/v1/objects/...
.orgflow/releases/PROJ-123/v1/package.xml
```

Folder names match the Metadata API (the same ones you see under `force-app/main/default` in VS Code: classes, lwc, layouts, objects, flows, …).

- `force-app/` is the Salesforce DX working tree for CLI / VS Code. OrgFlow does not overwrite it when you save a version.
- Each save of the same Jira key creates `v2`, `v3`, … so older snapshots stay reviewable.
