import { NextRequest, NextResponse } from "next/server";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string | null;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  open_issues_count: number;
  topics?: string[];
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const username = (request.nextUrl.searchParams.get("username") || "").trim();

  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    return NextResponse.json(
      { error: "Enter a valid GitHub username." },
      { status: 400 },
    );
  }

  try {
    const allRepositories: GitHubRepository[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "RepoPilot-Ghost-Machine",
          },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (response.status === 404) {
        return NextResponse.json({ error: "GitHub user not found." }, { status: 404 });
      }
      if (response.status === 403 || response.status === 429) {
        return NextResponse.json(
          { error: "GitHub API rate limit reached. Please wait a little and try again." },
          { status: 429 },
        );
      }
      if (!response.ok) {
        return NextResponse.json(
          { error: "GitHub could not return repositories right now." },
          { status: 502 },
        );
      }

      const pageRepositories = (await response.json()) as GitHubRepository[];
      allRepositories.push(...pageRepositories);
      if (pageRepositories.length < 100) break;
    }

    const repositories = allRepositories
      .filter((repository) => !repository.fork)
      .map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        url: repository.html_url,
        description: repository.description || "No repository description yet.",
        language: repository.language || "Not specified",
        stars: repository.stargazers_count,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at,
        defaultBranch: repository.default_branch,
        archived: repository.archived,
        openIssues: repository.open_issues_count,
        topics: repository.topics || [],
      }));

    return NextResponse.json(
      { username, count: repositories.length, repositories },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to reach GitHub. Check your connection and try again." },
      { status: 502 },
    );
  }
}
