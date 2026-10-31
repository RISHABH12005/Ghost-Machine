import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE } from "@/lib/github-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const configuredRedirect = process.env.GITHUB_REDIRECT_URI;
  if (!clientId || (process.env.NODE_ENV === "production" && !configuredRedirect)) return NextResponse.redirect(new URL("/?auth_error=oauth_not_configured", request.url));
  const state = randomBytes(32).toString("hex");
  const redirectUri = configuredRedirect || new URL("/api/auth/callback", request.url).toString();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "read:user repo");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
