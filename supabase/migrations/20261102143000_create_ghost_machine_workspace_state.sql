-- Ghost-Machine workspace schema for Supabase PostgreSQL.
-- Safe to apply to a new Supabase project. This migration only creates the Supabase workspace table.

CREATE TABLE IF NOT EXISTS public.ghost_machine_workspace_state (
  github_login text PRIMARY KEY,
  ai_usage jsonb NOT NULL DEFAULT '{"total": 0, "chats": 0, "summaries": 0, "organization": 0}'::jsonb,
  activity jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_summaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_organization jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessments jsonb NOT NULL DEFAULT '{}'::jsonb,
  workspace jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Application access is server-side only through the server-side SUPABASE_DATABASE_URL connection.
-- Do not expose credentials or grant public/anon/authenticated access.
ALTER TABLE public.ghost_machine_workspace_state ENABLE ROW LEVEL SECURITY;

-- Verification queries (run after applying this migration):
-- SELECT COUNT(*) AS row_count FROM public.ghost_machine_workspace_state;
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'ghost_machine_workspace_state'
-- ORDER BY ordinal_position;
