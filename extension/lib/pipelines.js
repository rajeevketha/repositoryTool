export function pipelinesFilePath() {
  return ".orgflow/pipelines.json";
}

export function emptyPipelineStore() {
  return { schema: 1, pipelines: [] };
}

export function publicOrg(org) {
  if (!org) return { id: "", label: "", username: "", instanceUrl: "" };
  return {
    id: org.id || "",
    label: org.label || "",
    username: org.username || "",
    instanceUrl: org.instanceUrl || ""
  };
}

export function pipelineId(name, now = Date.now()) {
  const slug = String(name || "pipeline")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "pipeline";
  return `${slug}-${now.toString(36)}`;
}

export function sameOrg(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.username && b.username && a.username.toLowerCase() === b.username.toLowerCase()) return true;
  if (a.instanceUrl && b.instanceUrl && a.instanceUrl.replace(/\/+$/, "") === b.instanceUrl.replace(/\/+$/, "")) return true;
  return false;
}

export function stagesFromPipeline(record) {
  if (!record) return [];
  if (Array.isArray(record.stages) && record.stages.length >= 2) {
    return record.stages.map(publicOrg);
  }
  const pair = [publicOrg(record.source), publicOrg(record.target)];
  return pair.some((s) => s.label || s.username || s.instanceUrl) ? pair : [];
}

export function pipelinePathLabel(record) {
  const stages = stagesFromPipeline(record);
  if (stages.length) return stages.map((s) => s.label || s.username || "org").join(" → ");
  return record?.name || "";
}

export function createPipeline({ name, source, target, stages, testLevel, useGit, id, hopIndex }) {
  const stageList = Array.isArray(stages) && stages.length >= 2
    ? stages.map(publicOrg)
    : [publicOrg(source), publicOrg(target)];
  const hasOrgs = stageList.filter((s) => s.label || s.username || s.instanceUrl).length >= 2;
  if (!hasOrgs) throw new Error("A promotion path needs at least two Salesforce orgs (for example DEC → QA).");
  const trimmed = String(name || "").trim() || pipelinePathLabel({ stages: stageList });
  const maxHop = Math.max(0, stageList.length - 2);
  const hop = Math.min(Math.max(0, Number.isInteger(hopIndex) ? hopIndex : 0), maxHop);
  return {
    id: id || pipelineId(trimmed),
    name: trimmed,
    source: stageList[hop],
    target: stageList[hop + 1],
    stages: stageList,
    hopIndex: hop,
    testLevel: testLevel || "NoTestRun",
    useGit: useGit !== false,
    updatedAt: new Date().toISOString()
  };
}

export function findMatchingPipeline(pipelines, source, target) {
  return (pipelines || []).find((p) => {
    const stages = stagesFromPipeline(p);
    if (source && target) {
      for (let i = 0; i < stages.length - 1; i += 1) {
        if (sameOrg(stages[i], source) && sameOrg(stages[i + 1], target)) return true;
      }
    }
    return source && target && sameOrg(p.source, source) && sameOrg(p.target, target);
  }) || null;
}

export function appendStage(record, org) {
  const stages = stagesFromPipeline(record);
  if (!org) return record;
  if (stages.some((s) => sameOrg(s, org))) {
    return { ...record, stages, name: pipelinePathLabel({ ...record, stages }) || record.name };
  }
  const next = [...stages, publicOrg(org)];
  return {
    ...record,
    stages: next,
    name: pipelinePathLabel({ stages: next }) || record.name,
    updatedAt: new Date().toISOString()
  };
}

export function nextHopAfter(record, currentTarget) {
  const stages = stagesFromPipeline(record);
  const idx = stages.findIndex((s) => sameOrg(s, currentTarget));
  if (idx < 0 || idx >= stages.length - 1) return null;
  return { source: stages[idx], target: stages[idx + 1], hopIndex: idx };
}

export function parsePipelineStore(raw) {
  if (!raw) return emptyPipelineStore();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.pipelines)) return emptyPipelineStore();
    return { schema: parsed.schema || 1, pipelines: parsed.pipelines };
  } catch {
    return emptyPipelineStore();
  }
}

export function upsertPipeline(store, record) {
  const pipelines = [...(store?.pipelines || [])];
  const idx = pipelines.findIndex((p) => p.id === record.id);
  if (idx >= 0) pipelines[idx] = record;
  else pipelines.unshift(record);
  return { schema: store?.schema || 1, pipelines };
}

export function findPipeline(pipelines, id) {
  return (pipelines || []).find((p) => p.id === id) || null;
}

export function matchOrg(orgs, saved) {
  if (!saved) return null;
  return (
    orgs.find((o) => saved.id && o.id && o.id === saved.id) ||
    orgs.find((o) => saved.username && o.username && o.username === saved.username) ||
    orgs.find((o) => saved.instanceUrl && o.instanceUrl === saved.instanceUrl) ||
    null
  );
}
