import {
  soapEnvelope,
  retrieveBody,
  checkRetrieveBody,
  deployBody,
  checkDeployBody,
  parseAsyncId,
  parseRetrieveResult,
  parseDeployResult,
  soapFault
} from "./packageXml.js";
import { API_VERSION } from "./salesforce.js";

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

export async function retrieveMetadata({ instanceUrl, sid, typeNames, apiVersion = API_VERSION, onProgress, timeoutMs = 10 * 60 * 1000 }) {
  onProgress?.("Submitting retrieve request…");
  const startXml = await soapCall(instanceUrl, sid, "retrieve", retrieveBody(typeNames, apiVersion), apiVersion);
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
