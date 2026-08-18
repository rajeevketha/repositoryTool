export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildPackageXml(typeNames, apiVersion = "61.0") {
  const types = [...new Set((typeNames || []).filter(Boolean))].sort();
  const blocks = types
    .map(
      (name) => `    <types>
        <members>*</members>
        <name>${escapeXml(name)}</name>
    </types>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${blocks}
    <version>${escapeXml(apiVersion)}</version>
</Package>
`;
}

export function typesFromPackageXml(xml) {
  const names = [];
  const re = /<name>\s*([^<]+)\s*<\/name>/gi;
  let match;
  while ((match = re.exec(xml || ""))) {
    names.push(match[1].trim());
  }
  return names;
}

export function soapEnvelope(sessionId, bodyXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <env:Header>
    <urn:SessionHeader xmlns:urn="http://soap.sforce.com/2006/04/metadata">
      <urn:sessionId>${escapeXml(sessionId)}</urn:sessionId>
    </urn:SessionHeader>
  </env:Header>
  <env:Body>
${bodyXml}
  </env:Body>
</env:Envelope>`;
}

export function retrieveBody(typeNames, apiVersion) {
  const types = [...new Set((typeNames || []).filter(Boolean))];
  const typeXml = types
    .map(
      (name) => `        <urn:types>
          <urn:members>*</urn:members>
          <urn:name>${escapeXml(name)}</urn:name>
        </urn:types>`
    )
    .join("\n");
  return `    <urn:retrieve xmlns:urn="http://soap.sforce.com/2006/04/metadata">
      <urn:retrieveRequest>
        <urn:apiVersion>${escapeXml(apiVersion)}</urn:apiVersion>
        <urn:singlePackage>true</urn:singlePackage>
        <urn:unpackaged>
${typeXml}
          <urn:version>${escapeXml(apiVersion)}</urn:version>
        </urn:unpackaged>
      </urn:retrieveRequest>
    </urn:retrieve>`;
}

export function checkRetrieveBody(asyncId, includeZip) {
  return `    <urn:checkRetrieveStatus xmlns:urn="http://soap.sforce.com/2006/04/metadata">
      <urn:asyncProcessId>${escapeXml(asyncId)}</urn:asyncProcessId>
      <urn:includeZip>${includeZip ? "true" : "false"}</urn:includeZip>
    </urn:checkRetrieveStatus>`;
}

export function deployBody(zipBase64, options = {}) {
  const testLevel = options.testLevel || "NoTestRun";
  const checkOnly = options.checkOnly ? "true" : "false";
  const rollbackOnError = options.rollbackOnError === false ? "false" : "true";
  return `    <urn:deploy xmlns:urn="http://soap.sforce.com/2006/04/metadata">
      <urn:zipFile>${zipBase64}</urn:zipFile>
      <urn:deployOptions>
        <urn:allowMissingFiles>false</urn:allowMissingFiles>
        <urn:autoUpdatePackage>false</urn:autoUpdatePackage>
        <urn:checkOnly>${checkOnly}</urn:checkOnly>
        <urn:ignoreWarnings>false</urn:ignoreWarnings>
        <urn:performRetrieve>false</urn:performRetrieve>
        <urn:purgeOnDelete>false</urn:purgeOnDelete>
        <urn:rollbackOnError>${rollbackOnError}</urn:rollbackOnError>
        <urn:singlePackage>true</urn:singlePackage>
        <urn:testLevel>${escapeXml(testLevel)}</urn:testLevel>
      </urn:deployOptions>
    </urn:deploy>`;
}

export function checkDeployBody(asyncId) {
  return `    <urn:checkDeployStatus xmlns:urn="http://soap.sforce.com/2006/04/metadata">
      <urn:asyncProcessId>${escapeXml(asyncId)}</urn:asyncProcessId>
      <urn:includeDetails>true</urn:includeDetails>
    </urn:checkDeployStatus>`;
}

export function xmlText(xml, tag) {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i");
  const match = xml.match(re);
  return match ? decodeXml(match[1].trim()) : "";
}

export function xmlAll(xml, tag) {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "gi");
  const out = [];
  let match;
  while ((match = re.exec(xml))) out.push(decodeXml(match[1].trim()));
  return out;
}

export function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function soapFault(xml) {
  return xmlText(xml, "faultstring") || xmlText(xml, "exceptionMessage") || "";
}

export function parseAsyncId(xml) {
  return xmlText(xml, "id") || xmlText(xml, "asyncProcessId");
}

export function parseRetrieveResult(xml) {
  const done = xmlText(xml, "done") === "true";
  const success = xmlText(xml, "success") !== "false";
  const status = xmlText(xml, "status") || (done ? (success ? "Succeeded" : "Failed") : "InProgress");
  const errorMessage = xmlText(xml, "errorMessage") || soapFault(xml);
  const zipFile = xmlText(xml, "zipFile");
  const messages = xmlAll(xml, "problem");
  return { done, success, status, errorMessage, zipFile, messages };
}

export function parseDeployResult(xml) {
  const done = xmlText(xml, "done") === "true";
  const success = xmlText(xml, "success") === "true";
  const status = xmlText(xml, "status") || (done ? (success ? "Succeeded" : "Failed") : "InProgress");
  const errorMessage = xmlText(xml, "errorMessage") || soapFault(xml);
  const failures = [];
  const componentBlocks = xml.split(/<(?:[\w]+:)?componentFailures>/i).slice(1);
  for (const block of componentBlocks) {
    const chunk = block.split(/<\/(?:[\w]+:)?componentFailures>/i)[0];
    failures.push({
      fullName: xmlText(chunk, "fullName"),
      problem: xmlText(chunk, "problem"),
      componentType: xmlText(chunk, "componentType")
    });
  }
  const testFailures = [];
  const testBlocks = xml.split(/<(?:[\w]+:)?runTestResult>/i);
  if (testBlocks.length > 1) {
    const names = xmlAll(xml, "name");
    const messages = xmlAll(xml, "message");
    // Keep a compact summary; detailed parsing is best-effort.
    if (messages.length) {
      testFailures.push({ message: messages.slice(0, 5).join("; ") });
    }
    void names;
  }
  return {
    done,
    success,
    status,
    errorMessage,
    failures: failures.filter((f) => f.problem || f.fullName),
    testFailures
  };
}
