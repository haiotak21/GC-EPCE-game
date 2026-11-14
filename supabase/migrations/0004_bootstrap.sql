-- =============================================================================
-- Game for power unity! — 0004 bootstrap helpers
--
-- These set up a real event. Nothing here hardcodes a secret: the checkpoint
-- QR tokens are generated on demand and returned in plaintext exactly once,
-- so they live on your printed signs and nowhere in this repository (§18
-- "Do not expose secret API keys in the frontend").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Linking the three organizer accounts (§8)
--
-- Create the three users in Supabase Auth first (Dashboard > Authentication >
-- Add user, with email + password), then call this once per organizer to bind
-- that auth user to an admin row. Being in auth.users is NOT enough to get
-- admin powers — only a row here counts.
-- -----------------------------------------------------------------------------

create or replace function link_admin_account(
  p_email         text,
  p_auth_user_id  uuid,
  p_display_name  text,
  p_role          admin_role default 'lead_organizer'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into admins (auth_user_id, email, display_name, role)
  values (p_auth_user_id, lower(btrim(p_email)), p_display_name, p_role)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        display_name = excluded.display_name,
        role         = excluded.role,
        active       = true
  returning id into v_id;

  return jsonb_build_object('ok', true, 'admin_id', v_id, 'email', lower(btrim(p_email)));
end;
$$;

revoke execute on function link_admin_account(text, uuid, text, admin_role) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Creating the event
-- -----------------------------------------------------------------------------

create or replace function create_game(
  p_title text default 'Game for power unity!',
  p_help_request_limit integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
  i integer;
begin
  if exists (select 1 from games where status <> 'FINISHED') then
    return jsonb_build_object('ok', false, 'code', 'GAME_ALREADY_EXISTS');
  end if;

  insert into games (title, status, registration_open, help_request_limit)
  values (p_title, 'REGISTRATION', true, p_help_request_limit)
  returning id into v_game_id;

  -- Four empty clue slots for the admin to fill in (§11). They stay
  -- unpublished, so no student can see them yet.
  for i in 1..4 loop
    insert into hints (game_id, hint_number, title, content)
    values (v_game_id, i, 'Stage ' || i || ' — not written yet', null);
  end loop;

  return jsonb_build_object('ok', true, 'game_id', v_game_id);
end;
$$;

revoke execute on function create_game(text, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Checkpoint QR tokens (§6)
--
-- Returns the plaintext token for each stage ONCE. Only the hash is stored, so
-- a database dump never reveals the four codes. Encode each returned token in
-- the QR sign you print for that location.
--
-- Calling this again rotates the tokens and invalidates every previously
-- printed sign — useful if a code leaks mid-event.
-- -----------------------------------------------------------------------------

-- Output names deliberately differ from the checkpoints column names
-- (stage_number / location_label) so the ON CONFLICT target below is
-- unambiguous inside plpgsql.
create or replace function provision_checkpoints(p_locations text[] default null)
returns table (stage integer, label text, qr_token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
  v_labels  text[] := coalesce(p_locations, array['Stage 1','Stage 2','Stage 3','Stage 4']);
  i integer;
  v_token text;
begin
  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    raise exception 'no active game; call create_game() first';
  end if;

  for i in 1..4 loop
    -- url-safe, unguessable, and short enough to retype if a camera fails
    v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));

    insert into checkpoints (game_id, stage_number, location_label, verification_token_hash)
    values (v_game_id, i, v_labels[i], digest(v_token, 'sha256'))
    on conflict (game_id, stage_number) do update
      set verification_token_hash = excluded.verification_token_hash,
          location_label          = excluded.location_label,
          active                  = true;

    stage    := i;
    label    := v_labels[i];
    qr_token := v_token;
    return next;
  end loop;
end;
$$;

revoke execute on function provision_checkpoints(text[]) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Turning on the on-site second factor for a checkpoint (§6)
--
-- Use this for any location where a photographed QR is a real risk. Afterwards
-- a scan alone is refused; the student must also enter the code an organizer
-- reads out at the location.
-- -----------------------------------------------------------------------------

create or replace function set_checkpoint_organizer_code(
  p_stage integer,
  p_code  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
begin
  select id into v_game_id from games where status <> 'FINISHED' limit 1;

  update checkpoints
  set requires_organizer_code = (p_code is not null),
      organizer_code_hash     = case when p_code is null
                                     then null
                                     else digest(upper(btrim(p_code)), 'sha256') end
  where game_id = v_game_id and stage_number = p_stage;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'stage', p_stage, 'enabled', p_code is not null);
end;
$$;

revoke execute on function set_checkpoint_organizer_code(integer, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime (§16)
--
-- Supabase Realtime respects RLS, so each student receives only the rows their
-- policies already allow. Adding the tables to the publication is all that is
-- needed; no extra authorization layer.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      games, groups, group_members, hints,
      checkpoint_verifications, notifications, notification_recipients,
      help_requests, winners;
  end if;
exception when duplicate_object then
  null;  -- already added
end $$;
