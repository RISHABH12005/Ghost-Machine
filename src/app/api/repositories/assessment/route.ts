import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GitHubRepo = {
  archived: boolean;
  pushed_at: string | null;
  default_branch: string;
  full_name: string;
};

type PullRequest = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  requested_reviewers?: Array<{ login: string }>;
};

type WorkflowRun = {
  id: number;
  name: string;
  html_url: string;
  status: string;
  conclusion: string | null;
  updated_at: string;
};

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "RepoPilot-Ghost-Machine",
};

async function githubGet<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub API rate limit or permission limit reached. Try again later.");
  }
  if (!response.ok) throw new Error("GitHub could not provide enough data to assess this repository.");
  return (await response.json()) as T;
}

export async function GET(request: NextRequest) {
  const owner = (request.nextUrl.searchParams.get("owner") || "").trim();
  const repo = (request.nextUrl.searchParams.get("repo") || "").trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") {
    return NextResponse.json({ error: "Invalid repository owner or name." }, { status: 400 });
  }

  try {
    const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const repository = await githubGet<GitHubRepo>(root);
    if (!repository) return NextResponse.json({ error: "Public repository not found." }, { status: 404 });

    const [pulls, runs] = await Promise.all([
      githubGet<PullRequest[]>(`${root}/pulls?state=open&per_page=10`),
      githubGet<{ workflow_runs: WorkflowRun[] }>(`${root}/actions/runs?per_page=10`),
    ]);
    const evidence: Array<{ kind: string; detail: string; url?: string; observedAt?: string }> = [];
    const failedRun = runs?.workflow_runs?.find((run) => run.conclusion === "failure");
    const activeRun = runs?.workflow_runs?.find((run) => run.status === "in_progress" || run.status === "queued");
    const reviewPull = pulls?.find((pull) => !pull.draft && (pull.requested_reviewers?.length ?? 0) > 0);
    const pushedAt = repository.pushed_at ? new Date(repository.pushed_at) : null;
    const daysSincePush = pushedAt && !Number.isNaN(pushedAt.getTime())
      ? Math.floor((Date.now() - pushedAt.getTime()) / 86_400_000)
      : null;

    if (repository.archived) {
      evidence.push({ kind: "repository", detail: "GitHub marks this repository as archived." });
      return NextResponse.json({ status: "On hold", confidence: "high", evidence, assessedAt: new Date().toISOString(), source: "GitHub public API" });
    }
    if (failedRun) evidence.push({ kind: "workflow", detail: `Workflow “${failedRun.name}” failed.`, url: failedRun.html_url, observedAt: failedRun.updated_at });
    if (activeRun) evidence.push({ kind: "workflow", detail: `Workflow “${activeRun.name}” is ${activeRun.status.replace("_", " ")}.`, url: activeRun.html_url, observedAt: activeRun.updated_at });
    if (reviewPull) evidence.push({ kind: "pull_request", detail: `Pull request #${reviewPull.number} has requested reviewers: ${reviewPull.title}`, url: reviewPull.html_url });
    if (daysSincePush !== null && daysSincePush <= 14) evidence.push({ kind: "activity", detail: `Latest push was ${daysSincePush === 0 ? "today" : `${daysSincePush} day(s) ago`}.`, observedAt: repository.pushed_at ?? undefined });

    let status = "Not assessed";
    let confidence = "low";
    if (failedRun) { status = "Needs attention"; confidence = "high"; }
    else if (reviewPull) { status = "Needs review"; confidence = "medium"; }
    else if (activeRun || (daysSincePush !== null && daysSincePush <= 14)) { status = "In progress"; confidence = "medium"; }
    else evidence.push({ kind: "limitation", detail: "No strong signal found. Lack of recent commits does not prove a project is complete or abandoned." });

    return NextResponse.json(
      { status, confidence, evidence, assessedAt: new Date().toISOString(), source: "GitHub public API", limitations: ["Only public GitHub data is checked.", "Security alerts may be unavailable without authorization.", "Completed and On hold require a human decision unless the repository is archived."] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assessment failed." }, { status: 502 });
  }
}
