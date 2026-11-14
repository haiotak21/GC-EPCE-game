-- =============================================================================
-- Game for power unity! — 0018 the corrections organizers will need on the day
--
-- Everything here exists because something will go wrong in front of 30 people
-- and nobody will want to open a SQL editor:
--
--   * a student registers twice, or a stranger joins       -> remove / reinstate
--   * someone ends up in the wrong team                    -> move them
--   * a checkpoint is verified by mistake                  -> undo it
--   * a team deserves one more hint                        -> grant an extra
--   * the prize money or help allowance changes            -> settings
--   * a checkpoint needs an on-site code                   -> switch it on
--   * an auto-awarded placing turns out to be wrong        -> correct it
--
-- Every one of these is admin-only and written to the audit log, so the other
-- two organizers can see what was changed and by whom.
--
-- Safe to run more than once.
-- =============================================================================

-- Extra help requests granted to a team, over and above the game's allowance.
alter table groups add column if not exists bonus_help_requests integer not null default 0
  check (bonus_help_requests >= 0);

-- -----------------------------------------------------------------------------
-- Participants: remove, reinstate, move
-- -----------------------------------------------------------------------------

create or replace function admin_remove_participant(p_participant_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_name  text;
  v_game  uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select full_name, game_id into v_name, v_game from participants where id = p_participant_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Marked removed rather than deleted: their name is attached to checkpoint
  -- verifications and help requests, and deleting would either fail or erase
  -- a team's history.
  update participants set status = 'removed' where id = p_participant_id;
  delete from group_members where participant_id = p_participant_id;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game, v_admin, 'REMOVE_PARTICIPANT', p_participant_id,
          jsonb_build_object('name', v_name, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'code', 'REMOVED', 'name', v_name);
end;
$$;

create or replace function admin_reinstate_participant(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_name  text;
  v_game  uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select full_name, game_id into v_name, v_game from participants where id = p_participant_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Comes back unassigned; the organizer places them with "Assign late students".
  update participants set status = 'active' where id = p_participant_id;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game, v_admin, 'REINSTATE_PARTICIPANT', p_participant_id,
          jsonb_build_object('name', v_name));

  return jsonb_build_object('ok', true, 'code', 'REINSTATED', 'name', v_name);
end;
$$;

create or replace function admin_move_participant(
  p_participant_id uuid,
  p_target_group_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game    uuid;
  v_name    text;
  v_target  groups%rowtype;
  v_count   integer;
  v_limit   integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select full_name, game_id into v_name, v_game from participants where id = p_participant_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- null target = take them out of their team, leaving them unassigned.
  if p_target_group_id is null then
    delete from group_members where participant_id = p_participant_id;

    insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
    values (v_game, v_admin, 'UNASSIGN_PARTICIPANT', p_participant_id,
            jsonb_build_object('name', v_name, 'reason', btrim(coalesce(p_reason, ''))));

    return jsonb_build_object('ok', true, 'code', 'UNASSIGNED', 'name', v_name);
  end if;

  select * into v_target from groups where id = p_target_group_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'GROUP_NOT_FOUND');
  end if;

  select max_group_size into v_limit from games where id = v_target.game_id;
  select count(*) into v_count from group_members where group_id = p_target_group_id;
  if v_count >= v_limit then
    return jsonb_build_object('ok', false, 'code', 'GROUP_FULL',
                              'group_number', v_target.group_number, 'limit', v_limit);
  end if;

  delete from group_members where participant_id = p_participant_id;
  insert into group_members (game_id, group_id, participant_id)
  values (v_target.game_id, p_target_group_id, p_participant_id);

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game, v_admin, 'MOVE_PARTICIPANT', p_participant_id,
          jsonb_build_object('name', v_name, 'to_group', v_target.group_number,
                             'reason', btrim(coalesce(p_reason, ''))));

  return jsonb_build_object('ok', true, 'code', 'MOVED',
                            'name', v_name, 'group_number', v_target.group_number);
