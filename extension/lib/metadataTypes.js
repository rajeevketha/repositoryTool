import { ALL_METADATA_TYPES } from "./allMetadataTypes.js";

export const COMMON_CONFIG_TYPES = [
  "CustomField",
  "CustomObject",
  "RecordType",
  "ValidationRule",
  "Layout",
  "FlexiPage",
  "Flow",
  "PermissionSet",
  "PermissionSetGroup",
  "CustomApplication",
  "CustomTab",
  "QuickAction",
  "ListView",
  "CompactLayout",
  "GlobalValueSet",
  "StandardValueSet",
  "CustomLabel",
  "CustomMetadata",
  "PathAssistant",
  "ApprovalProcess",
  "AssignmentRules",
  "DuplicateRule",
  "MatchingRules",
  "Report",
  "Dashboard",
  "EmailTemplate",
  "Profile",
  "SharingRules",
  "Role",
  "Group",
  "Queue",
  "NamedCredential",
  "RemoteSiteSetting",
  "ApexClass",
  "ApexTrigger",
  "LightningComponentBundle"
];

export const FRIENDLY_LABELS = {
  CustomField: "Fields",
  CustomObject: "Objects",
  RecordType: "Record types",
  ValidationRule: "Validation rules",
  FieldSet: "Field sets",
  BusinessProcess: "Business processes",
  CompactLayout: "Compact layouts",
  ListView: "List views",
  WebLink: "Buttons and links",
  Layout: "Page layouts",
  FlexiPage: "Lightning pages",
  CustomApplication: "Apps",
  CustomTab: "Tabs",
  QuickAction: "Quick actions",
  PathAssistant: "Path assistants",
  CustomLabel: "Custom labels",
  CustomLabels: "Custom labels (bundle)",
  Flow: "Flows",
  FlowDefinition: "Flow definitions",
  ApprovalProcess: "Approval processes",
  PermissionSet: "Permission sets",
  PermissionSetGroup: "Permission set groups",
  Profile: "Profiles",
  CustomMetadata: "Custom metadata",
  GlobalValueSet: "Global value sets",
  StandardValueSet: "Standard value sets",
  Report: "Reports",
  Dashboard: "Dashboards",
  EmailTemplate: "Email templates",
  LightningComponentBundle: "Lightning web components",
  ApexClass: "Apex classes",
  ApexTrigger: "Apex triggers",
  SharingRules: "Sharing rules",
  NamedCredential: "Named credentials"
};

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

export function humanizeTypeName(name) {
  if (FRIENDLY_LABELS[name]) return FRIENDLY_LABELS[name];
  return String(name || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function folderTypeFor(typeName, inFolder = false) {
  if (FOLDER_TYPES[typeName]) return FOLDER_TYPES[typeName];
  if (!inFolder) return null;
  if (typeName === "EmailTemplate") return "EmailFolder";
  return `${typeName}Folder`;
}

export function typeRecord(name, extras = {}) {
  return {
    name,
    label: humanizeTypeName(name),
    common: COMMON_CONFIG_TYPES.includes(name),
    ...extras
  };
}

export function fallbackTypeRecords() {
  return ALL_METADATA_TYPES.map((name) =>
    typeRecord(name, { inFolder: Boolean(FOLDER_TYPES[name]), folderType: FOLDER_TYPES[name] || null })
  );
}

export function mergeDescribedTypes(described = []) {
  const byName = new Map(fallbackTypeRecords().map((t) => [t.name, t]));
  for (const item of described) {
    const name = item.xmlName || item.name;
    if (!name) continue;
    const folderType = folderTypeFor(name, item.inFolder);
    byName.set(name, typeRecord(name, { inFolder: Boolean(item.inFolder), folderType, fromOrg: true }));
    for (const child of item.children || []) {
      const current = byName.get(child) || typeRecord(child);
      byName.set(child, { ...current, childOf: name, fromOrg: true });
    }
  }
  return [...byName.values()].sort((a, b) => {
    const ac = COMMON_CONFIG_TYPES.indexOf(a.name);
    const bc = COMMON_CONFIG_TYPES.indexOf(b.name);
    if (ac !== -1 || bc !== -1) {
      if (ac === -1) return 1;
      if (bc === -1) return -1;
      return ac - bc;
    }
    return a.label.localeCompare(b.label);
  });
}

export function searchTypes(types, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return types;
  return types.filter((t) => t.name.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
}

export function catalogGroupsFromTypes(types, query = "") {
  const filtered = searchTypes(types, query);
  const byName = new Map(filtered.map((t) => [t.name, t]));
  const common = COMMON_CONFIG_TYPES.map((name) => byName.get(name)).filter(Boolean);
  const commonSet = new Set(COMMON_CONFIG_TYPES);
  const rest = filtered.filter((t) => !commonSet.has(t.name));
  const groups = [];
  if (common.length) groups.push({ id: "common", label: "Common for configurators", types: common });
  if (rest.length) groups.push({ id: "all", label: query ? "Matching types" : "All metadata types", types: rest });
  return groups;
}

/** @deprecated kept for tests / compatibility */
export function uniqueCatalog(audience = "all") {
  const types = fallbackTypeRecords();
  if (audience === "config") return types.filter((t) => COMMON_CONFIG_TYPES.includes(t.name) && !["ApexClass", "ApexTrigger", "LightningComponentBundle"].includes(t.name));
  if (audience === "code") {
    const code = ["ApexClass", "ApexTrigger", "LightningComponentBundle", "AuraDefinitionBundle", "ApexPage", "ApexComponent"];
    return types.filter((t) => code.includes(t.name));
  }
  return types;
}

export function catalogGroups(audience = "all") {
  return catalogGroupsFromTypes(uniqueCatalog(audience === "all" ? "all" : audience));
}

export function memberHint(typeName) {
  return MEMBER_HINTS[typeName] || "API_Name";
}

export { ALL_METADATA_TYPES };
