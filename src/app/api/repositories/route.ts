import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

type GitHubRepository = {
  id: number; name: string; full_name: string; html_url: string;
  description: string | null; language: string | null; stargazers_count: number;
  updated_at: string; pushed_at: string | null; default_branch: string;
  archived: boolean; fork: boolean; open_issues_count: number; topics?: string[];
  private?: boolean; visibility?: string;
};

export const dynamic = "force-dynamic";

function rateLimitResponse(response: Response) {
  const reset = Number(response.headers.get("x-ratelimit-reset") || 0);
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  const retryAt = retryAfter > 0 ? new Date(Date.now() + retryAfter * 1000).toISOString()
    : reset > 0 ? new Date(reset * 1000).toISOString() : null;
  const remaining = response.headers.get("x-ratelimit-remaining");
  return NextResponse.json({
    error: "GitHub API rate limit reached. Your authenticated GitHub API quota is exhausted. Retry after the reset.",
    rateLimit: { remaining, retryAt },
  }, { status: 429, headers: retryAt ? { "Retry-After": String(Math.max(1, Math.ceil((new Date(retryAt).getTime() - Date.now()) / 1000))) } : {} });
}

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Sign in with GitHub to load your repositories." }, { status: 401 });
  }
  const username = session.login;
  const useAuthenticatedRepos = true;
  const allRepositories: GitHubRepository[] = [];

  try {
    for (let page = 1; page <= 10; page += 1) {
      const endpoint = useAuthenticatedRepos
        ? `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=updated`
        : `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "RepoPilot-Ghost-Machine",
          ...(useAuthenticatedRepos && session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 404) return NextResponse.json({ error: "GitHub user not found." }, { status: 404 });
      if (response.status === 403 || response.status === 429) return rateLimitResponse(response);
      if (response.status === 401) return NextResponse.json({ error: "GitHub authorization expired. Sign in again." }, { status: 401 });
      if (!response.ok) return NextResponse.json({ error: "GitHub could not return repositories right now." }, { status: 502 });
      const pageRepositories = await response.json() as GitHubRepository[];
      allRepositories.push(...pageRepositories);
      if (pageRepositories.length < 100) break;
    }

    const repositories = allRepositories.filter((repository) => !repository.fork).map((repository) => ({
      id: repository.id, name: repository.name, fullName: repository.full_name, url: repository.html_url,
      description: repository.description || "No repository description yet.",
      language: repository.language || "Not specified", stars: repository.stargazers_count,
      updatedAt: repository.updated_at, pushedAt: repository.pushed_at, defaultBranch: repository.default_branch,
      archived: repository.archived, openIssues: repository.open_issues_count, topics: repository.topics || [],
      private: Boolean(repository.private), visibility: repository.visibility || (repository.private ? "private" : "public"),
    }));

    return NextResponse.json(
      { username, count: repositories.length, repositories, authenticated: useAuthenticatedRepos, visibility: useAuthenticatedRepos ? "authorized" : "public" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unable to reach GitHub. Check your connection and try again." }, { status: 502 });
  }
}