end;
$$;

-- -----------------------------------------------------------------------------
-- Undo a checkpoint verified by mistake (§12)
-- -----------------------------------------------------------------------------

create or replace function admin_undo_verification(
  p_group_id uuid,
  p_stage integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game    games%rowtype;
  v_removed integer;
  v_lost    integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- Undoing a stage also undoes everything after it: progress must stay an
  -- unbroken run from 1, or the team would be stuck with a gap they can never
  -- fill (the next scan is always "completed + 1").
  delete from checkpoint_verifications cv
  using checkpoints c
  where cv.checkpoint_id = c.id
    and cv.group_id = p_group_id
    and c.stage_number >= p_stage;
  get diagnostics v_removed = row_count;

  -- If that cost them a finish, the placing goes too. Remaining places keep
  -- their numbers; an organizer can re-assign them deliberately.
  delete from winners where game_id = v_game.id and group_id = p_group_id;
  get diagnostics v_lost = row_count;

  if v_lost > 0 then
    update games set podium_filled_at = null where id = v_game.id
      and (select count(*) from winners where game_id = v_game.id) < 3;
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game.id, v_admin, 'UNDO_VERIFICATION', p_group_id,
          jsonb_build_object('from_stage', p_stage, 'removed', v_removed,
                             'placing_removed', v_lost > 0, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'code', 'UNDONE',
                            'removed', v_removed, 'placing_removed', v_lost > 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grant a team one more help request (§7)
-- -----------------------------------------------------------------------------

create or replace function admin_grant_help_request(p_group_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  uuid;
  v_bonus integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  update groups set bonus_help_requests = bonus_help_requests + 1
  where id = p_group_id
  returning game_id, bonus_help_requests into v_game, v_bonus;

  if v_game is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game, v_admin, 'GRANT_HELP_REQUEST', p_group_id,
          jsonb_build_object('bonus_now', v_bonus, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'code', 'GRANTED', 'bonus', v_bonus);
end;
$$;

-- The allowance now includes anything granted to this team.
create or replace function create_help_request(p_message text, p_stage integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant uuid := current_participant_id();
  v_group_id    uuid;
  v_bonus       integer;
  v_game        games%rowtype;
  v_used        integer;
  v_allowed     integer;
  v_stage       integer;
  v_id          uuid;
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  select gm.group_id into v_group_id
  from group_members gm where gm.participant_id = v_participant;
  if v_group_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GROUP');
  end if;

  select bonus_help_requests into v_bonus from groups where id = v_group_id for update;

  select * into v_game from games order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  perform check_rate_limit('help_request', v_group_id::text, 5, interval '5 minutes');

  select count(*) into v_used
  from help_requests where group_id = v_group_id and not is_exempt;

  v_allowed := v_game.help_request_limit + coalesce(v_bonus, 0);

  if v_used >= v_allowed then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_REACHED',
                              'used', v_used, 'limit', v_allowed);
  end if;

  v_stage := coalesce(p_stage, least(group_completed_stage(v_group_id) + 1, 4));

  insert into help_requests (game_id, group_id, requested_by, stage_number, message)
  values (v_game.id, v_group_id, v_participant, v_stage, btrim(coalesce(p_message, '')))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'code', 'SUBMITTED',
                            'request_id', v_id, 'remaining', v_allowed - v_used - 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------

create or replace function admin_update_settings(
  p_first_prize    numeric default null,
  p_second_prize   numeric default null,
  p_third_prize    numeric default null,
  p_help_limit     integer default null,
  p_max_group_size integer default null,
  p_title          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- Lowering the ceiling below the biggest existing team would leave the
  -- database in a state its own trigger forbids.
  if p_max_group_size is not null then
    if exists (
      select 1 from group_members gm
      group by gm.group_id having count(*) > p_max_group_size
    ) then
      return jsonb_build_object('ok', false, 'code', 'TEAM_TOO_BIG');
    end if;
  end if;

  update games
  set first_prize_etb    = coalesce(p_first_prize, first_prize_etb),
      second_prize_etb   = coalesce(p_second_prize, second_prize_etb),
      third_prize_etb    = coalesce(p_third_prize, third_prize_etb),
      help_request_limit = coalesce(p_help_limit, help_request_limit),
      max_group_size     = coalesce(p_max_group_size, max_group_size),
      title              = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title)
  where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'UPDATE_SETTINGS',
          jsonb_build_object('first', p_first_prize, 'second', p_second_prize,
                             'third', p_third_prize, 'help_limit', p_help_limit,
                             'max_group_size', p_max_group_size));

  return jsonb_build_object('ok', true, 'code', 'SAVED');
end;
$$;

-- -----------------------------------------------------------------------------
-- The on-site code for a checkpoint (§6)
-- -----------------------------------------------------------------------------

create or replace function admin_set_checkpoint_code(
  p_stage integer,
  p_group_number integer default null,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game_id uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select id into v_game_id from games order by created_at desc limit 1;
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- An empty string means "turn it off", which is what a cleared input sends.
  if nullif(btrim(coalesce(p_code, '')), '') is null then
    update checkpoints
    set requires_organizer_code = false, organizer_code_hash = null
    where game_id = v_game_id and stage_number = p_stage
      and group_number is not distinct from p_group_number;
  else
    update checkpoints
    set requires_organizer_code = true,
        organizer_code_hash = digest(upper(btrim(p_code)), 'sha256')
    where game_id = v_game_id and stage_number = p_stage
      and group_number is not distinct from p_group_number;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND');
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game_id, v_admin, 'SET_CHECKPOINT_CODE',
          jsonb_build_object('stage', p_stage, 'group_number', p_group_number,
                             'enabled', nullif(btrim(coalesce(p_code, '')), '') is not null));

  return jsonb_build_object('ok', true, 'code', 'SAVED',
                            'enabled', nullif(btrim(coalesce(p_code, '')), '') is not null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Correcting an automatically awarded placing
--
-- NOT the old pick-three-and-reveal flow, which is gone: placings are decided
-- by who finishes first. This exists only to fix one that turned out wrong —
-- a disqualified team, or a checkpoint undone above.
-- -----------------------------------------------------------------------------

create or replace function admin_correct_winner(
  p_position integer,
  p_group_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_prize numeric(10,2);
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_position not between 1 and 3 then
    return jsonb_build_object('ok', false, 'code', 'BAD_POSITION');
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  delete from winners where game_id = v_game.id and position = p_position;

  -- null clears the place and leaves it empty.
  if p_group_id is not null then
    -- A team can hold only one place, so free any it already had.
    delete from winners where game_id = v_game.id and group_id = p_group_id;

    v_prize := case p_position
                 when 1 then v_game.first_prize_etb
                 when 2 then v_game.second_prize_etb
                 else v_game.third_prize_etb
               end;

    insert into winners (game_id, group_id, position, prize_amount, revealed_at)
    values (v_game.id, p_group_id, p_position, v_prize, now());
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game.id, v_admin, 'CORRECT_WINNER', p_group_id,
          jsonb_build_object('position', p_position, 'cleared', p_group_id is null,
                             'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'code', 'CORRECTED');
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant execute on function admin_remove_participant(uuid, text)          to authenticated;
grant execute on function admin_reinstate_participant(uuid)             to authenticated;
grant execute on function admin_move_participant(uuid, uuid, text)      to authenticated;
grant execute on function admin_undo_verification(uuid, integer, text)  to authenticated;
grant execute on function admin_grant_help_request(uuid, text)          to authenticated;
grant execute on function admin_update_settings(numeric, numeric, numeric, integer, integer, text)
  to authenticated;
grant execute on function admin_set_checkpoint_code(integer, integer, text) to authenticated;
grant execute on function admin_correct_winner(integer, uuid, text)     to authenticated;
grant execute on function create_help_request(text, integer)            to authenticated;
