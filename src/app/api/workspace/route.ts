import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
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

let sqlClient: ReturnType<typeof postgres> | undefined;

function getSql() {
  if (sqlClient) return sqlClient;

  // Prefer Supabase. DATABASE_URL is a temporary rollback fallback during cutover.
  const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

  sqlClient = postgres(connectionString, {
    max: 2,
    prepare: false,
    ssl: "require",
    connect_timeout: 15,
    idle_timeout: 20,
    connection: { application_name: "ghost-machine" },
  });

  return sqlClient;
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

export async function GET(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to load your saved workspace." }, { status: 401, headers: responseHeaders() });

  try {
    const sql = getSql();
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
    return NextResponse.json({ error: "Could not load saved workspace data.", errorCode: detail.code || detail.name }, { status: 503, headers: responseHeaders() });
  }
}

export async function PUT(request: NextRequest) {
  const session = openSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with GitHub to save your workspace." }, { status: 401, headers: responseHeaders() });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin workspace updates are not allowed." }, { status: 403, headers: responseHeaders() });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_500_000) return NextResponse.json({ error: "Workspace data is too large to save." }, { status: 413, headers: responseHeaders() });

  try {
    const body = asRecord(await request.json());
    const aiUsage = safeUsage(body.aiUsage);
    const activity = safeActivity(body.activity);
    const aiSummaries = asRecord(body.aiSummaries);
    const aiOrganization = asRecord(body.aiOrganization);
    const assessments = asRecord(body.assessments);
    const workspace = safeWorkspace(body.workspace);
    const serialized = JSON.stringify({ aiUsage, activity, aiSummaries, aiOrganization, assessments, workspace });
    if (new TextEncoder().encode(serialized).byteLength > 1_500_000) {
      return NextResponse.json({ error: "Workspace data is too large to save." }, { status: 413, headers: responseHeaders() });
    }

    const sql = getSql();
    await sql`
      INSERT INTO public.ghost_machine_workspace_state
        (github_login, ai_usage, activity, ai_summaries, ai_organization, assessments, workspace, updated_at)
      VALUES (
        ${session.login.toLowerCase()},
        ${JSON.stringify(aiUsage)}::jsonb,
        ${JSON.stringify(activity)}::jsonb,
        ${JSON.stringify(aiSummaries)}::jsonb,
        ${JSON.stringify(aiOrganization)}::jsonb,
        ${JSON.stringify(assessments)}::jsonb,
        ${JSON.stringify(workspace)}::jsonb,
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
    return NextResponse.json({ saved: true }, { headers: responseHeaders() });
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error("[workspace] PUT failed", JSON.stringify({
      ...detail,
      operation: "PUT",
      supabaseConfigured: Boolean(process.env.SUPABASE_DATABASE_URL),
      temporaryFallbackConfigured: Boolean(process.env.DATABASE_URL),
    }));
    return NextResponse.json({ error: "Could not save workspace data.", errorCode: detail.code || detail.name }, { status: 503, headers: responseHeaders() });
  }
}
