import { memberObjectKey, isStandardObject } from "./metadataTypes.js";

export const PREFLIGHT_SKIP_TYPES = new Set([
  "Report",
  "Dashboard",
  "EmailTemplate",
  "Document",
  "ReportFolder",
  "DashboardFolder",
  "EmailFolder",
  "DocumentFolder"
]);

export const PREFLIGHT_MEMBER_CAP = 60;

function nameKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function namedMembersForType(type) {
  return [...new Set((type?.members || []).map((m) => String(m || "").trim()).filter((m) => m && m !== "*"))];
}

export function packageHasNamedMember(packageTypes, typeName, member) {
  const type = (packageTypes || []).find((row) => row.name === typeName);
  const key = nameKey(member);
  return namedMembersForType(type).some((name) => nameKey(name) === key);
}

export function wildcardTypeNames(packageTypes = []) {
  return (packageTypes || [])
    .filter((type) => (type.members || []).includes("*"))
    .map((type) => type.name);
}

export function namedPackageMembers(packageTypes = []) {
  const rows = [];
  for (const type of packageTypes || []) {
    if (!type?.name || PREFLIGHT_SKIP_TYPES.has(type.name)) continue;
    for (const member of namedMembersForType(type)) {
      rows.push({ type: type.name, member });
    }
  }
  return rows;
}

export function typesToPreflight(packageTypes = []) {
  const out = [];
  const seen = new Set();
  for (const type of packageTypes || []) {
    if (!type?.name || PREFLIGHT_SKIP_TYPES.has(type.name) || seen.has(type.name)) continue;
    const members = namedMembersForType(type);
    if (!members.length) continue;
    seen.add(type.name);
    out.push({ name: type.name, members });
  }
  const fields = out.find((type) => type.name === "CustomField");
  if (fields) {
    const parents = [...new Set(
      fields.members
        .map((member) => memberObjectKey("CustomField", member))
        .filter((objectName) => objectName && !isStandardObject(objectName))
    )];
    if (parents.length && !seen.has("CustomObject")) {
      out.push({ name: "CustomObject", members: parents });
    }
  }
  return out;
}

export function existingNameSet(names = []) {
  return new Set((names || []).map(nameKey).filter(Boolean));
}

export function hasExistingName(set, member) {
  return Boolean(set && set.has(nameKey(member)));
}

export function preflightSummary({ already = 0, fresh = 0, missingParent = 0, production = false, hasTests = false, checked = 0 } = {}) {
  const parts = [];
  if (checked) parts.push(`${checked} checked`);
  if (fresh) parts.push(`${fresh} new`);
  if (already) parts.push(`${already} already in To`);
  if (missingParent) parts.push(`${missingParent} missing object`);
  if (production && !hasTests) parts.push("production · no tests");
  return parts.join(" · ") || "Nothing to check";
}

export function buildPreflightReport({
  packageTypes = [],
  existingByType = {},
  listedTypes = [],
  production = false,
  hasTests = false
} = {}) {
  const items = [];
  const listed = new Set(listedTypes);
  let already = 0;
  let fresh = 0;
  let missingParent = 0;
  let checked = 0;

  if (production && !hasTests) {
    items.push({
      kind: "warn",
      kicker: "Production",
      text: "To is production and no Apex tests are selected. Salesforce may require tests on this org."
    });
  }

  for (const name of wildcardTypeNames(packageTypes)) {
    items.push({
      kind: "info",
      kicker: "Wildcard",
      text: `${name} is a wildcard (*). OrgFlow cannot check individual members in the To org.`
    });
  }

  const named = namedPackageMembers(packageTypes);
  const slice = named.slice(0, PREFLIGHT_MEMBER_CAP);
  if (named.length > PREFLIGHT_MEMBER_CAP) {
    items.push({
      kind: "info",
      kicker: `First ${PREFLIGHT_MEMBER_CAP}`,
      text: `This package has ${named.length} named members. OrgFlow checked the first ${PREFLIGHT_MEMBER_CAP}.`
    });
  }

  for (const { type, member } of slice) {
    if (type === "CustomField") {
      const objectName = memberObjectKey("CustomField", member);
      if (objectName && !isStandardObject(objectName)) {
        const inPackage = packageHasNamedMember(packageTypes, "CustomObject", objectName);
        const objects = existingByType.CustomObject;
        if (!inPackage && listed.has("CustomObject") && !hasExistingName(objects, objectName)) {
          missingParent += 1;
          items.push({
            kind: "warn",
            kicker: "Missing object in To",
            text: `${member} needs custom object ${objectName} in the To org. Add that object to this package, or create it in To first.`
          });
        }
      }
    }
    if (!listed.has(type)) continue;
    checked += 1;
    if (hasExistingName(existingByType[type], member)) {
      already += 1;
      items.push({
        kind: "info",
        kicker: "Already in To",
        text: `${type} ${member} already exists. This deploy will overwrite it.`
      });
    } else {
      fresh += 1;
      items.push({
        kind: "ok",
        kicker: "New in To",
        text: `${type} ${member} is not in the To org yet.`
      });
    }
  }

  return {
    items,
    already,
    fresh,
    missingParent,
    checked,
    summary: preflightSummary({ already, fresh, missingParent, production, hasTests, checked })
  };
}
