export const DEFAULT_API_VERSION = "67.0";

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

const ALLOWED = new Set(METADATA_API_VERSIONS.map((row) => row.version));

export function normalizeApiVersion(raw) {
  const value = String(raw || "").trim();
  const match = value.match(/^(\d{2,3})(?:\.0)?$/);
  const version = match ? `${Number(match[1])}.0` : "";
  if (ALLOWED.has(version)) return version;
  return DEFAULT_API_VERSION;
}

export function apiVersionLabel(version) {
  const row = METADATA_API_VERSIONS.find((item) => item.version === version);
  return row ? `${row.version} · ${row.season}` : version;
}
