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

export function createPipeline({ name, source, target, testLevel, useGit, id }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Give the pipeline a name, for example Sandbox to UAT.");
  return {
    id: id || pipelineId(trimmed),
    name: trimmed,
    source: publicOrg(source),
    target: publicOrg(target),
    testLevel: testLevel || "NoTestRun",
    useGit: useGit !== false,
    updatedAt: new Date().toISOString()
  };
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
