import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type ContributionDay = { date: string; contributionCount: number; contributionLevel: string };
type Org = { id: string; login: string; name: string | null; avatar_url: string; html_url: string };
type GraphQLResult = {
  data?: {
    viewer?: {
      contributionsCollection?: {
        totalCommitContributions: number;
        totalIssueContributions: number;
        totalPullRequestContributions: number;
        contributionCalendar?: { totalContributions: number; weeks: Array<{ contributionDays: ContributionDay[] }> };
      };
    };
    [key: string]: unknown;
  };
  errors?: Array<{ message: string }>;
};

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
});

async function graphql(token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST", headers: headers(token), body: JSON.stringify({ query, variables }),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "GitHub authorization expired. Sign in again." : "GitHub analytics are temporarily unavailable.");
  const result = await response.json() as GraphQLResult;
  if (result.errors?.length) throw new Error(result.errors[0].message);
  return result;
}

function extractAchievements(html: string) {
  const found = new Map<string, { name: string; imageUrl: string }>();
  const images = html.match(/<img\b[^>]*>/gi) || [];
  for (const image of images) {
    const src = image.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = image.match(/\balt=["']([^"']+)["']/i)?.[1];
    if (!src || !alt || !/githubassets\.com\/images\/modules\/profile\/achievements\//i.test(src)) continue;
    const name = alt.replace(/\s+(?:level\s+\d+|x\d+)$/i, "").trim();
    if (name) found.set(name, { name, imageUrl: src.startsWith("//") ? `https:${src}` : src });
  }
  return [...found.values()];
}

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to view contribution insights." }, { status: 401 });

  const rawYear = Number(request.nextUrl.searchParams.get("year") || new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(rawYear) || rawYear < 2008 || rawYear > currentYear) {
    return NextResponse.json({ error: "Select a valid contribution year." }, { status: 400 });
  }
  const year = rawYear;
  const from = new Date(Date.UTC(year, 0, 1));
  const now = new Date();
  const to = year === currentYear ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const query = `query ContributionCalendar($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
      }
    }
  }`;

  try {
    const [analytics, orgResponse, profileResponse] = await Promise.all([
      graphql(session.accessToken, query, { from: from.toISOString(), to: to.toISOString() }),
      fetch("https://api.github.com/user/memberships/orgs?state=active&per_page=100", {
        headers: headers(session.accessToken), cache: "no-store", signal: AbortSignal.timeout(12000),
      }),
      fetch(`https://github.com/${encodeURIComponent(session.login)}?tab=achievements`, {
        headers: { "User-Agent": "RepoPilot-Ghost-Machine", Accept: "text/html" },
        cache: "no-store", signal: AbortSignal.timeout(12000),
      }).catch(() => null),
    ]);
    if (!orgResponse.ok && orgResponse.status !== 404) throw new Error("Could not load your GitHub organization memberships.");
    const orgRows = orgResponse.ok ? await orgResponse.json() as Array<{ organization: Org }> : [];
    const organizations = orgRows.map((row) => row.organization).filter(Boolean).map((org) => ({
      id: org.id, login: org.login, name: org.name || org.login,
      avatarUrl: org.avatar_url, url: org.html_url,
    }));
    const collection = analytics.data?.viewer?.contributionsCollection;
    const calendar = collection?.contributionCalendar;
    if (!collection || !calendar) throw new Error(analytics.errors?.[0]?.message || "GitHub did not return contribution history.");
    const achievementsHtml = profileResponse?.ok ? await profileResponse.text() : "";
    const achievements = extractAchievements(achievementsHtml);

    return NextResponse.json({
      year, currentYear, from: from.toISOString(), to: to.toISOString(),
      totalContributions: calendar.totalContributions,
      totalCommits: collection.totalCommitContributions,
      totalPullRequests: collection.totalPullRequestContributions,
      totalIssues: collection.totalIssueContributions,
      days: calendar.weeks.flatMap((week) => week.contributionDays),
      organizations,
      achievements,
      achievementsAvailable: achievements.length > 0,
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load GitHub analytics." }, { status: 502 });
  }
}
