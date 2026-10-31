import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type ContributionDay = { date: string; contributionCount: number; contributionLevel: string };
type GraphQLResult = {
  data?: { viewer?: { contributionsCollection?: { contributionCalendar?: { totalContributions: number; weeks: Array<{ contributionDays: ContributionDay[] }> } } } };
  errors?: Array<{ message: string }>;
};

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to view contribution insights." }, { status: 401 });
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  const query = `query ContributionCalendar($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel } }
        }
      }
    }
  }`;
  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables: { from: from.toISOString(), to: to.toISOString() } }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401) return NextResponse.json({ error: "GitHub authorization expired. Sign in again." }, { status: 401 });
    if (!response.ok) return NextResponse.json({ error: "GitHub contribution data is temporarily unavailable." }, { status: 502 });
    const result = await response.json() as GraphQLResult;
    const calendar = result.data?.viewer?.contributionsCollection?.contributionCalendar;
    if (!calendar) return NextResponse.json({ error: result.errors?.[0]?.message || "GitHub did not return contribution history." }, { status: 502 });
    const days = calendar.weeks.flatMap((week) => week.contributionDays);
    return NextResponse.json({
      totalContributions: calendar.totalContributions,
      days,
      from: from.toISOString(),
      to: to.toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load GitHub contribution history." }, { status: 502 });
  }
}
