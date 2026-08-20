import { FRIENDLY_LABELS } from "./metadataTypes.js";
import { memberGroupKey } from "./packageView.js";

/** Small types to scan for “changed recently”. Keep this short so Package stays light. */
export const RECENT_HINT_TYPES = [
  "Flow",
  "ValidationRule",
  "RecordType",
  "Layout",
  "FlexiPage",
  "CustomField"
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
  limit = 6
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
