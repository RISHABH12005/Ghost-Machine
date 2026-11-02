import postgres from "postgres";

export type AiUsageKind = "chats" | "summaries" | "organization";
export type AiUsage = { total: number; chats: number; summaries: number; organization: number };

let sqlClient: ReturnType<typeof postgres> | undefined;

export function getWorkspaceSql() {
  if (sqlClient) return sqlClient;

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

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 1_000_000_000) : 0;
}

/** Increment usage atomically on the server so stale browser autosaves cannot overwrite counters. */
export async function incrementWorkspaceAiUsage(githubLogin: string, kind: AiUsageKind): Promise<AiUsage> {
  const sql = getWorkspaceSql();
  const initialUsage = {
    total: 1,
    chats: kind === "chats" ? 1 : 0,
    summaries: kind === "summaries" ? 1 : 0,
    organization: kind === "organization" ? 1 : 0,
  };

  const rows = await sql`
    INSERT INTO public.ghost_machine_workspace_state AS current_state (github_login, ai_usage)
    VALUES (${githubLogin.toLowerCase()}, ${JSON.stringify(initialUsage)}::jsonb)
    ON CONFLICT (github_login) DO UPDATE SET
      ai_usage = jsonb_build_object(
        'total', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'total', '')::integer, 0) + 1, 1000000000),
        'chats', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'chats', '')::integer, 0) + CASE WHEN ${kind} = 'chats' THEN 1 ELSE 0 END, 1000000000),
        'summaries', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'summaries', '')::integer, 0) + CASE WHEN ${kind} = 'summaries' THEN 1 ELSE 0 END, 1000000000),
        'organization', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'organization', '')::integer, 0) + CASE WHEN ${kind} = 'organization' THEN 1 ELSE 0 END, 1000000000)
      ),
      updated_at = now()
    RETURNING ai_usage
  `;

  const raw = rows[0]?.ai_usage as unknown;
  const usage = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : (raw || {}) as Record<string, unknown>;
  return {
    total: count(usage.total),
    chats: count(usage.chats),
    summaries: count(usage.summaries),
    organization: count(usage.organization),
  };
}
