-- OneSpace V23 Security Hardening — ENFORCE PHASE
-- Run AFTER deploying the V23 website files.
-- The V23 client explicitly selects only the safe account/task columns and
-- uses the owner-checked scheduled-task RPCs from SUPABASE_V23_PREPARE.sql.

BEGIN;

-- OAuth vault reference and opaque provider metadata must stay server-side.
-- Keep only fields the browser UI actually reads.
REVOKE SELECT ON TABLE public.connected_accounts FROM authenticated;
GRANT SELECT (
    id,
    user_id,
    provider,
    provider_account_id,
    email,
    display_name,
    scopes,
    connection_status,
    last_synced_at,
    created_at,
    updated_at
) ON TABLE public.connected_accounts TO authenticated;

-- Keep scheduled task reads limited to fields needed by the UI.
-- Worker internals (locked_at, last_run_at, run_count) are not exposed.
REVOKE SELECT ON TABLE public.scheduled_tasks FROM authenticated;
GRANT SELECT (
    id,
    user_id,
    title,
    instructions,
    run_at,
    timezone,
    recurrence_day,
    recurrence,
    action_type,
    action_payload,
    status,
    last_error,
    created_at,
    updated_at
) ON TABLE public.scheduled_tasks TO authenticated;

-- Browser clients can still delete their own tasks through the existing
-- owner DELETE RLS policy, but cannot insert or update worker-owned columns.
-- Creation, editing, pause and resume are handled by the three RPCs.
REVOKE INSERT, UPDATE ON TABLE public.scheduled_tasks FROM authenticated;

COMMIT;

-- Verification: expected account vault/metadata read = false;
-- safe account columns = true; task INSERT/UPDATE = false;
-- task DELETE = true; task RPC execute = true only for authenticated.
SELECT
    'connected_accounts' AS table_name,
    has_table_privilege('authenticated', 'public.connected_accounts', 'SELECT') AS full_table_select,
    has_column_privilege('authenticated', 'public.connected_accounts', 'email', 'SELECT') AS can_read_email,
    has_column_privilege('authenticated', 'public.connected_accounts', 'token_vault_ref', 'SELECT') AS can_read_token_vault_ref,
    has_column_privilege('authenticated', 'public.connected_accounts', 'metadata', 'SELECT') AS can_read_metadata;

SELECT
    'scheduled_tasks' AS table_name,
    has_table_privilege('authenticated', 'public.scheduled_tasks', 'SELECT') AS full_table_select,
    has_column_privilege('authenticated', 'public.scheduled_tasks', 'title', 'SELECT') AS can_read_title,
    has_table_privilege('authenticated', 'public.scheduled_tasks', 'INSERT') AS can_insert_directly,
    has_table_privilege('authenticated', 'public.scheduled_tasks', 'UPDATE') AS can_update_directly,
    has_table_privilege('authenticated', 'public.scheduled_tasks', 'DELETE') AS can_delete_own_tasks;

SELECT
    has_table_privilege('authenticated', 'public.scheduled_tasks', 'DELETE') AS can_delete_own_tasks,
    has_function_privilege('anon', 'public.create_my_scheduled_task(text,text,timestamp with time zone,text,smallint,text,text,jsonb)', 'EXECUTE') AS anon_can_create,
    has_function_privilege('authenticated', 'public.create_my_scheduled_task(text,text,timestamp with time zone,text,smallint,text,text,jsonb)', 'EXECUTE') AS authenticated_can_create,
    has_function_privilege('authenticated', 'public.update_my_scheduled_task(uuid,text,text,timestamp with time zone,text,smallint,text,text,jsonb)', 'EXECUTE') AS authenticated_can_update,
    has_function_privilege('authenticated', 'public.set_my_scheduled_task_status(uuid,text)', 'EXECUTE') AS authenticated_can_toggle;
