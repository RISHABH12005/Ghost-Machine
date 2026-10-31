import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/github-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
