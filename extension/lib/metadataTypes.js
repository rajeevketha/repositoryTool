export const CATALOG_GROUPS = [
  {
    id: "objects",
    label: "Objects & fields",
    audience: "config",
    types: [
      { name: "CustomField", label: "Fields (Object.Field)" },
      { name: "CustomObject", label: "Objects (whole object)" },
      { name: "RecordType", label: "Record types" },
      { name: "FieldSet", label: "Field sets" },
      { name: "BusinessProcess", label: "Business processes" },
      { name: "ValidationRule", label: "Validation rules" },
      { name: "CompactLayout", label: "Compact layouts" },
      { name: "ListView", label: "List views" },
      { name: "WebLink", label: "Buttons and links" },
      { name: "ActionOverride", label: "Action overrides" },
      { name: "CustomMetadata", label: "Custom metadata records / types" }
    ]
  },
  {
    id: "ui",
    label: "Pages, layouts & apps",
    audience: "config",
    types: [
      { name: "Layout", label: "Page layouts" },
      { name: "FlexiPage", label: "Lightning pages" },
      { name: "CustomApplication", label: "Apps" },
      { name: "CustomTab", label: "Tabs" },
      { name: "QuickAction", label: "Quick actions" },
      { name: "PathAssistant", label: "Path assistants" },
      { name: "HomePageLayout", label: "Home page layouts" },
      { name: "CustomLabel", label: "Custom labels" }
    ]
  },
  {
    id: "automation",
    label: "Automation",
    audience: "config",
    types: [
      { name: "Flow", label: "Flows" },
      { name: "FlowDefinition", label: "Flow definitions" },
      { name: "ApprovalProcess", label: "Approval processes" },
      { name: "Workflow", label: "Workflow rules" },
      { name: "AssignmentRules", label: "Assignment rules" },
      { name: "AutoResponseRules", label: "Auto-response rules" },
      { name: "EscalationRules", label: "Escalation rules" },
      { name: "DuplicateRule", label: "Duplicate rules" },
      { name: "MatchingRule", label: "Matching rules" }
    ]
  },
  {
    id: "security",
    label: "Access",
    audience: "config",
    types: [
      { name: "PermissionSet", label: "Permission sets" },
      { name: "PermissionSetGroup", label: "Permission set groups" },
      { name: "CustomPermission", label: "Custom permissions" },
      { name: "Profile", label: "Profiles (large — prefer permission sets)" },
      { name: "SharingRules", label: "Sharing rules" },
      { name: "Role", label: "Roles" },
      { name: "Group", label: "Public groups" },
      { name: "Queue", label: "Queues" }
    ]
  },
  {
    id: "picklists",
    label: "Picklists",
    audience: "config",
    types: [
      { name: "GlobalValueSet", label: "Global value sets" },
      { name: "StandardValueSet", label: "Standard value sets" }
    ]
  },
  {
    id: "content",
    label: "Reports, email & files",
    audience: "config",
    types: [
      { name: "Report", label: "Reports" },
      { name: "ReportType", label: "Report types" },
      { name: "Dashboard", label: "Dashboards" },
      { name: "EmailTemplate", label: "Email templates" },
      { name: "Letterhead", label: "Letterheads" },
      { name: "Document", label: "Documents" },
      { name: "StaticResource", label: "Static resources" }
    ]
  },
  {
    id: "integrations",
    label: "Integrations",
    audience: "config",
    types: [
      { name: "NamedCredential", label: "Named credentials" },
      { name: "RemoteSiteSetting", label: "Remote site settings" },
      { name: "ConnectedApp", label: "Connected apps" },
      { name: "CustomNotificationType", label: "Custom notification types" }
    ]
  },
  {
    id: "code",
    label: "Code (developers)",
    audience: "code",
    types: [
      { name: "ApexClass", label: "Apex classes" },
      { name: "ApexTrigger", label: "Apex triggers" },
      { name: "LightningComponentBundle", label: "Lightning web components" },
      { name: "AuraDefinitionBundle", label: "Aura components" },
      { name: "ApexPage", label: "Visualforce pages" },
      { name: "ApexComponent", label: "Visualforce components" },
      { name: "LightningMessageChannel", label: "Lightning message channels" }
    ]
  }
];

export const FOLDER_TYPES = {
  EmailTemplate: "EmailFolder",
  Document: "DocumentFolder",
  Report: "ReportFolder",
  Dashboard: "DashboardFolder"
};

export const MEMBER_HINTS = {
  CustomField: "Account.Customer_Status__c",
  ValidationRule: "Account.Require_Industry",
  RecordType: "Account.Customer",
  FieldSet: "Account.Search_Fields",
  Layout: "Account-Account Layout",
  ListView: "Account.AllAccounts",
  CompactLayout: "Account.Compact_Layout",
  BusinessProcess: "Lead.Sales_Process",
  Flow: "My_Screen_Flow",
  FlexiPage: "Account_Record_Page",
  PermissionSet: "Configurator_Access",
  CustomObject: "My_Thing__c",
  CustomMetadata: "My_Type.My_Record",
  QuickAction: "Account.New_Task",
  SharingRules: "Account",
  Report: "FolderName/Report_API_Name",
  EmailTemplate: "FolderName/Template_API_Name",
  ApexClass: "MyClass"
};

export const METADATA_CATALOG = CATALOG_GROUPS.flatMap((group) =>
  group.types.map((t) => ({ ...t, group: group.id, audience: group.audience, groupLabel: group.label }))
);

export function uniqueCatalog(audience = "all") {
  const seen = new Set();
  return METADATA_CATALOG.filter((item) => {
    if (audience === "config" && item.audience === "code") return false;
    if (audience === "code" && item.audience !== "code") return false;
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

export function catalogGroups(audience = "all") {
  return CATALOG_GROUPS.filter((group) => {
    if (audience === "all") return true;
    return group.audience === audience;
  }).map((group) => ({
    ...group,
    types: group.types.filter((t, idx, arr) => arr.findIndex((x) => x.name === t.name) === idx)
  }));
}

export function memberHint(typeName) {
  return MEMBER_HINTS[typeName] || "API_Name";
}
