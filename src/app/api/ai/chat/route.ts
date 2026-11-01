import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

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

async function githubGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RepoPilot-Ghost-Machine" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(response.status === 404 ? "Repository not found or not accessible to this GitHub account." : response.status === 403 || response.status === 429 ? "GitHub API rate or permission limit reached." : "GitHub could not provide repository data.");
  return await response.json() as T;
}

export async function POST(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub before using AI Talk." }, { status: 401 });
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Ollama Cloud is not configured. Add OLLAMA_API_KEY in Render Environment." }, { status: 503 });

  let body: { owner?: string; repo?: string; messages?: ChatMessage[] };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid chat request." }, { status: 400 }); }
  const owner = (body.owner || "").trim();
  const repoName = (body.repo || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repoName) || repoName === "." || repoName === "..") {
    return NextResponse.json({ error: "Select a valid repository before starting AI Talk." }, { status: 400 });
  }
  if (!messages.length || messages.some((message) => !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim() || message.content.length > 4000)) {
    return NextResponse.json({ error: "Send a valid message (maximum 4,000 characters)." }, { status: 400 });
  }

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
    const model = process.env.OLLAMA_MODEL?.trim() || "gemma4:31b-cloud";
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
    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, ...messages.map((message) => ({ role: message.role, content: message.content }))], stream: false }),
      cache: "no-store", signal: AbortSignal.timeout(90000),
    });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "Ollama Cloud rejected the API key. Check OLLAMA_API_KEY in Render." }, { status: 502 });
    if (response.status === 429) return NextResponse.json({ error: "Ollama Cloud rate or usage limit reached. Try again later." }, { status: 429 });
    if (!response.ok) return NextResponse.json({ error: `Ollama Cloud request failed (HTTP ${response.status}).` }, { status: 502 });
    const result = await response.json() as { message?: { content?: string }; model?: string };
    const reply = result.message?.content?.trim();
    if (!reply) return NextResponse.json({ error: "Ollama Cloud returned an empty reply." }, { status: 502 });
    return NextResponse.json({ reply, model: result.model || model, repository: repository.full_name, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Talk failed.";
    return NextResponse.json({ error: message.includes("timed out") ? "GitHub or Ollama timed out. Please try again." : message }, { status: 502 });
  }
}
