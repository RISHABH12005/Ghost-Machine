import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getWorkspaceSql } from "@/lib/workspace/database";
import { openSession, SESSION_COOKIE } from "@/lib/auth/github-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
const EMPTY_USAGE = { total: 0, chats: 0, summaries: 0, organization: 0 };
const VALID_STATUSES = new Set(["Not assessed", "Needs review", "In progress", "Needs attention", "Completed", "On hold"]);

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeUsage(value: unknown) {
  const usage = asRecord(value);
  const count = (key: string) => {
    const number = Number(usage[key]);
    return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 1_000_000_000) : 0;
  };
  return { total: count("total"), chats: count("chats"), summaries: count("summaries"), organization: count("organization") };
}

function safeActivity(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    const item = asRecord(entry);
    if (typeof item.message !== "string" || typeof item.time !== "string") return [];
    return [{ id: typeof item.id === "string" ? item.id.slice(0, 120) : randomUUID(), message: item.message.slice(0, 1200), time: item.time.slice(0, 120) }];
  });
}

function safeWorkspace(value: unknown) {
  const workspace = asRecord(value);
  const rawStatuses = asRecord(workspace.statuses);
  const statuses = Object.fromEntries(Object.entries(rawStatuses).filter(([id, status]) => /^\d{1,20}$/.test(id) && typeof status === "string" && VALID_STATUSES.has(status)));
  const messages = Array.isArray(workspace.aiChatMessages) ? workspace.aiChatMessages.slice(-60).flatMap((entry) => {
    const item = asRecord(entry);
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
    return [{ role: item.role, content: item.content.slice(0, 4000) }];
  }) : [];
  return { statuses, aiChatMessages: messages };
}


function describeDatabaseError(error: unknown) {
  const value = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof value.code === "string" ? value.code : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  return { name, code, message: message.slice(0, 500) };
}

function responseHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function isSameOriginRequest(request: NextRequest, operation: string) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  // Render terminates public HTTPS and forwards requests to Next.js over HTTP.
  const configuredOrigin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  try {
    const expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;
    const receivedOrigin = new URL(origin).origin;
    if (receivedOrigin === expectedOrigin) return true;
    console.warn("[workspace] Rejected cross-origin request", JSON.stringify({ operation, receivedOrigin, expectedOrigin }));
    return false;
  } catch {
    console.warn("[workspace] Rejected invalid request origin", JSON.stringify({ operation }));
    return false;
  }
}

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to load your saved workspace." }, { status: 401, headers: responseHeaders() });

  try {
    const sql = getWorkspaceSql();
    const rows = await sql`
      SELECT ai_usage, activity, ai_summaries, ai_organization, assessments, workspace, updated_at
      FROM public.ghost_machine_workspace_state
      WHERE github_login = ${session.login.toLowerCase()}
      LIMIT 1
    `;
    const row = rows[0] as JsonRecord | undefined;
    if (!row) return NextResponse.json({
      exists: false,
      aiUsage: EMPTY_USAGE, activity: [], aiSummaries: {}, aiOrganization: null,
      assessments: {}, workspace: { statuses: {}, aiChatMessages: [] }, updatedAt: null,
    }, { headers: responseHeaders() });

    const organization = asRecord(row.ai_organization);
    return NextResponse.json({
      exists: true,
      aiUsage: safeUsage(row.ai_usage),
      activity: safeActivity(row.activity),
      aiSummaries: asRecord(row.ai_summaries),
      aiOrganization: Object.keys(organization).length ? organization : null,
      assessments: asRecord(row.assessments),
      workspace: safeWorkspace(row.workspace),
      updatedAt: row.updated_at,
    }, { headers: responseHeaders() });
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error("[workspace] GET failed", JSON.stringify({ ...detail, operation: "GET" }));
    return NextResponse.json({ error: "Could not load saved workspace data.", errorCode: detail.code || detail.name, errorDetail: detail.message.slice(0, 300) }, { status: 503, headers: responseHeaders() });
  }
}

