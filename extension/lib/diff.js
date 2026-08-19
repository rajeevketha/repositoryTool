import { decodeUtf8Base64, isEditablePath } from "./files.js";

const MAX_LCS_CELLS = 3_000_000;
const DEFAULT_CONTEXT = 3;

export function splitLines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").split("\n");
}

export function fileText(file) {
  if (!file) return null;
  if (!isEditablePath(file.path)) return null;
  try {
    return decodeUtf8Base64(file.base64);
  } catch {
    return null;
  }
}

export function compareFileSets(leftFiles, rightFiles) {
  const left = new Map((leftFiles || []).map((f) => [f.path, f]));
  const right = new Map((rightFiles || []).map((f) => [f.path, f]));
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  return paths.map((path) => {
    const l = left.get(path) || null;
    const r = right.get(path) || null;
    let status = "same";
    if (!l && r) status = "onlyRight";
    else if (l && !r) status = "onlyLeft";
    else if (l.base64 !== r.base64) status = "changed";
    return { path, status, left: l, right: r };
  });
}

export function revertSelectedInto(currentFiles, fromFiles, selectedPaths) {
  const byPath = new Map((currentFiles || []).map((f) => [f.path, { ...f }]));
  const fromBy = new Map((fromFiles || []).map((f) => [f.path, f]));
  for (const path of selectedPaths || []) {
    const src = fromBy.get(path);
    if (!src) continue;
    byPath.set(path, { path: src.path, base64: src.base64, edited: true });
  }
  return [...byPath.values()];
}

export function diffRows(leftText, rightText) {
  const a = splitLines(leftText);
  const b = splitLines(rightText);
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [
      { kind: "meta", text: `Files differ (${a.length} vs ${b.length} lines). Too large for a line-by-line diff.` }
    ];
  }
  const tokens = diffTokens(a, b);
  return tokensToRows(tokens, DEFAULT_CONTEXT);
}

export function unifiedDiff(leftText, rightText, { leftLabel = "left", rightLabel = "right" } = {}) {
  const rows = diffRows(leftText, rightText);
  if (!rows.length) return "";
  const lines = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
  for (const row of rows) {
    if (row.kind === "hunk") lines.push(row.text);
    else if (row.kind === "eq") lines.push(` ${row.text}`);
    else if (row.kind === "del") lines.push(`-${row.text}`);
    else if (row.kind === "add") lines.push(`+${row.text}`);
    else if (row.kind === "meta") lines.push(row.text);
  }
  return `${lines.join("\n")}\n`;
}

function diffTokens(a, b) {
  const n = a.length;
  const m = b.length;
  const stride = m + 1;
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * stride + j] = a[i] === b[j]
        ? dp[(i + 1) * stride + (j + 1)] + 1
        : Math.max(dp[(i + 1) * stride + j], dp[i * stride + (j + 1)]);
    }
  }
  const tokens = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ kind: "eq", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
      tokens.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      tokens.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) tokens.push({ kind: "del", text: a[i++] });
  while (j < m) tokens.push({ kind: "add", text: b[j++] });
  return tokens;
}

function tokensToRows(tokens, context) {
  const changed = tokens.map((t) => t.kind !== "eq");
  if (!changed.some(Boolean)) return [];
  const keep = new Array(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i++) {
    if (!changed[i]) continue;
    const from = Math.max(0, i - context);
    const to = Math.min(tokens.length - 1, i + context);
    for (let k = from; k <= to; k++) keep[k] = true;
  }
  const rows = [];
  let i = 0;
  let oldLine = 1;
  let newLine = 1;
  while (i < tokens.length) {
    if (!keep[i]) {
      if (tokens[i].kind === "eq") {
        oldLine += 1;
        newLine += 1;
      } else if (tokens[i].kind === "del") oldLine += 1;
      else newLine += 1;
      i += 1;
      continue;
    }
    let j = i;
    while (j < tokens.length && keep[j]) j += 1;
    let oldCount = 0;
    let newCount = 0;
    for (let k = i; k < j; k++) {
      if (tokens[k].kind !== "add") oldCount += 1;
      if (tokens[k].kind !== "del") newCount += 1;
    }
    rows.push({ kind: "hunk", text: `@@ -${oldLine},${oldCount} +${newLine},${newCount} @@` });
    for (let k = i; k < j; k++) {
      rows.push({ kind: tokens[k].kind, text: tokens[k].text });
      if (tokens[k].kind !== "add") oldLine += 1;
      if (tokens[k].kind !== "del") newLine += 1;
    }
    i = j;
  }
  return rows;
}
