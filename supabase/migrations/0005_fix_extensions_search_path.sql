-- =============================================================================
-- GC Campus Mystery Hunt — 0005 fix: make pgcrypto reachable from the RPCs
--
-- Supabase installs pgcrypto into the `extensions` schema, not `public`.
-- Migrations 0002 and 0004 pinned `search_path = public, pg_temp`, which left
-- gen_random_bytes() and digest() invisible, so provision_checkpoints() and
-- register_participant() failed with:
--
--   ERROR: 42883: function gen_random_bytes(integer) does not exist
--
-- This adds `extensions` to the search path of every SECURITY DEFINER
-- function. Naming a schema that does not exist is harmless, so this is also
-- safe on a plain Postgres where pgcrypto sits in public.
--
-- Safe to run more than once.
-- =============================================================================

-- Belt and braces: on Supabase both of these are no-ops.
create schema if not exists extensions;
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create extension pgcrypto with schema extensions;
  end if;
end $$;

-- --- 0002: identity helpers ---------------------------------------------------
alter function current_participant_id()        set search_path = public, extensions, pg_temp;
alter function current_admin_id()              set search_path = public, extensions, pg_temp;
alter function is_admin()                      set search_path = public, extensions, pg_temp;
alter function current_group_id()              set search_path = public, extensions, pg_temp;
alter function group_completed_stage(uuid)     set search_path = public, extensions, pg_temp;

-- --- 0002: rate limiting ------------------------------------------------------
alter function check_rate_limit(text, text, integer, interval)
  set search_path = public, extensions, pg_temp;

-- --- 0002: registration and recovery (use digest + gen_random_bytes) ----------
alter function register_participant(text)      set search_path = public, extensions, pg_temp;
alter function redeem_recovery_code(text)      set search_path = public, extensions, pg_temp;

-- --- 0002: teams --------------------------------------------------------------
alter function preview_team_assignment()       set search_path = public, extensions, pg_temp;
alter function publish_team_assignment(jsonb)  set search_path = public, extensions, pg_temp;
alter function set_group_name(uuid, text, integer)
  set search_path = public, extensions, pg_temp;

-- --- 0002: gameplay (verify_checkpoint uses digest) ---------------------------
alter function verify_checkpoint(text, text)   set search_path = public, extensions, pg_temp;
alter function create_help_request(text, integer)
  set search_path = public, extensions, pg_temp;
alter function answer_help_request(uuid, text) set search_path = public, extensions, pg_temp;

-- --- 0002: notifications ------------------------------------------------------
alter function send_notification(text, text, notification_type, notification_audience, uuid[], text)
  set search_path = public, extensions, pg_temp;
alter function mark_notification_read(uuid)    set search_path = public, extensions, pg_temp;

-- --- 0002: winners and status -------------------------------------------------
alter function set_winner_selection(jsonb)     set search_path = public, extensions, pg_temp;
alter function reveal_winners()                set search_path = public, extensions, pg_temp;
alter function set_game_status(game_status)    set search_path = public, extensions, pg_temp;

-- --- 0004: bootstrap (provision_checkpoints uses gen_random_bytes) ------------
alter function link_admin_account(text, uuid, text, admin_role)
  set search_path = public, extensions, pg_temp;
alter function create_game(text, integer)      set search_path = public, extensions, pg_temp;
alter function provision_checkpoints(text[])   set search_path = public, extensions, pg_temp;
alter function set_checkpoint_organizer_code(integer, text)
  set search_path = public, extensions, pg_temp;
