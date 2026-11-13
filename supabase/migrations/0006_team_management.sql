-- =============================================================================
-- GC Campus Mystery Hunt — 0006 team management after the first publish
--
-- 0002 could only publish teams once, which left two real situations with no
-- answer:
--   * a student registers after teams were published (§9.2 "Manage late
--     registrations")
--   * the organizer wants to redo the draw before the game starts
--
-- Both are admin-only, audited (§9.3 "Changes to published groups require
-- confirmation and an audit log"), and refuse to destroy progress.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Placing students who registered after the draw
--
-- Fills existing teams that are under the limit first, so a late arrival joins
-- a real team rather than creating a lonely extra one. Whatever is left forms
-- new teams using the same sizing rule as the original draw.
-- -----------------------------------------------------------------------------

create or replace function assign_unassigned_participants()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin     uuid := current_admin_id();
  v_game      games%rowtype;
  v_ids       uuid[];
  v_group     record;
  v_pid       uuid;
  v_cursor    integer := 1;
  v_total     integer;
  v_placed    integer := 0;
  v_new_teams integer := 0;
  v_sizes     integer[];
  v_next_num  integer;
  v_group_id  uuid;
  v_notif     uuid;
  i           integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select coalesce(array_agg(p.id order by random()), '{}')
  into v_ids
  from participants p
  where p.game_id = v_game.id
    and p.status = 'active'
    and not exists (select 1 from group_members gm where gm.participant_id = p.id);

  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then
    return jsonb_build_object('ok', true, 'code', 'NOTHING_TO_DO', 'placed', 0);
  end if;

  -- Pass 1: top up existing teams that have room.
  for v_group in
    select g.id, g.group_number, count(gm.id) as members
    from groups g
    left join group_members gm on gm.group_id = g.id
    where g.game_id = v_game.id
    group by g.id, g.group_number
    having count(gm.id) < v_game.max_group_size
    order by count(gm.id), g.group_number
  loop
    exit when v_cursor > v_total;

    while v_cursor <= v_total
      and (select count(*) from group_members where group_id = v_group.id) < v_game.max_group_size
    loop
      v_pid := v_ids[v_cursor];
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_group.id, v_pid);
      v_cursor := v_cursor + 1;
      v_placed := v_placed + 1;

      insert into notifications (game_id, title, message, type, audience, created_by, payload)
      values (v_game.id, 'A new teammate joined',
              (select full_name from participants where id = v_pid) || ' has joined your team.',
              'team_assignment', 'groups', v_admin,
              jsonb_build_object('group_id', v_group.id))
      returning id into v_notif;

      insert into notification_recipients (notification_id, participant_id)
      select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group.id;
    end loop;
  end loop;

  -- Pass 2: whatever remains becomes new teams.
  v_sizes := plan_group_sizes(v_total - v_cursor + 1);
  select coalesce(max(group_number), 0) into v_next_num from groups where game_id = v_game.id;

  for i in 1..coalesce(array_length(v_sizes, 1), 0) loop
    v_next_num := v_next_num + 1;

    insert into groups (game_id, group_number, published_at)
    values (v_game.id, v_next_num, now())
    returning id into v_group_id;

    for v_pid in select unnest(v_ids[v_cursor : v_cursor + v_sizes[i] - 1]) loop
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_group_id, v_pid);
      v_placed := v_placed + 1;
    end loop;

    v_cursor := v_cursor + v_sizes[i];
    v_new_teams := v_new_teams + 1;

    insert into notifications (game_id, title, message, type, audience, created_by, payload)
    values (v_game.id, 'Your team is ready',
            'You have been assigned to Group ' || v_next_num, 'team_assignment', 'groups', v_admin,
            jsonb_build_object('group_id', v_group_id, 'group_number', v_next_num))
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;
  end loop;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'ASSIGN_LATE_PARTICIPANTS',
          jsonb_build_object('placed', v_placed, 'new_teams', v_new_teams,
                             'still_pending', v_total - v_placed));

  return jsonb_build_object(
    'ok', true, 'code', 'ASSIGNED',
    'placed', v_placed,
    'new_teams', v_new_teams,
    -- A single leftover student cannot form a team alone (§9.3).
    'still_pending', v_total - v_placed
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Redoing the draw
--
-- Refuses once any team has verified a checkpoint: deleting groups would
-- cascade to checkpoint_verifications and silently erase real progress. Before
-- the game starts there is nothing to lose, so it is allowed.
-- -----------------------------------------------------------------------------

create or replace function reset_team_assignment()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game    games%rowtype;
  v_groups  integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  if exists (select 1 from checkpoint_verifications where game_id = v_game.id) then
    return jsonb_build_object('ok', false, 'code', 'PROGRESS_EXISTS');
  end if;

  if exists (select 1 from winners where game_id = v_game.id) then
    return jsonb_build_object('ok', false, 'code', 'WINNERS_SELECTED');
  end if;

  select count(*) into v_groups from groups where game_id = v_game.id;
  delete from groups where game_id = v_game.id;

  update games
  set status = case when status = 'TEAMS_PUBLISHED' then 'WAITING' else status end
  where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'RESET_TEAMS', jsonb_build_object('groups_removed', v_groups));

  return jsonb_build_object('ok', true, 'code', 'RESET', 'groups_removed', v_groups);
end;
$$;

grant execute on function assign_unassigned_participants() to authenticated;
grant execute on function reset_team_assignment() to authenticated;
