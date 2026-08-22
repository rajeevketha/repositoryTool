import { emptyVersionStore, parseVersionStore } from "./versions.js";

const DB_NAME = "orgflow-local";
const DB_VERSION = 1;
const META = "meta";
const FILES = "files";

const memory = {
  versions: emptyVersionStore(),
  files: {}
};

function idbAvailable() {
  return typeof indexedDB !== "undefined";
}

function requestValue(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

function waitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open local version database"));
  });
}

export async function loadLocalVersionStore() {
  if (!idbAvailable()) return parseVersionStore(memory.versions);
  const db = await openDb();
  try {
    const tx = db.transaction(META, "readonly");
    const raw = await requestValue(tx.objectStore(META).get("versions"));
    return parseVersionStore(raw);
  } finally {
    db.close();
  }
}

export async function saveLocalVersionStore(store) {
  const next = parseVersionStore(store);
  if (!idbAvailable()) {
    memory.versions = next;
    return next;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(META, "readwrite");
    tx.objectStore(META).put(next, "versions");
    await waitTx(tx);
    return next;
  } finally {
    db.close();
  }
}

export async function saveLocalRelease(versionId, files) {
  const payload = Array.isArray(files) ? files : [];
  if (!idbAvailable()) {
    memory.files[versionId] = payload;
    return payload;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, "readwrite");
    tx.objectStore(FILES).put(payload, versionId);
    await waitTx(tx);
    return payload;
  } finally {
    db.close();
  }
}

export async function loadLocalRelease(versionId) {
  if (!idbAvailable()) return memory.files[versionId] || [];
  const db = await openDb();
  try {
    const tx = db.transaction(FILES, "readonly");
    const files = await requestValue(tx.objectStore(FILES).get(versionId));
    return Array.isArray(files) ? files : [];
  } finally {
    db.close();
  }
}

export function resetLocalVersionMemory() {
  memory.versions = emptyVersionStore();
  memory.files = {};
}
