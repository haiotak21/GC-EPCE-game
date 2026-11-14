-- =============================================================================
-- Game for power unity! — 0020 checkpoint codes must never change by themselves
--
-- THE BUG
--
-- Every call to issue_checkpoint_code minted a brand-new code and overwrote
-- the stored one. Only the SHA-256 hash was kept, so there was no way to look
-- a code up again — the only way to SEE a code was to generate a new one, and
-- generating destroyed the previous one.
--
-- That made "show me the code" and "replace the code" the same action. An
-- organizer who clicked "Generate code", wrote EPCEFZZK on the sign, then
-- clicked "Generate QR" on the same clue had already invalidated the sign.
-- The student typed a code that was correct an hour ago and was told it was
-- wrong. Regenerating appeared to "fix" it because the newest code is the
-- only one that ever worked.
--
-- THE FIX
--
-- 1. Store the code in plain text (`code_plain`) so it can be read back.
--    This is not a secret: it is printed on a sign in a public place, and it
--    is only half of the check — a checkpoint may also require the separate
--    organizer code, which stays hashed. `checkpoints` is admin-only under
--    RLS (checkpoints_select_admin_only), so students still cannot read it.
--
-- 2. issue_checkpoint_code is now GET-OR-CREATE. Called again for the same
--    stage and group it returns the SAME code, for as long as the game lasts.
--    Print the sign in the morning, play in the evening: the code still works.
--
-- 3. Rotating a code is now a separate, deliberate call:
--    regenerate_checkpoint_code(). For a leak, or a photographed sign.
--
-- Deliberately NOT done: automatic expiry after N hours. That is the exact
-- failure above on a timer — a sign printed before a delayed start would die
-- untouched. Rotation stays a decision an organizer makes, never a clock.
--
-- NOTE FOR EXISTING GAMES: codes issued before this migration were only ever
-- stored as a hash, so they cannot be recovered. Those clues will show as
-- "needs a code" and the first click issues one — which is then permanent.
-- Regenerate each clue once after running this, before printing the signs.
--
-- Safe to run more than once.
-- =============================================================================

alter table checkpoints add column if not exists code_plain   text;
alter table checkpoints add column if not exists code_set_at  timestamptz;

comment on column checkpoints.code_plain is
  'The checkpoint code as printed on the sign. Readable so an organizer can '
  'look it up without rotating it. Not a secret: it is on a public sign, and '
  'checkpoints is admin-only under RLS.';

-- -----------------------------------------------------------------------------
-- Get-or-create. The same stage + group always returns the same code.
-- -----------------------------------------------------------------------------

create or replace function issue_checkpoint_code(
  p_stage        integer,
  p_group_number integer default null,
  p_location     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin    uuid := current_admin_id();
  v_game_id  uuid;
  v_existing checkpoints%rowtype;
  v_token    text;
  v_label    text;
  v_tries    integer := 0;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_stage not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;

  select id into v_game_id from games order by created_at desc limit 1;
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- Lock the row so two organizers tapping at once cannot mint two codes and
  -- leave one of them holding a dead one.
  select * into v_existing
  from checkpoints c
  where c.game_id = v_game_id
    and c.stage_number = p_stage
    and c.group_number is not distinct from p_group_number
  for update;

  v_label := coalesce(
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(v_existing.location_label, '')), ''),
    'Stage ' || p_stage
  );

  -- Already has a readable code? Hand back that one. Nothing is rewritten.
  if found and v_existing.code_plain is not null then
    if v_existing.location_label is distinct from v_label or not v_existing.active then
      update checkpoints
      set location_label = v_label, active = true
      where id = v_existing.id;
    end if;

    return jsonb_build_object(
      'ok', true, 'code', 'EXISTING', 'token', v_existing.code_plain,
      'label', v_label, 'set_at', v_existing.code_set_at
    );
  end if;

  -- No code yet (or a pre-0020 hash-only one we cannot read back): mint once.
  loop
    v_token := generate_checkpoint_code();
    exit when not exists (
      select 1 from checkpoints where verification_token_hash = digest(v_token, 'sha256')
    );
    v_tries := v_tries + 1;
    if v_tries > 20 then
      return jsonb_build_object('ok', false, 'code', 'COULD_NOT_GENERATE');
    end if;
  end loop;

  if found then
    update checkpoints
    set verification_token_hash = digest(v_token, 'sha256'),
        code_plain              = v_token,
        code_set_at             = now(),
        location_label          = v_label,
        active                  = true
    where id = v_existing.id;
  else
    insert into checkpoints (game_id, group_number, stage_number, location_label,
                             verification_token_hash, code_plain, code_set_at)
    values (v_game_id, p_group_number, p_stage, v_label,
            digest(v_token, 'sha256'), v_token, now());
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game_id, v_admin, 'ISSUE_CHECKPOINT_CODE',
          jsonb_build_object('stage', p_stage, 'group_number', p_group_number));

  return jsonb_build_object('ok', true, 'code', 'ISSUED', 'token', v_token,
                            'label', v_label, 'set_at', now());
end;
$$;

-- -----------------------------------------------------------------------------
-- Deliberate rotation, for a leaked or photographed sign.
-- -----------------------------------------------------------------------------

create or replace function regenerate_checkpoint_code(
  p_stage        integer,
  p_group_number integer default null,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game_id uuid;
  v_row     checkpoints%rowtype;
  v_token   text;
  v_tries   integer := 0;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_stage not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;

  select id into v_game_id from games order by created_at desc limit 1;
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select * into v_row
  from checkpoints c
  where c.game_id = v_game_id
    and c.stage_number = p_stage
    and c.group_number is not distinct from p_group_number
  for update;

  -- Nothing to rotate yet: fall through to a first issue, so the button is
  -- never a dead end.
  if not found then
    return issue_checkpoint_code(p_stage, p_group_number, null);
  end if;

  loop
    v_token := generate_checkpoint_code();
    exit when not exists (
      select 1 from checkpoints where verification_token_hash = digest(v_token, 'sha256')
    );
    v_tries := v_tries + 1;
    if v_tries > 20 then
      return jsonb_build_object('ok', false, 'code', 'COULD_NOT_GENERATE');
    end if;
  end loop;

  update checkpoints
  set verification_token_hash = digest(v_token, 'sha256'),
      code_plain              = v_token,
      code_set_at             = now(),
      active                  = true
  where id = v_row.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game_id, v_admin, 'REGENERATE_CHECKPOINT_CODE',
          jsonb_build_object('stage', p_stage, 'group_number', p_group_number,
                             'reason', nullif(btrim(coalesce(p_reason,'')), ''),
                             'replaced_code', v_row.code_plain));

  return jsonb_build_object('ok', true, 'code', 'REGENERATED', 'token', v_token,
                            'label', v_row.location_label, 'set_at', now());
end;
$$;

-- -----------------------------------------------------------------------------
-- Deliberately untouched: admin_set_checkpoint_code.
--
-- Despite the name it sets the ORGANIZER code — the word an organizer says
-- out loud at a checkpoint so a photographed QR is not enough on its own.
-- That one is a real secret and stays hashed and unreadable. Only the
-- checkpoint code printed on the sign is stored in plain text above.
-- -----------------------------------------------------------------------------

grant execute on function
  regenerate_checkpoint_code(integer, integer, text)
  to authenticated;
