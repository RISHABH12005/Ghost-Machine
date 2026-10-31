import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type ContributionDay = { date: string; contributionCount: number; contributionLevel: string };
type Org = { id: number; node_id: string; login: string; name: string | null; avatar_url: string; html_url: string };
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
      id: String(org.id), nodeId: org.node_id, login: org.login, name: org.name || org.login,
      avatarUrl: org.avatar_url, url: org.html_url,
    }));
    const collection = analytics.data?.viewer?.contributionsCollection;
    const calendar = collection?.contributionCalendar;
    if (!collection || !calendar) throw new Error(analytics.errors?.[0]?.message || "GitHub did not return contribution history.");
    const achievementsHtml = profileResponse?.ok ? await profileResponse.text() : "";
    const achievements = extractAchievements(achievementsHtml);
    let organizationContributions: Array<{ id: string; nodeId: string; login: string; name: string; avatarUrl: string; url: string; contributions: number }> = organizations.map((org) => ({ ...org, contributions: 0 }));
    if (organizations.length) {
      const orgFields = organizations.slice(0, 20).map((org, index) =>
        `org${index}: contributionsCollection(organizationID: "${org.nodeId}", from: "${from.toISOString()}", to: "${to.toISOString()}") { contributionCalendar { totalContributions } }`
      ).join("\n");
      const orgQuery = `query OrganizationContributions { viewer { ${orgFields} } }`;
      try {
        const orgResult = await graphql(session.accessToken, orgQuery, {});
        organizationContributions = organizationContributions.map((org, index) => ({
          ...org,
          contributions: Number((orgResult.data?.viewer as Record<string, { contributionCalendar?: { totalContributions?: number } }> | undefined)?.[`org${index}`]?.contributionCalendar?.totalContributions || 0),
        }));
      } catch { /* Keep organization logos visible if GitHub does not expose org-scoped contribution totals. */ }
    }

    const quarters = [0, 1, 2, 3].map((quarter) => {
      const startMonth = quarter * 3;
      const startDate = new Date(Date.UTC(year, startMonth, 1));
      const endDate = new Date(Date.UTC(year, startMonth + 3, 0));
      const boundedEnd = endDate > to ? to : endDate;
      return { quarter: `Q${quarter + 1}`, from: startDate, to: boundedEnd, active: startDate <= to };
    });
    const searchCount = async (kind: "commits" | "pullRequests" | "issues", quarter: typeof quarters[number]) => {
      if (!quarter.active) return 0;
      const fromDate = quarter.from.toISOString().slice(0, 10);
      const toDate = quarter.to.toISOString().slice(0, 10);
      const query = kind === "commits"
        ? `author:${session.login} committer-date:${fromDate}..${toDate}`
        : kind === "pullRequests"
          ? `author:${session.login} is:pr created:${fromDate}..${toDate}`
          : `author:${session.login} is:issue -is:pr created:${fromDate}..${toDate}`;
      const endpoint = kind === "commits" ? "commits" : "issues";
      const response = await fetch(`https://api.github.com/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=1`, {
        headers: headers(session.accessToken), cache: "no-store", signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`GitHub could not load ${kind} activity for ${quarter.quarter}.`);
      const result = await response.json() as { total_count?: number };
      return result.total_count || 0;
    };
    const activitySeries = await Promise.all(quarters.map(async (quarter) => ({
      quarter: quarter.quarter,
      contributions: calendar.weeks.flatMap((week) => week.contributionDays)
        .filter((day) => day.date >= quarter.from.toISOString().slice(0, 10) && day.date <= quarter.to.toISOString().slice(0, 10))
        .reduce((sum, day) => sum + day.contributionCount, 0),
      commits: await searchCount("commits", quarter),
      pullRequests: await searchCount("pullRequests", quarter),
      issues: await searchCount("issues", quarter),
    })));

    return NextResponse.json({
      year, currentYear, from: from.toISOString(), to: to.toISOString(),
      totalContributions: calendar.totalContributions,
      totalCommits: collection.totalCommitContributions,
      totalPullRequests: collection.totalPullRequestContributions,
      totalIssues: collection.totalIssueContributions,
      days: calendar.weeks.flatMap((week) => week.contributionDays),
      organizations: organizationContributions,
      achievements,
      achievementsAvailable: achievements.length > 0,
      activitySeries,
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load GitHub analytics." }, { status: 502 });
  }
}
