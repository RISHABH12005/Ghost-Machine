import { NextRequest, NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, sealSession } from "@/lib/github-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const configuredRedirect = process.env.GITHUB_REDIRECT_URI;
  const redirectUri = configuredRedirect || (process.env.NODE_ENV === "production" ? "" : new URL("/api/auth/callback", request.url).toString());

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(reason)}`, request.url));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };
  if (!clientId || !clientSecret || !process.env.AUTH_SECRET || !redirectUri) return fail("oauth_not_configured");
  if (!code || !state || !expectedState || state !== expectedState) return fail("oauth_state_invalid");

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) return fail("oauth_exchange_failed");
    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) return fail("oauth_exchange_failed");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return fail("github_profile_failed");
    const user = await userResponse.json() as { login: string; name?: string | null; avatar_url?: string | null };
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(SESSION_COOKIE, sealSession({ accessToken: tokenData.access_token, login: user.login, name: user.name, avatarUrl: user.avatar_url }), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch {
    return fail("oauth_exchange_failed");
  }
}
