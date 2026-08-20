import { FRIENDLY_LABELS } from "./metadataTypes.js";
import { memberGroupKey } from "./packageView.js";

/** Small types to scan for “what’s new”. Keep this short so Package stays light. */
export const RECENT_HINT_TYPES = [
  "Flow",
  "ValidationRule",
  "RecordType",
  "Layout",
  "FlexiPage",
  "CustomField",
  "PermissionSet"
];

/** Same-object types we may one-tap add. Order is the offer priority. */
export const COMPANION_TYPES = [
  { type: "Layout", label: "layouts", singular: "layout" },
  { type: "RecordType", label: "record types", singular: "record type" },
  { type: "ValidationRule", label: "rules", singular: "rule" },
  { type: "FlexiPage", label: "Lightning pages", singular: "Lightning page" }
];

export const RELATED_OBJECT_TYPES = [
  { type: "CustomField", label: "Fields" },
  { type: "Layout", label: "Layouts" },
  { type: "RecordType", label: "Record types" },
  { type: "ValidationRule", label: "Rules" },
  { type: "FlexiPage", label: "Lightning pages" }
];

export function shortTypeLabel(typeName) {
  return FRIENDLY_LABELS[typeName] || String(typeName || "");
}

export function objectsFromPackage(packageTypes = []) {
  const counts = new Map();
  for (const entry of packageTypes) {
    const typeName = entry?.name || "";
    for (const member of entry?.members || []) {
      if (!member || member === "*") continue;
      const object = typeName === "CustomObject"
        ? member
        : memberGroupKey(typeName, member);
      if (!object) continue;
      counts.set(object, (counts.get(object) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([object, count]) => ({ object, count }));
}

export function memberBelongsToObject(typeName, fullName, objectName) {
  const member = String(fullName || "");
  const object = String(objectName || "");
  if (!member || !object || member === "*") return false;
  if (typeName === "CustomObject") return member === object;
  if (typeName === "Layout") return member.startsWith(`${object}-`);
  if (typeName === "FlexiPage") {
    const stem = object.replace(/__c$/i, "");
    const lower = member.toLowerCase();
    return lower.startsWith(`${object.toLowerCase()}_`)
      || (stem && stem !== object && lower.startsWith(`${stem.toLowerCase()}_`));
  }
  return member.startsWith(`${object}.`);
}

export function relatedTypeHints(packageTypes = [], activeType = "", limit = 4) {
  const primary = objectsFromPackage(packageTypes)[0];
  if (!primary) return { object: "", types: [] };
  const types = RELATED_OBJECT_TYPES
    .filter((row) => row.type !== activeType)
    .slice(0, limit);
  return { object: primary.object, types };
}

export function recentHintItems(membersByType = {}, {
  now = Date.now(),
  windowMs = 7 * 24 * 60 * 60 * 1000,
  limit = 8
} = {}) {
  const rows = [];
  for (const [type, items] of Object.entries(membersByType)) {
    for (const item of items || []) {
      const at = Date.parse(item.lastModifiedDate || "");
      if (!Number.isFinite(at) || now - at > windowMs) continue;
      rows.push({
        type,
        fullName: item.fullName,
        lastModifiedDate: item.lastModifiedDate,
        lastModifiedByName: item.lastModifiedByName || "",
        at
      });
    }
  }
  rows.sort((a, b) => b.at - a.at || a.fullName.localeCompare(b.fullName));
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = `${row.type}:${row.fullName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function packageHasMember(packageTypes = [], typeName, fullName) {
  const entry = (packageTypes || []).find((t) => t.name === typeName);
  if (!entry) return false;
  return (entry.members || []).includes("*") || (entry.members || []).includes(fullName);
}

export function packageHasType(packageTypes = [], typeName) {
  const entry = (packageTypes || []).find((t) => t.name === typeName);
  return Boolean(entry?.members?.length);
}

export function companionKey(objectName, typeName) {
  return `${objectName}:${typeName}`;
}

/**
 * One same-object offer at a time. Adds only when the matching list is small.
 * Types with too many matches become a browse chip instead of a dump.
 */
export function companionOffer(packageTypes = [], membersByType = {}, {
  activeType = "",
  dismissedKeys = [],
  maxPerType = 4,
  browseLimit = 2
} = {}) {
  const primary = objectsFromPackage(packageTypes)[0];
  if (!primary) {
    return { object: "", add: null, browse: [], permissionSets: false };
  }
  const object = primary.object;
  const dismissed = new Set(dismissedKeys);
  const addCandidates = [];
  const browse = [];

  for (const row of COMPANION_TYPES) {
    if (row.type === activeType) continue;
    const key = companionKey(object, row.type);
    if (dismissed.has(key) || dismissed.has(object)) continue;
    const items = (membersByType[row.type] || [])
      .filter((item) => memberBelongsToObject(row.type, item.fullName, object));
    const missing = items.filter((item) => !packageHasMember(packageTypes, row.type, item.fullName));
    if (!missing.length) continue;
    if (missing.length <= maxPerType) {
      const count = missing.length;
      addCandidates.push({
        type: row.type,
        object,
        key,
        members: missing.map((item) => item.fullName),
        count,
        title: count === 1
          ? `Add the ${row.singular} on ${object}`
          : `Add ${count} ${row.label} on ${object}`,
        detail: missing.map((item) => item.fullName).join(" · ")
      });
    } else {
      browse.push({
        type: row.type,
        label: row.label,
        object,
        count: missing.length
      });
    }
  }

  const add = addCandidates[0] || null;
  const browseTypes = browse
    .filter((row) => row.type !== add?.type)
    .slice(0, add ? Math.min(1, browseLimit) : browseLimit);

  return {
    object,
    add,
    browse: browseTypes,
    permissionSets: packageHasType(packageTypes, "CustomField") && activeType !== "PermissionSet"
  };
}
