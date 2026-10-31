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

  try {
    const model = await chooseModel(apiKey);
    const compact = repositories.map((repo) => ({
      id: repo.id, name: repo.name, fullName: repo.fullName,
      description: (repo.description || "").slice(0, 500), language: repo.language || "",
      stars: repo.stars || 0, updatedAt: repo.updatedAt || "", pushedAt: repo.pushedAt || null,
      archived: Boolean(repo.archived), openIssues: repo.openIssues || 0,
      topics: (repo.topics || []).slice(0, 10), currentManualStatus: repo.status || "Not assessed",
    }));
    const prompt = [
      "You are RepoPilot, an expert software project portfolio organizer.",
      "Classify every supplied repository using only the metadata provided. Do not invent repository contents or claim source-code inspection.",
      "Return ONLY valid JSON with this exact shape: {\"projects\":[{\"id\":number,\"status\":\"Needs attention\"|\"Needs review\"|\"In progress\"|\"Completed\"|\"On hold\"|\"Not assessed\",\"priority\":1|2|3|4|5,\"reason\":\"short evidence-based explanation\"}]}",
      "Priority 1 means most urgent; 5 means lowest urgency. Archived repositories should be On hold. Do not mark a project Completed merely because it is inactive. Use Not assessed when evidence is insufficient. Keep each reason under 25 words. Include every input id exactly once.",
      JSON.stringify(compact),
    ].join("\n");
    let response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], format: "json", stream: false }),
      cache: "no-store", signal: AbortSignal.timeout(90000),
    });
    let activeModel = model;
    if (response.status === 402 && !model.toLowerCase().includes("gemma4:31b-cloud")) {
      activeModel = "gemma4:31b-cloud";
      response = await fetch("https://ollama.com/api/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ model: activeModel, messages: [{ role: "user", content: prompt }], format: "json", stream: false }),
        cache: "no-store", signal: AbortSignal.timeout(90000),
      });
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 700);
      return NextResponse.json({ error: `Ollama Cloud failed to organize projects (HTTP ${response.status}). ${detail}` }, { status: 502 });
    }
    const result = await response.json() as { message?: { content?: string }; model?: string };
    let parsed: { projects?: Array<{ id: number; status: string; priority: number; reason: string }> };
    try { parsed = JSON.parse(result.message?.content || "") as typeof parsed; }
    catch { return NextResponse.json({ error: "Ollama returned an invalid project organization. Please retry." }, { status: 502 }); }
    const allowed = new Set(repositories.map((repo) => repo.id));
    const projects = (parsed.projects || []).filter((item) =>
      allowed.has(item.id) &&
      ["Needs attention", "Needs review", "In progress", "Completed", "On hold", "Not assessed"].includes(item.status) &&
      Number.isInteger(item.priority) && item.priority >= 1 && item.priority <= 5 &&
      typeof item.reason === "string"
    );
    if (projects.length !== repositories.length || new Set(projects.map((item) => item.id)).size !== repositories.length) {
      return NextResponse.json({ error: "The AI did not return a complete classification for every repository. Please retry." }, { status: 502 });
    }
    return NextResponse.json({ projects, model: result.model || activeModel, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI organization failed." }, { status: 502 });
  }
}
