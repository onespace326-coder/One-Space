-- OneSpace V32 — read-only schema and RLS audit
-- Run in Supabase SQL Editor against the same project configured in auth-config.js.
-- This query does not create, alter, or delete database objects.

WITH required(table_name, required_columns) AS (
  VALUES
    ('connected_accounts', ARRAY['id','user_id','provider','email','connection_status','scopes','updated_at']::text[]),
    ('email_messages', ARRAY['id','user_id','account_id','provider','provider_message_id','received_at','is_read','folder']::text[]),
    ('calendar_events', ARRAY['id','user_id','account_id','provider','title','starts_at','ends_at','is_cancelled']::text[]),
    ('tasks', ARRAY['id','user_id','title','description','due_at','priority','status']::text[]),
    ('daily_notes', ARRAY['user_id','note_date','content']::text[]),
    ('contacts', ARRAY['user_id','account_id','source','full_name','email']::text[]),
    ('drive_files', ARRAY['id','user_id','account_id','name','storage_provider','mime_type']::text[]),
    ('aries_profiles', ARRAY['user_id']::text[]),
    ('aries_memory_entries', ARRAY['id','user_id','entry_date','content']::text[]),
    ('aries_action_log', ARRAY['id','user_id','action_type','created_at']::text[]),
    ('scheduled_tasks', ARRAY['id','user_id','title','run_at','action_type','status']::text[]),
    ('scheduled_task_runs', ARRAY['id','task_id','started_at','status']::text[])
)
SELECT
  r.table_name,
  to_regclass(format('%I.%I','public',r.table_name)) IS NOT NULL AS table_exists,
  COALESCE((
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=r.table_name
  ), false) AS row_level_security_enabled,
  COALESCE((
    SELECT c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=r.table_name
  ), false) AS row_level_security_forced,
  COALESCE((
    SELECT array_agg(p.policyname ORDER BY p.policyname)
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=r.table_name
  ), ARRAY[]::text[]) AS rls_policies,
  ARRAY(
    SELECT cols.column_name
    FROM unnest(r.required_columns) AS cols(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns ic
      WHERE ic.table_schema='public'
        AND ic.table_name=r.table_name
        AND ic.column_name=cols.column_name
    )
    ORDER BY cols.column_name
  ) AS missing_columns
FROM required r
ORDER BY r.table_name;
