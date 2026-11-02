-- Workspace state is accessed only by the server-side PostgreSQL connection.
-- The public Data API and browser roles must not read or write workspace state.
REVOKE ALL PRIVILEGES ON TABLE public.ghost_machine_workspace_state FROM anon, authenticated;
