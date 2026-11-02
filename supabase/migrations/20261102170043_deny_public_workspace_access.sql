-- Defense in depth: the browser-facing Supabase roles must never access workspace rows.
-- The application uses its server-side PostgreSQL connection instead.
CREATE POLICY "deny_browser_workspace_access"
ON public.ghost_machine_workspace_state
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
