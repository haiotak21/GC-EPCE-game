-- =============================================================================
-- Game for power unity! — 0012 reset the event back to the starting line
--
-- Clears students, teams, progress, messages and results, then reopens
-- registration. Written for rehearsals: run the whole event, reset, run it
-- again.
--
-- Deliberately KEEPS, unless you ask otherwise:
--   * the clues you wrote
--   * the checkpoint codes already printed on signs
--   * the three organizer accounts
--   * the audit log, which records the reset itself
--
-- Safe to run more than once.
-- =============================================================================

create or replace function reset_game(
  p_include_clues boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin        uuid := current_admin_id();
  v_game         games%rowtype;
  v_participants integer;
  v_groups       integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select count(*) into v_participants from participants where game_id = v_game.id;
  select count(*) into v_groups       from groups       where game_id = v_game.id;

  -- Order matters. help_requests.requested_by and
  -- checkpoint_verifications.verified_by reference participants WITHOUT a
  -- cascade, so those rows must go before the students they point at,
  -- otherwise the delete is refused.
  delete from checkpoint_verifications where game_id = v_game.id;
  delete from help_requests            where game_id = v_game.id;
  delete from winners                  where game_id = v_game.id;
  delete from notifications            where game_id = v_game.id;  -- cascades recipients
  delete from group_members            where game_id = v_game.id;
  delete from groups                   where game_id = v_game.id;
  delete from participants             where game_id = v_game.id;

  -- Registration allows 3 attempts per hour per device; without clearing this
  -- a rehearsal would hit the limit on the second run from the same phone.
  delete from rate_limit_events;

  if p_include_clues then
    delete from checkpoints where game_id = v_game.id;
    delete from hints       where game_id = v_game.id;

    -- Put back the four empty slots, as create_game() does.
    insert into hints (game_id, hint_number, title, content)
    select v_game.id, i, 'Stage ' || i || ' — not written yet', null
    from generate_series(1, 4) i;
  end if;

  update games
  set status            = 'REGISTRATION',
      registration_open = true,
      started_at        = null,
      finished_at       = null
  where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'RESET_GAME',
          jsonb_build_object('participants_removed', v_participants,
                             'groups_removed', v_groups,
                             'clues_removed', p_include_clues));

  return jsonb_build_object(
    'ok', true, 'code', 'RESET',
    'participants_removed', v_participants,
    'groups_removed', v_groups,
    'clues_removed', p_include_clues
  );
end;
$$;

grant execute on function reset_game(boolean) to authenticated;
