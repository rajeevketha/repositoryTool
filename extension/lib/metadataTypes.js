export const METADATA_CATALOG = [
  { name: "ApexClass", label: "Apex classes" },
  { name: "ApexTrigger", label: "Apex triggers" },
  { name: "ApexPage", label: "Visualforce pages" },
  { name: "ApexComponent", label: "Visualforce components" },
  { name: "LightningComponentBundle", label: "Lightning web components" },
  { name: "AuraDefinitionBundle", label: "Aura components" },
  { name: "LightningMessageChannel", label: "Lightning message channels" },
  { name: "CustomObject", label: "Custom objects (includes fields, record types)" },
  { name: "CustomMetadata", label: "Custom metadata types" },
  { name: "CustomLabel", label: "Custom labels" },
  { name: "CustomTab", label: "Custom tabs" },
  { name: "CustomApplication", label: "Apps" },
  { name: "Flow", label: "Flows" },
  { name: "FlowDefinition", label: "Flow definitions" },
  { name: "FlexiPage", label: "Lightning pages" },
  { name: "Layout", label: "Page layouts" },
  { name: "CompactLayout", label: "Compact layouts" },
  { name: "ListView", label: "List views" },
  { name: "PermissionSet", label: "Permission sets" },
  { name: "PermissionSetGroup", label: "Permission set groups" },
  { name: "Profile", label: "Profiles (large)" },
  { name: "CustomPermission", label: "Custom permissions" },
  { name: "StaticResource", label: "Static resources" },
  { name: "QuickAction", label: "Quick actions" },
  { name: "ValidationRule", label: "Validation rules" },
  { name: "Workflow", label: "Workflow rules" },
  { name: "AssignmentRules", label: "Assignment rules" },
  { name: "AutoResponseRules", label: "Auto-response rules" },
  { name: "EscalationRules", label: "Escalation rules" },
  { name: "DuplicateRule", label: "Duplicate rules" },
  { name: "MatchingRule", label: "Matching rules" },
  { name: "GlobalValueSet", label: "Global value sets" },
  { name: "StandardValueSet", label: "Standard value sets" },
  { name: "RemoteSiteSetting", label: "Remote site settings" },
  { name: "NamedCredential", label: "Named credentials" },
  { name: "ConnectedApp", label: "Connected apps" },
  { name: "PathAssistant", label: "Path assistants" }
];

export function uniqueCatalog() {
  const seen = new Set();
  return METADATA_CATALOG.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
