/**
 * Salesforce REST `GET {instance}/services/data/` lists every version the
 * org supports. OrgFlow uses that after Detect so later seasons (68, 69, …)
 * appear without shipping a new picker list.
 *
 * METADATA_API_VERSIONS is only the offline fallback (before Detect, or if
 * the version list request fails).
 */
export const DEFAULT_API_VERSION = "67.0";

/** Wide band so a future 68/69/70 saved in storage is not clamped to 67. */
const MIN_API_MAJOR = 40;
const MAX_API_MAJOR = 120;

export const METADATA_API_VERSIONS = [
  { version: "67.0", season: "Summer '26" },
  { version: "66.0", season: "Spring '26" },
  { version: "65.0", season: "Winter '26" },
  { version: "64.0", season: "Summer '25" },
  { version: "63.0", season: "Spring '25" },
  { version: "62.0", season: "Winter '25" },
  { version: "61.0", season: "Summer '24" },
  { version: "60.0", season: "Spring '24" },
  { version: "59.0", season: "Winter '24" },
  { version: "58.0", season: "Summer '23" }
];

export function parseApiVersionToken(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2,3})(?:\.0)?$/);
  if (!match) return "";
  const major = Number(match[1]);
  if (!Number.isFinite(major) || major < MIN_API_MAJOR || major > MAX_API_MAJOR) return "";
  return `${major}.0`;
}

export function normalizeApiVersion(raw) {
  return parseApiVersionToken(raw) || DEFAULT_API_VERSION;
}

function seasonFromRow(row) {
  const season = String((row && row.season) || "").trim();
  if (season) return season.replace(/^\d{2,3}\.0\s*[·-]\s*/, "");
  const label = String((row && row.label) || "").trim();
  if (!label) return "";
  return label.replace(/^\d{2,3}\.0\s*[·-]\s*/, "").replace(/^\d{2,3}\.0\s*\(/, "").replace(/\)$/, "");
}

export function parseOrgApiVersions(payload) {
  if (!Array.isArray(payload)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of payload) {
    const version = parseApiVersionToken(item && item.version);
    if (!version || seen.has(version)) continue;
    seen.add(version);
    rows.push({ version, season: String((item && item.label) || "").trim() });
  }
  rows.sort((a, b) => Number(b.version) - Number(a.version));
  return rows;
}

export function mergeApiVersionRows(...lists) {
  const byVersion = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      const version = parseApiVersionToken(row && row.version);
      if (!version) continue;
      const season = seasonFromRow(row);
      const existing = byVersion.get(version);
      if (!existing) {
        byVersion.set(version, { version, season });
        continue;
      }
      if (season) existing.season = season;
    }
  }
  return [...byVersion.values()].sort((a, b) => Number(b.version) - Number(a.version));
}

export function newestApiVersion(rows) {
  const list = rows && rows.length ? rows : METADATA_API_VERSIONS;
  return list[0] ? list[0].version : DEFAULT_API_VERSION;
}

export function apiVersionLabel(version, rows = METADATA_API_VERSIONS) {
  const normalized = parseApiVersionToken(version) || normalizeApiVersion(version);
  const row = (rows || []).find((item) => item.version === normalized);
  if (row?.season) return `${row.version} · ${row.season}`;
  return normalized;
}
