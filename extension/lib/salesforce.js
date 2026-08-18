const API_VERSION = "61.0";

function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function apiHostFromSalesforceHost(hostname) {
  return hostname
    .replace(/\.lightning\.force\.com$/i, ".my.salesforce.com")
    .replace(/\.develop\.lightning\.force\.com$/i, ".develop.my.salesforce.com")
    .replace(/\.sandbox\.lightning\.force\.com$/i, ".sandbox.my.salesforce.com")
    .replace(/\.scratch\.lightning\.force\.com$/i, ".scratch.my.salesforce.com")
    .replace(/\.my\.site\.com$/i, ".my.salesforce.com");
}

export function instanceUrlFromHost(hostname) {
  const host = apiHostFromSalesforceHost(hostname);
  return `https://${host}`;
}

export async function discoverOrgsFromCookies() {
  const cookies = await chrome.cookies.getAll({ name: "sid" });
  const candidates = [];
  for (const cookie of cookies) {
    if (!cookie.value || cookie.value.length < 10) continue;
    const domain = (cookie.domain || "").replace(/^\./, "");
    if (!/(salesforce|force|cloudforce|salesforce-setup|sfcrmapps)\./i.test(domain)) continue;
    if (/developer\.salesforce\.com|help\.salesforce\.com|trailhead|status\.salesforce/i.test(domain)) continue;
    candidates.push({
      sid: cookie.value,
      domain,
      instanceUrl: instanceUrlFromHost(domain)
    });
  }

  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = `${c.instanceUrl}|${c.sid.slice(0, 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const orgs = [];
  const orgIds = new Set();
  await Promise.all(
    unique.map(async (c) => {
      try {
        const org = await describeOrg(c.instanceUrl, c.sid);
        if (org && !orgIds.has(org.id)) {
          orgIds.add(org.id);
          orgs.push(org);
        }
      } catch {
        // Cookie may be expired or belong to a non-API host.
      }
    })
  );
  return orgs.sort((a, b) => a.label.localeCompare(b.label));
}

export async function describeOrg(instanceUrl, sid) {
  const base = instanceUrl.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${sid}`, Accept: "application/json" };
  const identity = await jsonFetch(`${base}/services/data/v${API_VERSION}/`, headers);
  const orgRes = await jsonFetch(
    `${base}/services/data/v${API_VERSION}/query?q=${encodeURIComponent("SELECT Id, Name, IsSandbox, OrganizationType, InstanceName FROM Organization")}`,
    headers
  );
  const userRes = await jsonFetch(`${base}/services/data/v${API_VERSION}/chatter/users/me`, headers).catch(() => null);
  const org = orgRes.records?.[0];
  if (!org) throw new Error("Could not read Organization");
  const username = userRes?.username || userRes?.name || "";
  const label = `${org.Name}${org.IsSandbox ? " (sandbox)" : " (prod)"}`;
  return {
    id: org.Id,
    name: org.Name,
    label,
    isSandbox: Boolean(org.IsSandbox),
    organizationType: org.OrganizationType,
    instanceName: org.InstanceName,
    instanceUrl: base,
    sid,
    username,
    apiHost: identity?.identity ? originFromUrl(identity.identity) : base
  };
}

export async function probeOrg(instanceUrl, sid) {
  return describeOrg(instanceUrl.replace(/\/$/, ""), sid);
}

async function jsonFetch(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Salesforce ${res.status} on ${url}`);
    err.status = res.status;
    err.body = text.slice(0, 500);
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

export function orgKey(org) {
  return org?.id || org?.instanceUrl || "";
}

export { API_VERSION };
