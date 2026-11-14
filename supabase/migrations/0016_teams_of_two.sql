-- =============================================================================
-- Game for power unity! — 0016 teams of two
--
-- Students asked for pairs rather than threes. New rule:
--
--   * every team has 2 members
--   * if the number of students is odd, exactly ONE team has 3
--   * a single student is never left in a team alone
--
-- Worked examples:
--     4  -> 2+2
--     8  -> 2+2+2+2
--     9  -> 2+2+2+3        (four teams, the organizer's example)
--    11  -> 2+2+2+2+3
--     3  -> 3              (cannot be split into pairs)
--     1  -> pending for admin review
--
-- games.max_group_size stays at 3 on purpose: it is the hard ceiling the
-- capacity trigger enforces, and the one odd team needs that headroom. Two is
-- the preferred size, chosen here in the planner.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function plan_group_sizes(n integer)
returns integer[]
language plpgsql
immutable
as $$
declare
  sizes integer[] := '{}';
  pairs integer;
  i     integer;
begin
  -- 0 students, or a single student who cannot form a team alone.
  if n < 2 then
    return sizes;
  end if;

  if n % 2 = 0 then
    pairs := n / 2;                 -- even: all pairs
  else
    pairs := (n - 3) / 2;           -- odd: pairs, plus one team of three
  end if;

  for i in 1..pairs loop
    sizes := sizes || 2;
  end loop;

  if n % 2 = 1 then
    sizes := sizes || 3;
  end if;

  return sizes;
end;
$$;

-- -----------------------------------------------------------------------------
-- Late arrivals follow the same preference
--
-- Previously this topped up existing teams to the maximum first, which under
-- the old rule meant filling threes. With pairs preferred, late students
-- should PAIR WITH EACH OTHER, and only a single leftover should join an
-- existing team to make it three.
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
  v_total     integer;
  v_pairs     integer;
  v_cursor    integer := 1;
  v_placed    integer := 0;
  v_new_teams integer := 0;
  v_next_num  integer;
  v_group_id  uuid;
  v_notif     uuid;
  v_target    uuid;
  v_pid       uuid;
  i           integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
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

  -- Pair up as many of the newcomers as possible.
  v_pairs := v_total / 2;
  select coalesce(max(group_number), 0) into v_next_num from groups where game_id = v_game.id;

  for i in 1..v_pairs loop
    v_next_num := v_next_num + 1;

    insert into groups (game_id, group_number, published_at)
    values (v_game.id, v_next_num, now())
    returning id into v_group_id;

    for v_pid in select unnest(v_ids[v_cursor : v_cursor + 1]) loop
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_group_id, v_pid);
      v_placed := v_placed + 1;
    end loop;

    v_cursor := v_cursor + 2;
    v_new_teams := v_new_teams + 1;

    insert into notifications (game_id, title, message, type, audience, created_by, payload)
    values (v_game.id, 'Your team is ready',
            'You have been assigned to Group ' || v_next_num, 'team_assignment', 'groups', v_admin,
            jsonb_build_object('group_id', v_group_id, 'group_number', v_next_num))
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;
  end loop;

  -- One student over. Join the smallest team that still has room, which keeps
  -- the number of three-person teams to a minimum.
  if v_cursor <= v_total then
    select g.id into v_target
    from groups g
    left join group_members gm on gm.group_id = g.id
    where g.game_id = v_game.id
    group by g.id, g.group_number
    having count(gm.id) < v_game.max_group_size
    order by count(gm.id), g.group_number
    limit 1;

    if v_target is not null then
      v_pid := v_ids[v_cursor];
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_target, v_pid);
      v_placed := v_placed + 1;
      v_cursor := v_cursor + 1;

      insert into notifications (game_id, title, message, type, audience, created_by, payload)
      values (v_game.id, 'A new teammate joined',
              (select full_name from participants where id = v_pid) || ' has joined your team.',
              'team_assignment', 'groups', v_admin,
              jsonb_build_object('group_id', v_target))
      returning id into v_notif;

      insert into notification_recipients (notification_id, participant_id)
      select v_notif, gm.participant_id from group_members gm where gm.group_id = v_target;
    end if;
    -- No team with room: the student stays pending for the organizer.
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'ASSIGN_LATE_PARTICIPANTS',
          jsonb_build_object('placed', v_placed, 'new_teams', v_new_teams,
                             'still_pending', v_total - v_placed));

  return jsonb_build_object(
    'ok', true, 'code', 'ASSIGNED',
    'placed', v_placed,
    'new_teams', v_new_teams,
    'still_pending', v_total - v_placed
  );
end;
$$;

grant execute on function assign_unassigned_participants() to authenticated;

-- -----------------------------------------------------------------------------
-- Prove the rule holds for every class size we could plausibly see
-- -----------------------------------------------------------------------------

do $$
declare
  n        integer;
  sizes    integer[];
  total    integer;
  threes   integer;
  bad      text := '';
begin
  for n in 2..60 loop
    sizes := plan_group_sizes(n);
    select coalesce(sum(s), 0), count(*) filter (where s = 3)
      into total, threes
      from unnest(sizes) s;

    if total <> n then
      bad := bad || format(' n=%s lost %s student(s);', n, n - total);
    end if;
    if exists (select 1 from unnest(sizes) s where s not in (2, 3)) then
      bad := bad || format(' n=%s has a team that is not 2 or 3;', n);
    end if;
    if threes > 1 then
      bad := bad || format(' n=%s has %s teams of three;', n, threes);
    end if;
    if n % 2 = 0 and threes <> 0 then
      bad := bad || format(' n=%s is even but has a team of three;', n);
    end if;
    if n % 2 = 1 and threes <> 1 then
      bad := bad || format(' n=%s is odd but has %s teams of three;', n, threes);
    end if;
  end loop;

  if bad = '' then
    raise notice 'Team sizing verified for 2..60 students: pairs everywhere, at most one team of three, nobody dropped.';
    raise notice '9 students -> %', plan_group_sizes(9);
  else
    raise warning 'Team sizing problems:%', bad;
  end if;
end $$;
