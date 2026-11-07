-- OneSpace V23 Security Hardening — PREPARE PHASE
-- Run this BEFORE deploying the V23 website files.
-- This phase only creates owner-checked RPCs. It does not revoke existing
-- table privileges, so the currently deployed V22 website keeps working.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_my_scheduled_task(
    p_title text,
    p_instructions text,
    p_run_at timestamp with time zone,
    p_timezone text,
    p_recurrence_day smallint,
    p_recurrence text,
    p_action_type text,
    p_action_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_task_id uuid;
    v_payload jsonb := COALESCE(p_action_payload, '{}'::jsonb);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) = 0
       OR pg_catalog.length(pg_catalog.btrim(p_title)) > 120 THEN
        RAISE EXCEPTION 'Task name must contain 1 to 120 characters.' USING ERRCODE = '22023';
    END IF;

    IF p_run_at IS NULL OR p_run_at <= pg_catalog.now() THEN
        RAISE EXCEPTION 'Choose a future run time.' USING ERRCODE = '22023';
    END IF;

    IF p_recurrence IS NULL OR p_recurrence NOT IN ('once', 'daily', 'weekly', 'monthly') THEN
        RAISE EXCEPTION 'Unsupported recurrence.' USING ERRCODE = '22023';
    END IF;

    IF p_recurrence_day IS NOT NULL AND p_recurrence_day NOT BETWEEN 1 AND 31 THEN
        RAISE EXCEPTION 'Recurrence day must be between 1 and 31.' USING ERRCODE = '22023';
    END IF;

    IF p_action_type IS NULL OR p_action_type NOT IN ('reminder', 'send_email', 'create_calendar_event') THEN
        RAISE EXCEPTION 'Unsupported scheduled action.' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
        RAISE EXCEPTION 'Action payload must be a JSON object.' USING ERRCODE = '22023';
    END IF;

    IF p_action_type = 'send_email' AND (
        NULLIF(pg_catalog.btrim(v_payload ->> 'to'), '') IS NULL OR
        NULLIF(pg_catalog.btrim(v_payload ->> 'subject'), '') IS NULL OR
        NULLIF(pg_catalog.btrim(v_payload ->> 'body'), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Email tasks require a recipient, subject and message.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.scheduled_tasks (
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
        locked_at,
        last_error,
        run_count
    )
    VALUES (
        v_user_id,
        pg_catalog.btrim(p_title),
        NULLIF(pg_catalog.btrim(COALESCE(p_instructions, '')), ''),
        p_run_at,
        COALESCE(NULLIF(pg_catalog.btrim(p_timezone), ''), 'Asia/Kolkata'),
        p_recurrence_day,
        p_recurrence,
        p_action_type,
        v_payload,
        'active',
        NULL,
        NULL,
        0
    )
    RETURNING id INTO v_task_id;

    RETURN v_task_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_scheduled_task(
    p_task_id uuid,
    p_title text,
    p_instructions text,
    p_run_at timestamp with time zone,
    p_timezone text,
    p_recurrence_day smallint,
    p_recurrence text,
    p_action_type text,
    p_action_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_current_status text;
    v_payload jsonb := COALESCE(p_action_payload, '{}'::jsonb);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_task_id IS NULL THEN
        RAISE EXCEPTION 'Task ID is required.' USING ERRCODE = '22023';
    END IF;

    SELECT task.status
      INTO v_current_status
      FROM public.scheduled_tasks AS task
     WHERE task.id = p_task_id
       AND task.user_id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Scheduled task not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_current_status = 'running' THEN
        RAISE EXCEPTION 'A running task cannot be edited.' USING ERRCODE = '55000';
    END IF;

    IF p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) = 0
       OR pg_catalog.length(pg_catalog.btrim(p_title)) > 120 THEN
        RAISE EXCEPTION 'Task name must contain 1 to 120 characters.' USING ERRCODE = '22023';
    END IF;

    IF p_run_at IS NULL OR p_run_at <= pg_catalog.now() THEN
        RAISE EXCEPTION 'Choose a future run time.' USING ERRCODE = '22023';
    END IF;

    IF p_recurrence IS NULL OR p_recurrence NOT IN ('once', 'daily', 'weekly', 'monthly') THEN
        RAISE EXCEPTION 'Unsupported recurrence.' USING ERRCODE = '22023';
    END IF;

    IF p_recurrence_day IS NOT NULL AND p_recurrence_day NOT BETWEEN 1 AND 31 THEN
        RAISE EXCEPTION 'Recurrence day must be between 1 and 31.' USING ERRCODE = '22023';
    END IF;

    IF p_action_type IS NULL OR p_action_type NOT IN ('reminder', 'send_email', 'create_calendar_event') THEN
        RAISE EXCEPTION 'Unsupported scheduled action.' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
        RAISE EXCEPTION 'Action payload must be a JSON object.' USING ERRCODE = '22023';
    END IF;

    IF p_action_type = 'send_email' AND (
        NULLIF(pg_catalog.btrim(v_payload ->> 'to'), '') IS NULL OR
        NULLIF(pg_catalog.btrim(v_payload ->> 'subject'), '') IS NULL OR
        NULLIF(pg_catalog.btrim(v_payload ->> 'body'), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Email tasks require a recipient, subject and message.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.scheduled_tasks AS task
       SET title = pg_catalog.btrim(p_title),
           instructions = NULLIF(pg_catalog.btrim(COALESCE(p_instructions, '')), ''),
           run_at = p_run_at,
           timezone = COALESCE(NULLIF(pg_catalog.btrim(p_timezone), ''), 'Asia/Kolkata'),
           recurrence_day = p_recurrence_day,
           recurrence = p_recurrence,
           action_type = p_action_type,
           action_payload = v_payload,
           status = 'active',
           locked_at = NULL,
           last_error = NULL,
           updated_at = pg_catalog.now()
     WHERE task.id = p_task_id
       AND task.user_id = v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_scheduled_task_status(
    p_task_id uuid,
    p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_current_status text;
    v_run_at timestamp with time zone;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_status IS NULL OR p_status NOT IN ('active', 'paused') THEN
        RAISE EXCEPTION 'Only pause and resume actions are allowed.' USING ERRCODE = '22023';
    END IF;

    SELECT task.status, task.run_at
      INTO v_current_status, v_run_at
      FROM public.scheduled_tasks AS task
     WHERE task.id = p_task_id
       AND task.user_id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Scheduled task not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_current_status NOT IN ('active', 'paused', 'failed') THEN
        RAISE EXCEPTION 'This task cannot be paused or resumed in its current state.' USING ERRCODE = '55000';
    END IF;

    IF p_status = 'active' AND v_run_at <= pg_catalog.now() THEN
        RAISE EXCEPTION 'Edit the task and choose a future time before resuming.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.scheduled_tasks AS task
       SET status = p_status,
           locked_at = NULL,
           last_error = CASE WHEN p_status = 'active' THEN NULL ELSE task.last_error END,
           updated_at = pg_catalog.now()
     WHERE task.id = p_task_id
       AND task.user_id = v_user_id;
END;
$function$;

-- These functions run with their owner's privileges but derive the row owner
-- exclusively from auth.uid(); browser callers cannot supply another user_id.
REVOKE ALL ON FUNCTION public.create_my_scheduled_task(text, text, timestamp with time zone, text, smallint, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_scheduled_task(text, text, timestamp with time zone, text, smallint, text, text, jsonb)
    TO authenticated;

REVOKE ALL ON FUNCTION public.update_my_scheduled_task(uuid, text, text, timestamp with time zone, text, smallint, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_scheduled_task(uuid, text, text, timestamp with time zone, text, smallint, text, text, jsonb)
    TO authenticated;

REVOKE ALL ON FUNCTION public.set_my_scheduled_task_status(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_scheduled_task_status(uuid, text)
    TO authenticated;

COMMIT;

SELECT
    p.proname AS function_name,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid IN (
      pg_catalog.to_regprocedure('public.create_my_scheduled_task(text,text,timestamptz,text,smallint,text,text,jsonb)'),
      pg_catalog.to_regprocedure('public.update_my_scheduled_task(uuid,text,text,timestamptz,text,smallint,text,text,jsonb)'),
      pg_catalog.to_regprocedure('public.set_my_scheduled_task_status(uuid,text)')
  )
ORDER BY p.proname;
