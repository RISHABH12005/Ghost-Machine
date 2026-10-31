import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type GitHubRepo = {
  full_name: string;
  description: string | null;
  language: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  open_issues_count: number;
  archived: boolean;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  topics?: string[];
};

type Issue = { number: number; title: string; state: string; html_url: string; pull_request?: unknown; labels?: Array<{ name: string }> };
type Pull = { number: number; title: string; state: string; html_url: string; draft: boolean; updated_at: string };
type Run = { name: string; status: string; conclusion: string | null; html_url: string; updated_at: string };

async function githubGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RepoPilot-Ghost-Machine" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(response.status === 404 ? "Repository not found or not accessible to this GitHub account." : response.status === 403 || response.status === 429 ? "GitHub API rate or permission limit reached." : "GitHub could not provide repository data.");
  return await response.json() as T;
}

export async function POST(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub before using AI analysis." }, { status: 401 });
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Ollama Cloud is not configured. Add OLLAMA_API_KEY in Render Environment." }, { status: 503 });

  let body: { owner?: string; repo?: string };
  try { body = await request.json() as { owner?: string; repo?: string }; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const owner = (body.owner || "").trim();
  const repoName = (body.repo || "").trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repoName) || repoName === "." || repoName === "..") {
    return NextResponse.json({ error: "Invalid repository owner or name." }, { status: 400 });
  }

  try {
    const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
    const [repository, issues, pulls, runs] = await Promise.all([
      githubGet<GitHubRepo>(root, session.accessToken),
      githubGet<Issue[]>(`${root}/issues?state=open&per_page=20`, session.accessToken),
      githubGet<Pull[]>(`${root}/pulls?state=open&per_page=20`, session.accessToken),
      githubGet<{ workflow_runs: Run[] }>(`${root}/actions/runs?per_page=10`, session.accessToken),
    ]);

    const issueItems = issues.filter((item) => !item.pull_request).map(({ number, title, html_url, labels }) => ({ number, title, url: html_url, labels: labels?.map((label) => label.name) || [] }));
    const runItems = runs.workflow_runs.map(({ name, status, conclusion, html_url, updated_at }) => ({ name, status, conclusion, url: html_url, updatedAt: updated_at }));
    const model = process.env.OLLAMA_MODEL || "glm-5.3";
    const prompt = [
      "You are RepoPilot, a precise software project analyst.",
      "Analyze only the supplied GitHub metadata. Do not claim to have inspected source code, secrets, security alerts, or files.",
      "Return a useful concise report with these headings: Project overview, Current signals, Risks or unknowns, Recommended next steps.",
      "Distinguish observed facts from hypotheses. Do not call a project complete or abandoned based only on inactivity. Link to relevant GitHub issues, pull requests, or workflow runs using the supplied URLs.",
      "Keep the report actionable and under 500 words.",
      "",
      JSON.stringify({
        repository: {
          name: repository.full_name, description: repository.description, language: repository.language,
          url: repository.html_url, defaultBranch: repository.default_branch, stars: repository.stargazers_count,
          openIssuesCount: repository.open_issues_count, archived: repository.archived, private: repository.private,
          createdAt: repository.created_at, updatedAt: repository.updated_at, pushedAt: repository.pushed_at,
          topics: repository.topics || [],
        },
        openIssues: issueItems,
        openPullRequests: pulls.map(({ number, title, state, html_url, draft, updated_at }) => ({ number, title, state, url: html_url, draft, updatedAt: updated_at })),
        recentWorkflowRuns: runItems,
      }),
    ].join("\n");

    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "Ollama Cloud rejected the API key. Check OLLAMA_API_KEY in Render." }, { status: 502 });
    if (response.status === 429) return NextResponse.json({ error: "Ollama Cloud rate or usage limit reached. Check your Ollama account usage." }, { status: 429 });
    if (!response.ok) return NextResponse.json({ error: "Ollama Cloud could not complete the analysis. Check the model name and account access." }, { status: 502 });
    const result = await response.json() as { message?: { content?: string }; model?: string };
    const summary = result.message?.content?.trim();
    if (!summary) return NextResponse.json({ error: "Ollama Cloud returned an empty analysis." }, { status: 502 });
    return NextResponse.json({ summary, model: result.model || model, generatedAt: new Date().toISOString(), source: "GitHub repository metadata, open issues, pull requests, and recent workflow runs" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis failed.";
    return NextResponse.json({ error: message.includes("timed out") ? "The GitHub or Ollama request timed out. Try again." : message }, { status: 502 });
  }
}
