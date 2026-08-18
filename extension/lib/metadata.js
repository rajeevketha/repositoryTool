import {
  soapEnvelope,
  retrieveBodyFromTypes,
  checkRetrieveBody,
  deployBody,
  checkDeployBody,
  parseAsyncId,
  parseRetrieveResult,
  parseDeployResult,
  soapFault,
  listMetadataBody,
  parseListMetadata,
  normalizePackageTypes
} from "./packageXml.js";
import { API_VERSION } from "./salesforce.js";
import { FOLDER_TYPES } from "./metadataTypes.js";

function metadataUrl(instanceUrl, apiVersion = API_VERSION) {
  return `${instanceUrl.replace(/\/$/, "")}/services/Soap/m/${apiVersion}`;
}

async function soapCall(instanceUrl, sessionId, soapAction, bodyXml, apiVersion = API_VERSION) {
  const envelope = soapEnvelope(sessionId, bodyXml);
  const res = await fetch(metadataUrl(instanceUrl, apiVersion), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: soapAction
    },
    body: envelope
  });
  const xml = await res.text();
  if (!res.ok) {
    throw new Error(soapFault(xml) || `Metadata API ${res.status}`);
  }
  return xml;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function retrieveMetadata({ instanceUrl, sid, typeNames, packageTypes, apiVersion = API_VERSION, onProgress, timeoutMs = 10 * 60 * 1000 }) {
  const types = packageTypes?.length
    ? normalizePackageTypes(packageTypes)
    : (typeNames || []).map((name) => ({ name, members: ["*"] }));
  if (!types.length) throw new Error("Select at least one component or add entries to package.xml.");
  onProgress?.("Submitting retrieve request…");
  const startXml = await soapCall(instanceUrl, sid, "retrieve", retrieveBodyFromTypes(types, apiVersion), apiVersion);
  const fault = soapFault(startXml);
  const asyncId = parseAsyncId(startXml);
  if (!asyncId) throw new Error(fault || "Retrieve did not return an async id");
  onProgress?.(`Retrieve queued (${asyncId.slice(0, 8)}…)`);

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(2000);
    const xml = await soapCall(instanceUrl, sid, "checkRetrieveStatus", checkRetrieveBody(asyncId, true), apiVersion);
    const result = parseRetrieveResult(xml);
    onProgress?.(`Retrieve ${result.status || "running"}…`);
    if (!result.done) continue;
    if (!result.success || !result.zipFile) {
      throw new Error(result.errorMessage || result.messages.join("; ") || "Retrieve failed");
    }
    return result.zipFile;
  }
  throw new Error("Retrieve timed out");
}

export async function deployMetadata({ instanceUrl, sid, zipBase64, options = {}, apiVersion = API_VERSION, onProgress, timeoutMs = 15 * 60 * 1000 }) {
  onProgress?.("Submitting deploy request…");
  const startXml = await soapCall(instanceUrl, sid, "deploy", deployBody(zipBase64, options), apiVersion);
  const asyncId = parseAsyncId(startXml);
  if (!asyncId) throw new Error(soapFault(startXml) || "Deploy did not return an async id");
  onProgress?.(`Deploy queued (${asyncId.slice(0, 8)}…)`);

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(2500);
    const xml = await soapCall(instanceUrl, sid, "checkDeployStatus", checkDeployBody(asyncId), apiVersion);
    const result = parseDeployResult(xml);
    onProgress?.(`Deploy ${result.status || "running"}…`);
    if (!result.done) continue;
    if (!result.success) {
      const parts = [
        result.errorMessage,
        ...result.failures.slice(0, 8).map((f) => [f.componentType, f.fullName, f.problem].filter(Boolean).join(" "))
      ].filter(Boolean);
      throw new Error(parts.join("\n") || "Deploy failed");
    }
    return result;
  }
  throw new Error("Deploy timed out");
}

async function listMetadataQueries({ instanceUrl, sid, queries, apiVersion }) {
  const xml = await soapCall(instanceUrl, sid, "listMetadata", listMetadataBody(queries, apiVersion), apiVersion);
  const fault = soapFault(xml);
  if (fault && !xml.includes("<result")) throw new Error(fault);
  return parseListMetadata(xml);
}

export async function listMetadataType({ instanceUrl, sid, typeName, apiVersion = API_VERSION, onProgress }) {
  const folderType = FOLDER_TYPES[typeName];
  if (folderType) {
    onProgress?.(`Listing ${folderType} folders…`);
    const folders = await listMetadataQueries({
      instanceUrl,
      sid,
      apiVersion,
      queries: [{ type: folderType }]
    });
    const names = folders.map((f) => f.fullName).filter(Boolean);
    if (!names.length) return [];
    const members = [];
    for (const group of chunk(names, 3)) {
      onProgress?.(`Listing ${typeName} in ${group.length} folder(s)…`);
      const part = await listMetadataQueries({
        instanceUrl,
        sid,
        apiVersion,
        queries: group.map((folder) => ({ type: typeName, folder }))
      });
      members.push(...part);
    }
    return members.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
  onProgress?.(`Listing ${typeName}…`);
  return listMetadataQueries({
    instanceUrl,
    sid,
    apiVersion,
    queries: [{ type: typeName }]
  });
}

export async function unzipToFiles(zipBase64) {
  const Zip = globalThis.JSZip;
  if (!Zip) throw new Error("JSZip failed to load");
  const zip = await Zip.loadAsync(zipBase64, { base64: true });
  const files = [];
  const entries = Object.keys(zip.files);
  for (const name of entries) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const normalized = name.replace(/^\/+/, "").replace(/^unpackaged\//, "");
    if (!normalized || normalized.endsWith("/")) continue;
    const base64 = await entry.async("base64");
    files.push({ path: normalized, base64 });
  }
  return files;
}

export async function zipFromFiles(files) {
  const Zip = globalThis.JSZip;
  if (!Zip) throw new Error("JSZip failed to load");
  const zip = new Zip();
  for (const file of files) {
    const path = file.path.replace(/^\/+/, "").replace(/^unpackaged\//, "");
    zip.file(path, file.base64, { base64: true });
  }
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
