import { normalizePackageTypes } from "./packageXml.js";

const OBJECT_SCOPED_TYPES = new Set([
  "CustomField",
  "RecordType",
  "ValidationRule",
  "ListView",
  "WebLink",
  "BusinessProcess",
  "CompactLayout",
  "FieldSet",
  "Index",
  "SharingReason",
  "SharingRecalculation"
]);

export function isTestClassName(name) {
  const value = String(name || "").trim();
  if (!value || value === "*") return false;
  return /(Test|Tests|_Test|TestClass)$/i.test(value);
}

export function suggestedTestName(className) {
  const value = String(className || "").trim();
  if (!value || isTestClassName(value)) return "";
  if (/Handler$/i.test(value)) return `${value}Test`;
  if (/Controller$/i.test(value)) return `${value}Test`;
  if (/Service$/i.test(value)) return `${value}Test`;
  return `${value}Test`;
}

export function apexClassMembers(types) {
  const apex = normalizePackageTypes(types).find((t) => t.name === "ApexClass");
  if (!apex) return [];
  if (apex.members.includes("*")) return ["*"];
  return [...apex.members];
}

export function packageHasApex(types) {
  return normalizePackageTypes(types).some((t) => t.name === "ApexClass" || t.name === "ApexTrigger");
}

export function suggestedTestClasses(types) {
  const members = apexClassMembers(types);
  if (members.includes("*")) {
    return { inPackage: [], suggested: [], wildcard: true };
  }
  const inPackage = members.filter(isTestClassName);
  const suggested = members
    .filter((name) => !isTestClassName(name))
    .map(suggestedTestName)
    .filter((name) => name && !inPackage.includes(name) && !members.includes(name));
  return { inPackage, suggested: [...new Set(suggested)], wildcard: false };
}

export function memberGroupKey(typeName, member) {
  const name = String(member || "");
  if (name === "*") return "All";
  if (OBJECT_SCOPED_TYPES.has(typeName) && name.includes(".")) return name.split(".")[0];
  if (typeName === "Layout" && name.includes("-")) return name.split("-")[0];
  if (typeName === "QuickAction" && name.includes(".")) return name.split(".")[0];
  return "";
}

export function categoryColumns(types) {
  return normalizePackageTypes(types).map((entry) => {
    const groups = new Map();
    for (const member of entry.members) {
      const key = memberGroupKey(entry.name, member) || entry.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(member);
    }
    const grouped = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, members]) => ({
        label,
        members,
        count: members.includes("*") ? "*" : members.length
      }));
    return {
      type: entry.name,
      members: entry.members,
      count: entry.members.includes("*") ? "*" : entry.members.length,
      groups: grouped
    };
  });
}

export function filterCategoryColumns(columns, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return columns;
  return columns
    .map((col) => {
      const typeHit = col.type.toLowerCase().includes(q);
      const groups = col.groups
        .map((group) => {
          const groupHit = group.label.toLowerCase().includes(q);
          const members = typeHit || groupHit
            ? group.members
            : group.members.filter((m) => m.toLowerCase().includes(q));
          return members.length ? { ...group, members, count: members.includes("*") ? "*" : members.length } : null;
        })
        .filter(Boolean);
      return groups.length ? { ...col, groups, count: groups.reduce((n, g) => n + (g.count === "*" ? 1 : g.count), 0) } : null;
    })
    .filter(Boolean);
}

export function normalizeTestNames(names) {
  return [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
