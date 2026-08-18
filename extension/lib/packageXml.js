export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizePackageTypes(types) {
  const byName = new Map();
  for (const entry of types || []) {
    const name = String(entry?.name || "").trim();
    if (!name) continue;
    const members = [...new Set((entry.members || []).map((m) => String(m).trim()).filter(Boolean))];
    if (!members.length) continue;
    const current = byName.get(name) || [];
    const merged = [...current, ...members];
    const unique = merged.includes("*") ? ["*"] : [...new Set(merged)].sort((a, b) => a.localeCompare(b));
    byName.set(name, unique);
  }
  return [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, members]) => ({ name, members }));
}

export function buildPackageXmlFromTypes(types, apiVersion = "61.0") {
  const cleaned = normalizePackageTypes(types);
  const blocks = cleaned
    .map((t) => {
      const members = t.members.map((mem) => `        <members>${escapeXml(mem)}</members>`).join("\n");
      return `    <types>
${members}
        <name>${escapeXml(t.name)}</name>
    </types>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${blocks}
    <version>${escapeXml(apiVersion)}</version>
</Package>
`;
}

export function buildPackageXml(typeNames, apiVersion = "61.0") {
  return buildPackageXmlFromTypes(
    (typeNames || []).map((name) => ({ name, members: ["*"] })),
    apiVersion
  );
}

export function parsePackageXml(xml) {
  const raw = String(xml || "");
  const version = xmlText(raw, "version") || "61.0";
  const types = [];
  const re = /<(?:[\w]+:)?types>([\s\S]*?)<\/(?:[\w]+:)?types>/gi;
  let match;
  while ((match = re.exec(raw))) {
    const block = `<block>${match[1]}</block>`;
    const name = xmlText(block, "name");
    const members = xmlAll(block, "members");
    if (name && members.length) types.push({ name, members });
  }
  return { version, types: normalizePackageTypes(types) };
}

export function typesFromPackageXml(xml) {
  return parsePackageXml(xml).types.map((t) => t.name);
}

export function assertPackageXml(xml) {
  if (!/<Package[\s>]/i.test(String(xml || ""))) {
    throw new Error("Not a Salesforce package.xml file (missing <Package>).");
  }
  const parsed = parsePackageXml(xml);
  if (!parsed.types.length) throw new Error("package.xml has no <types> / <members> entries.");
  return parsed;
}

export function memberCount(types) {
  return normalizePackageTypes(types).reduce((n, t) => n + t.members.length, 0);
}

export function packageSummary(types) {
  const cleaned = normalizePackageTypes(types);
  if (!cleaned.length) return "No components selected";
  return cleaned
    .map((t) => `${t.name} (${t.members.includes("*") ? "*" : t.members.length})`)
    .join(" · ");
}

export function toggleMember(types, typeName, member, selected, allMembers = []) {
  const map = new Map(normalizePackageTypes(types).map((t) => [t.name, [...t.members]]));
  const current = map.get(typeName) || [];
  const listed = [...new Set((allMembers || []).map((m) => String(m).trim()).filter(Boolean))];
  if (selected) {
    if (current.includes("*")) {
      map.set(typeName, ["*"]);
    } else {
      map.set(typeName, [...new Set([...current, member])]);
    }
  } else {
    const base = current.includes("*") && listed.length ? listed : current.filter((m) => m !== "*");
    const next = base.filter((m) => m !== member);
    if (next.length) map.set(typeName, next);
    else map.delete(typeName);
  }
  return normalizePackageTypes([...map.entries()].map(([name, members]) => ({ name, members })));
}

export function setTypeMembers(types, typeName, members) {
  const others = normalizePackageTypes(types).filter((t) => t.name !== typeName);
  if (!members?.length) return others;
  return normalizePackageTypes([...others, { name: typeName, members }]);
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

export function retrieveBodyFromTypes(types, apiVersion) {
  const cleaned = normalizePackageTypes(types);
  const typeXml = cleaned
    .map((t) => {
      const members = t.members.map((m) => `          <urn:members>${escapeXml(m)}</urn:members>`).join("\n");
      return `        <urn:types>
${members}
          <urn:name>${escapeXml(t.name)}</urn:name>
        </urn:types>`;
    })
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

export function retrieveBody(typeNames, apiVersion) {
  return retrieveBodyFromTypes(
    (typeNames || []).map((name) => ({ name, members: ["*"] })),
    apiVersion
  );
}

export function listMetadataBody(queries, apiVersion) {
  const qxml = (queries || [])
    .map((q) => {
      const folder = q.folder ? `\n        <urn:folder>${escapeXml(q.folder)}</urn:folder>` : "";
      return `      <urn:queries>
        <urn:type>${escapeXml(q.type)}</urn:type>${folder}
      </urn:queries>`;
    })
    .join("\n");
  return `    <urn:listMetadata xmlns:urn="http://soap.sforce.com/2006/04/metadata">
${qxml}
      <urn:asOfVersion>${escapeXml(apiVersion)}</urn:asOfVersion>
    </urn:listMetadata>`;
}

export function parseListMetadata(xml) {
  const results = [];
  const blocks = String(xml || "").split(/<(?:[\w]+:)?result>/i).slice(1);
  for (const block of blocks) {
    const chunk = block.split(/<\/(?:[\w]+:)?result>/i)[0];
    const fullName = xmlText(chunk, "fullName");
    if (!fullName) continue;
    results.push({
      fullName,
      type: xmlText(chunk, "type"),
      lastModifiedDate: xmlText(chunk, "lastModifiedDate"),
      lastModifiedByName: xmlText(chunk, "lastModifiedByName"),
      manageableState: xmlText(chunk, "manageableState"),
      fileName: xmlText(chunk, "fileName")
    });
  }
  return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
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
