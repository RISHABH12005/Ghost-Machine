import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/auth/github-session";
import {
  clearWorkspaceAiChat,
  loadWorkspaceAiChatMessages,
  recordWorkspaceAiChatTurn,
} from "@/lib/workspace/database";

export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };
type GitHubRepo = {
  full_name: string; description: string | null; language: string | null; html_url: string;
  default_branch: string; stargazers_count: number; open_issues_count: number;
  archived: boolean; private: boolean; created_at: string; updated_at: string;
  pushed_at: string | null; topics?: string[];
};
type Issue = { number: number; title: string; state: string; html_url: string; pull_request?: unknown; labels?: Array<{ name: string }> };
type Pull = { number: number; title: string; state: string; html_url: string; draft: boolean; updated_at: string };
type Run = { name: string; status: string; conclusion: string | null; html_url: string; updated_at: string };
type OllamaModel = { name?: string; model?: string };
type OllamaTags = { models?: OllamaModel[] };

async function selectFallbackModel(apiKey: string, excluded: string): Promise<string | null> {
  const response = await fetch("https://ollama.com/api/tags", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const catalog = await response.json() as OllamaTags;
  const models = (catalog.models || []).map((item) => item.name || item.model).filter((name): name is string => Boolean(name));
  const preferences = ["gemma4:31b-cloud", "gemma4", "qwen3.5", "qwen3", "deepseek", "gpt-oss", "glm", "llama"];
  for (const family of preferences) {
    const match = models.find((name) => name !== excluded && name.toLowerCase().includes(family));
    if (match) return match;
  }
  return models.find((name) => name !== excluded) || null;
}

async function selectOllamaModel(apiKey: string): Promise<string> {
  const response = await fetch("https://ollama.com/api/tags", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Could not list Ollama Cloud models (HTTP ${response.status}). ${detail}`);
  }
  const catalog = await response.json() as OllamaTags;
  const models = (catalog.models || []).map((item) => item.name || item.model).filter((name): name is string => Boolean(name));
  if (!models.length) throw new Error("No Ollama Cloud models are available to this API key.");
  const configured = process.env.OLLAMA_MODEL?.trim();
  if (configured && models.some((name) => name.toLowerCase() === configured.toLowerCase())) return configured;
  const preferences = ["gemma4:31b-cloud", "gemma4", "qwen3.5", "qwen3", "deepseek", "gpt-oss", "glm", "llama"];
  for (const family of preferences) {
    const match = models.find((name) => name.toLowerCase().includes(family));
    if (match) return match;
  }
  return models[0];
}


async function githubGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RepoPilot-Ghost-Machine" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(response.status === 404 ? "Repository not found or not accessible to this GitHub account." : response.status === 403 || response.status === 429 ? "GitHub API rate or permission limit reached." : "GitHub could not provide repository data.");
  return await response.json() as T;
}

const MODEL_CONTEXT_CHAR_BUDGET = 32_000;

function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const configuredOrigin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
    const expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function validRepository(ownerValue: string | null, repoValue: string | null) {
  const owner = (ownerValue || "").trim();
  const repo = (repoValue || "").trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
}

/** Keep the most recent conversation context that fits; all turns remain stored in Supabase. */
function selectModelContext(history: ChatMessage[], latestMessage: string): ChatMessage[] {
  const latest: ChatMessage = { role: "user", content: latestMessage };
  const selected: ChatMessage[] = [latest];
  let usedChars = latestMessage.length;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const available = MODEL_CONTEXT_CHAR_BUDGET - usedChars;
    if (available <= 0) break;
    if (message.content.length <= available) {
      selected.unshift(message);
      usedChars += message.content.length;
      continue;
    }
    if (available >= 256) {
      selected.unshift({
        role: message.role,
        content: `[Earlier context shortened]\n${message.content.slice(-available)}`,
      });
    }
    break;
  }
  return selected;
}

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to load AI chat history." }, { status: 401 });
  const repository = validRepository(request.nextUrl.searchParams.get("owner"), request.nextUrl.searchParams.get("repo"));
  if (!repository) return NextResponse.json({ error: "Select a valid repository before loading chat history." }, { status: 400 });

  try {
    const messages = await loadWorkspaceAiChatMessages(session.login, repository.fullName);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("[ai-chat] History load failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load saved chat history. Please retry." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to clear AI chat history." }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Cross-origin chat updates are not allowed." }, { status: 403 });
  const repository = validRepository(request.nextUrl.searchParams.get("owner"), request.nextUrl.searchParams.get("repo"));
  if (!repository) return NextResponse.json({ error: "Select a valid repository before clearing chat history." }, { status: 400 });

  try {
    await clearWorkspaceAiChat(session.login, repository.fullName);
    return NextResponse.json({ cleared: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("[ai-chat] History clear failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not clear this conversation. Please retry." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub before using AI Talk." }, { status: 401 });
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Ollama Cloud is not configured. Add OLLAMA_API_KEY in Render Environment." }, { status: 503 });

  let body: { owner?: string; repo?: string; message?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid chat request." }, { status: 400 }); }
  const owner = (body.owner || "").trim();
  const repoName = (body.repo || "").trim();
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repoName) || repoName === "." || repoName === "..") {
    return NextResponse.json({ error: "Select a valid repository before starting AI Talk." }, { status: 400 });
  }
  if (!userMessage) return NextResponse.json({ error: "Enter a non-empty message before sending." }, { status: 400 });

  try {
    const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
    const [repository, issues, pulls, runs, readme] = await Promise.all([
      githubGet<GitHubRepo>(root, session.accessToken),
      githubGet<Issue[]>(`${root}/issues?state=all&per_page=15`, session.accessToken),
      githubGet<Pull[]>(`${root}/pulls?state=all&per_page=15`, session.accessToken),
      githubGet<{ workflow_runs: Run[] }>(`${root}/actions/runs?per_page=8`, session.accessToken),
      githubGet<{ content?: string; encoding?: string }>(`${root}/readme`, session.accessToken).catch(() => null),
    ]);
    let readmeText = "";
    if (readme?.content && readme.encoding === "base64") {
      try { readmeText = Buffer.from(readme.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 10000); } catch { readmeText = ""; }
    }
    const model = await selectOllamaModel(apiKey);
    const history = await loadWorkspaceAiChatMessages(session.login, repository.full_name);
    const messages = selectModelContext(history, userMessage);
    const context = {
      repository: {
        name: repository.full_name, description: repository.description, language: repository.language,
        url: repository.html_url, defaultBranch: repository.default_branch, stars: repository.stargazers_count,
        openIssuesCount: repository.open_issues_count, archived: repository.archived, private: repository.private,
        createdAt: repository.created_at, updatedAt: repository.updated_at, pushedAt: repository.pushed_at,
        topics: repository.topics || [],
      },
      issues: issues.filter((item) => !item.pull_request).map(({ number, title, state, html_url, labels }) => ({ number, title, state, url: html_url, labels: labels?.map((label) => label.name) || [] })),
      pullRequests: pulls.map(({ number, title, state, html_url, draft, updated_at }) => ({ number, title, state, url: html_url, draft, updatedAt: updated_at })),
      recentWorkflowRuns: runs.workflow_runs.map(({ name, status, conclusion, html_url, updated_at }) => ({ name, status, conclusion, url: html_url, updatedAt: updated_at })),
      readme: readmeText || "README is unavailable.",
    };
    const prompt = [
      "You are RepoPilot AI, a helpful software engineering assistant focused on the selected GitHub repository.",
      "Answer the user's question directly and conversationally. Use the repository context below. Give concrete, actionable explanations and examples when useful.",
      "Be honest about evidence: the context contains repository metadata, a limited set of issues, pull requests, recent workflow runs, and README text. You have NOT inspected source files unless their contents are explicitly included. Never invent code, test results, secrets, security findings, or repository facts.",
      "If asked about implementation details not present in context, say what is missing and suggest which file or code snippet the user can provide. Use Markdown for readable answers. Link to supplied GitHub URLs when relevant.",
      "Repository context:\n" + JSON.stringify(context),
    ].join("\n\n");
    const chatPayload = (activeModel: string) => JSON.stringify({ model: activeModel, messages: [{ role: "system", content: prompt }, ...messages.map((message) => ({ role: message.role, content: message.content }))], stream: false });
    const sendToOllama = (activeModel: string) => fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: chatPayload(activeModel),
      cache: "no-store", signal: AbortSignal.timeout(90000),
    });
    let activeModel = model;
    let response = await sendToOllama(activeModel);
    if (response.status === 404) {
      const fallback = await selectFallbackModel(apiKey, activeModel);
      if (fallback) {
        activeModel = fallback;
        response = await sendToOllama(activeModel);
      }
    }
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "Ollama Cloud rejected the API key. Check OLLAMA_API_KEY in Render." }, { status: 502 });
    if (response.status === 429) return NextResponse.json({ error: "Ollama Cloud rate or usage limit reached. Try again later." }, { status: 429 });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      return NextResponse.json({ error: `Ollama Cloud request failed (HTTP ${response.status}) using model "${activeModel}". ${detail || "Check the selected model and API key access."}` }, { status: 502 });
    }
    const result = await response.json() as { message?: { content?: string }; model?: string };
    const reply = result.message?.content?.trim();
    if (!reply) return NextResponse.json({ error: "Ollama Cloud returned an empty reply." }, { status: 502 });
    const aiUsage = await recordWorkspaceAiChatTurn(session.login, repository.full_name, userMessage, reply);
    console.info("[ai-usage] Recorded successful AI chat and persisted transcript", JSON.stringify({ kind: "chats" }));
    return NextResponse.json({ reply, model: result.model || activeModel, repository: repository.full_name, generatedAt: new Date().toISOString(), aiUsage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Talk failed.";
    return NextResponse.json({ error: message.includes("timed out") ? "GitHub or Ollama timed out. Please try again." : message }, { status: 502 });
  }
}