export async function PUT(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to save your workspace." }, { status: 401, headers: responseHeaders() });

  if (!isSameOriginRequest(request, "PUT")) {
    return NextResponse.json({ error: "Cross-origin workspace updates are not allowed." }, { status: 403, headers: responseHeaders() });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_500_000) return NextResponse.json({ error: "Workspace data is too large to save." }, { status: 413, headers: responseHeaders() });

  try {
    const body = asRecord(await request.json());
    const activity = safeActivity(body.activity);
    const aiSummaries = asRecord(body.aiSummaries);
    const aiOrganization = asRecord(body.aiOrganization);
    const assessments = asRecord(body.assessments);
    const workspace = safeWorkspace(body.workspace);
    const serialized = JSON.stringify({ activity, aiSummaries, aiOrganization, assessments, workspace });
    if (new TextEncoder().encode(serialized).byteLength > 1_500_000) {
      return NextResponse.json({ error: "Workspace data is too large to save." }, { status: 413, headers: responseHeaders() });
    }

    const sql = getWorkspaceSql();
    await sql`
      INSERT INTO public.ghost_machine_workspace_state
        (github_login, activity, ai_summaries, ai_organization, assessments, workspace, updated_at)
      VALUES (
        ${session.login.toLowerCase()},
        ${JSON.stringify(activity)}::jsonb,
        ${JSON.stringify(aiSummaries)}::jsonb,
        ${JSON.stringify(aiOrganization)}::jsonb,
        ${JSON.stringify(assessments)}::jsonb,
        ${JSON.stringify(workspace)}::jsonb,
        now()
      )
      ON CONFLICT (github_login) DO UPDATE SET
        activity = EXCLUDED.activity,
        ai_summaries = EXCLUDED.ai_summaries,
        ai_organization = EXCLUDED.ai_organization,
        assessments = EXCLUDED.assessments,
        workspace = EXCLUDED.workspace,
        updated_at = now()
    `;
    console.info("[workspace] PUT saved", JSON.stringify({ operation: "PUT", supabaseConfigured: Boolean(process.env.SUPABASE_DATABASE_URL) }));
    return NextResponse.json({ saved: true }, { headers: responseHeaders() });
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error("[workspace] PUT failed", JSON.stringify({
      ...detail,
      operation: "PUT",
      supabaseConfigured: Boolean(process.env.SUPABASE_DATABASE_URL),
      temporaryFallbackConfigured: Boolean(process.env.DATABASE_URL),
    }));
    return NextResponse.json({ error: "Could not save workspace data.", errorCode: detail.code || detail.name, errorDetail: detail.message.slice(0, 300) }, { status: 503, headers: responseHeaders() });
  }
}

export async function DELETE(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to clear your workspace." }, { status: 401, headers: responseHeaders() });
  if (!isSameOriginRequest(request, "DELETE")) {
    return NextResponse.json({ error: "Cross-origin workspace updates are not allowed." }, { status: 403, headers: responseHeaders() });
  }

  try {
    const sql = getWorkspaceSql();
    await sql`
      INSERT INTO public.ghost_machine_workspace_state
        (github_login, ai_usage, activity, ai_summaries, ai_organization, assessments, workspace, updated_at)
      VALUES (
        ${session.login.toLowerCase()},
        ${JSON.stringify(EMPTY_USAGE)}::jsonb,
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
        '{"statuses":{},"aiChatMessages":[]}'::jsonb,
        now()
      )
      ON CONFLICT (github_login) DO UPDATE SET
        ai_usage = EXCLUDED.ai_usage,
        activity = EXCLUDED.activity,
        ai_summaries = EXCLUDED.ai_summaries,
        ai_organization = EXCLUDED.ai_organization,
        assessments = EXCLUDED.assessments,
        workspace = EXCLUDED.workspace,
        updated_at = now()
    `;
    console.info("[workspace] DELETE cleared", JSON.stringify({ operation: "DELETE" }));
    return NextResponse.json({ cleared: true }, { headers: responseHeaders() });
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error("[workspace] DELETE failed", JSON.stringify({ ...detail, operation: "DELETE" }));
    return NextResponse.json({ error: "Could not clear saved workspace data.", errorCode: detail.code || detail.name }, { status: 503, headers: responseHeaders() });
  }
}

