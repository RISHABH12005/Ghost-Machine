import { NextRequest, NextResponse } from "next/server";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

type ContributionDay = { date: string; contributionCount: number; contributionLevel: string };
type CalendarResponse = {
  data?: { viewer?: { contributionsCollection?: { contributionCalendar?: { totalContributions: number; weeks: Array<{ contributionDays: ContributionDay[] }> } } } };
  errors?: Array<{ message: string }>;
};

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to view your contribution calendar." }, { status: 401 });

  const currentYear = new Date().getFullYear();
  const year = Number(request.nextUrl.searchParams.get("year") || currentYear);
  if (!Number.isInteger(year) || year < 2008 || year > currentYear) {
    return NextResponse.json({ error: "Select a valid contribution year." }, { status: 400 });
  }

  const from = new Date(Date.UTC(year, 0, 1)).toISOString();
  const to = (year === currentYear ? new Date() : new Date(Date.UTC(year, 11, 31, 23, 59, 59))).toISOString();
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
      body: JSON.stringify({ query, variables: { from, to } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: response.status === 401 ? "GitHub authorization expired. Sign in again." : "GitHub contribution data is temporarily unavailable." }, { status: response.status === 401 ? 401 : 502 });
    }
    const result = await response.json() as CalendarResponse;
    const calendar = result.data?.viewer?.contributionsCollection?.contributionCalendar;
    if (!calendar || result.errors?.length) {
      return NextResponse.json({ error: result.errors?.[0]?.message || "GitHub did not return contribution history." }, { status: 502 });
    }
    return NextResponse.json({
      year,
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks,
      syncedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load contribution history." }, { status: 502 });
  }
}
