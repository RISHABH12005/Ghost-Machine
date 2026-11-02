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

export type WorkspaceAiChatMessage = { role: "user" | "assistant"; content: string };

function toAiUsage(value: unknown): AiUsage {
  const raw = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : (value || {}) as Record<string, unknown>;
  return {
    total: count(raw.total),
    chats: count(raw.chats),
    summaries: count(raw.summaries),
    organization: count(raw.organization),
  };
}

/** Load the full saved transcript. Chat history is stored separately from autosaved workspace settings. */
export async function loadWorkspaceAiChatMessages(githubLogin: string, repositoryFullName: string): Promise<WorkspaceAiChatMessage[]> {
  const sql = getWorkspaceSql();
  const login = githubLogin.toLowerCase();
  const repository = repositoryFullName.toLowerCase();
  const rows = await sql`
    SELECT role, content
    FROM public.ghost_machine_ai_chat_messages
    WHERE github_login = ${login}
      AND repository_full_name = ${repository}
      AND conversation_id = 'default'
    ORDER BY id ASC
  `;
  if (rows.length) {
    return rows.flatMap((row) => {
      if ((row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") return [];
      return [{ role: row.role, content: row.content }];
    });
  }

  // One-time compatibility migration: older builds stored up to 60 chat turns
  // inside the autosaved workspace JSON. Move those messages into the history table.
  const legacy = await sql`
    SELECT workspace->'aiChatMessages' AS messages
    FROM public.ghost_machine_workspace_state
    WHERE github_login = ${login}
    LIMIT 1
  `;
  const raw = legacy[0]?.messages as unknown;
  const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  const legacyMessages: WorkspaceAiChatMessage[] = Array.isArray(parsed) ? parsed.flatMap((entry): WorkspaceAiChatMessage[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string" || !item.content.trim()) return [];
    return [{ role: item.role as WorkspaceAiChatMessage["role"], content: item.content }];
  }) : [];
  if (legacyMessages.length) {
    await sql.begin(async (transaction) => {
      for (const message of legacyMessages) {
        await transaction`
          INSERT INTO public.ghost_machine_ai_chat_messages
            (github_login, repository_full_name, conversation_id, role, content)
          VALUES (${login}, ${repository}, 'default', ${message.role}, ${message.content})
        `;
      }
    });
  }
  return legacyMessages;
}

/** Save both sides of a successful AI turn and increment the account usage counter atomically. */
export async function recordWorkspaceAiChatTurn(
  githubLogin: string,
  repositoryFullName: string,
  userMessage: string,
  assistantReply: string,
): Promise<AiUsage> {
  const sql = getWorkspaceSql();
  const login = githubLogin.toLowerCase();
  const repository = repositoryFullName.toLowerCase();

  return sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO public.ghost_machine_ai_chat_messages
        (github_login, repository_full_name, conversation_id, role, content)
      VALUES
        (${login}, ${repository}, 'default', 'user', ${userMessage}),
        (${login}, ${repository}, 'default', 'assistant', ${assistantReply})
    `;

    const rows = await transaction`
      INSERT INTO public.ghost_machine_workspace_state AS current_state (github_login, ai_usage)
      VALUES (
        ${login},
        '{"total":1,"chats":1,"summaries":0,"organization":0}'::jsonb
      )
      ON CONFLICT (github_login) DO UPDATE SET
        ai_usage = jsonb_build_object(
          'total', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'total', '')::integer, 0) + 1, 1000000000),
          'chats', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'chats', '')::integer, 0) + 1, 1000000000),
          'summaries', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'summaries', '')::integer, 0), 1000000000),
          'organization', LEAST(COALESCE(NULLIF(current_state.ai_usage->>'organization', '')::integer, 0), 1000000000)
        ),
        updated_at = now()
      RETURNING ai_usage
    `;
    return toAiUsage(rows[0]?.ai_usage);
  });
}

/** Start a fresh conversation for one repository without affecting other repositories or usage totals. */
export async function clearWorkspaceAiChat(githubLogin: string, repositoryFullName: string): Promise<void> {
  const sql = getWorkspaceSql();
  await sql`
    DELETE FROM public.ghost_machine_ai_chat_messages
    WHERE github_login = ${githubLogin.toLowerCase()}
      AND repository_full_name = ${repositoryFullName.toLowerCase()}
      AND conversation_id = 'default'
  `;
}

/** Remove all saved AI chat transcripts for an account when its workspace is reset. */
export async function clearAllWorkspaceAiChats(githubLogin: string): Promise<void> {
  const sql = getWorkspaceSql();
  await sql`
    DELETE FROM public.ghost_machine_ai_chat_messages
    WHERE github_login = ${githubLogin.toLowerCase()}
  `;
}

