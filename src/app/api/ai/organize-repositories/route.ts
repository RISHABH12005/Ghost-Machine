import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type ModelEntry = { name?: string; model?: string };
type ModelCatalog = { models?: ModelEntry[] };
type InputRepository = {
  id: number; name: string; fullName: string; description?: string; language?: string;
  stars?: number; updatedAt?: string; pushedAt?: string | null; archived?: boolean;
  openIssues?: number; topics?: string[]; status?: string;
};
type ProjectSuggestion = { id: number; status: string; priority: number; reason: string };
const VALID_STATUSES = ["Needs attention", "Needs review", "In progress", "Completed", "On hold", "Not assessed"];

async function chooseModel(apiKey: string): Promise<string> {
  const configured = process.env.OLLAMA_MODEL?.trim();
  if (configured && configured.toLowerCase() !== "auto") return configured;
  const response = await fetch("https://ollama.com/api/tags", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Could not list Ollama Cloud models (HTTP ${response.status}). ${detail}`);
  }
  const data = await response.json() as ModelCatalog;
  const models = (data.models || []).map((item) => item.name || item.model).filter((name): name is string => Boolean(name));
  if (!models.length) throw new Error("Your Ollama Cloud account returned no available models. Check your account and API key.");
  const preferred = ["gemma4:31b-cloud", "gemma4", "qwen3.5", "qwen3", "deepseek", "gpt-oss", "glm", "llama"];
  for (const family of preferred) {
    const match = models.find((name) => name.toLowerCase().includes(family));
    if (match) return match;
  }
  return models[0];
}

function parseModelJson(content: string): { projects?: ProjectSuggestion[] } {
  const cleaned = content.trim()
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as { projects?: ProjectSuggestion[] };
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as { projects?: ProjectSuggestion[] };
    throw new Error("Ollama returned an incomplete or invalid JSON response.");
  }
}

async function classifyBatch(apiKey: string, model: string, batch: InputRepository[]): Promise<ProjectSuggestion[]> {
  const compact = batch.map((repo) => ({
    id: repo.id, name: repo.name, fullName: repo.fullName,
    description: (repo.description || "").slice(0, 350), language: repo.language || "",
    stars: repo.stars || 0, updatedAt: repo.updatedAt || "", pushedAt: repo.pushedAt || null,
    archived: Boolean(repo.archived), openIssues: repo.openIssues || 0,
    topics: (repo.topics || []).slice(0, 8), currentManualStatus: repo.status || "Not assessed",
  }));
  const prompt = [
    "You are RepoPilot, an expert software project portfolio organizer.",
    "Classify every supplied repository using only the metadata provided. Do not invent repository contents or claim source-code inspection.",
    "Return ONLY valid JSON with this exact shape: {\"projects\":[{\"id\":number,\"status\":\"Needs attention\"|\"Needs review\"|\"In progress\"|\"Completed\"|\"On hold\"|\"Not assessed\",\"priority\":1|\"2\"|\"3\"|\"4\"|\"5\",\"reason\":\"short evidence-based explanation\"}]}",
    "Priority must be an integer from 1 to 5. Archived repositories should be On hold. Do not mark a project Completed merely because it is inactive. Use Not assessed when evidence is insufficient. Keep each reason under 18 words.",
    "Include every input id exactly once. Do not include markdown fences or extra text.",
    JSON.stringify(compact),
  ].join("\n");
  let response = await fetch("https://ollama.com/api/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: prompt }], format: "json", stream: false,
      options: { temperature: 0.1, num_predict: 2048 },
    }),
    cache: "no-store", signal: AbortSignal.timeout(90000),
  });
  if (response.status === 402 && !model.toLowerCase().includes("gemma4:31b-cloud")) {
    response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: "gemma4:31b-cloud", messages: [{ role: "user", content: prompt }], format: "json", stream: false,
        options: { temperature: 0.1, num_predict: 2048 },
      }),
      cache: "no-store", signal: AbortSignal.timeout(90000),
    });
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Ollama Cloud failed to organize a batch (HTTP ${response.status}). ${detail}`);
  }
  const result = await response.json() as { message?: { content?: string }; model?: string };
  const parsed = parseModelJson(result.message?.content || "");
  const projects = parsed.projects;
  if (!Array.isArray(projects) || projects.length !== batch.length) {
    throw new Error(`Ollama returned ${Array.isArray(projects) ? projects.length : 0} classifications for a batch of ${batch.length}. Please retry.`);
  }
  const allowed = new Set(batch.map((repo) => repo.id));
  const valid = projects.filter((item) =>
    item && allowed.has(item.id) && VALID_STATUSES.includes(item.status) &&
    Number.isInteger(item.priority) && item.priority >= 1 && item.priority <= 5 &&
    typeof item.reason === "string"
  );
  if (valid.length !== batch.length || new Set(valid.map((item) => item.id)).size !== batch.length) {
    throw new Error("Ollama returned invalid or duplicate project classifications. Please retry.");
  }
  return valid;
}

export async function POST(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub before organizing projects." }, { status: 401 });
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Ollama Cloud is not configured. Add OLLAMA_API_KEY in Render Environment." }, { status: 503 });

  let body: { repositories?: InputRepository[] };
  try { body = await request.json() as { repositories?: InputRepository[] }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const repositories = body.repositories;
  if (!Array.isArray(repositories) || repositories.length < 1 || repositories.length > 100) {
    return NextResponse.json({ error: "Send between 1 and 100 repositories to organize." }, { status: 400 });
  }
  const valid = repositories.every((repo) =>
    Number.isSafeInteger(repo.id) && typeof repo.name === "string" &&
    typeof repo.fullName === "string" && repo.fullName.length <= 200
  );
  if (!valid) return NextResponse.json({ error: "One or more repository records are invalid." }, { status: 400 });
  if (new Set(repositories.map((repo) => repo.id)).size !== repositories.length) {
    return NextResponse.json({ error: "Repository list contains duplicate IDs." }, { status: 400 });
  }

  try {
    const model = await chooseModel(apiKey);
    // Smaller batches prevent long portfolio responses from being truncated or malformed.
    const batches: InputRepository[][] = [];
    for (let index = 0; index < repositories.length; index += 10) batches.push(repositories.slice(index, index + 10));
    const projects: ProjectSuggestion[] = [];
    for (let index = 0; index < batches.length; index += 3) {
      const results = await Promise.all(batches.slice(index, index + 3).map((batch) => classifyBatch(apiKey, model, batch)));
      projects.push(...results.flat());
    }
    const order = new Map(repositories.map((repo, index) => [repo.id, index]));
    projects.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return NextResponse.json({ projects, model, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI organization failed." }, { status: 502 });
  }
}
