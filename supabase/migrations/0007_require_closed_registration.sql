-- =============================================================================
-- Game for power unity! — 0007 teams may only be drawn once registration shuts
--
-- The dashboard disables the Assign Teams button while registration is open,
-- but a disabled button is a suggestion, not a rule. This makes it real.
--
-- It is not only tidiness. With registration open there is a genuine race: a
-- student can register between the organizer previewing a draw and publishing
-- it, and would then be silently left out of every team. Requiring a closed
-- roster removes that window entirely.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function publish_team_assignment(p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game      games%rowtype;
  v_admin     uuid := current_admin_id();
  v_group     jsonb;
  v_group_id  uuid;
  v_pid       uuid;
  v_notif     uuid;
  v_created   integer := 0;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- The roster must be final before it is divided up.
  if v_game.registration_open then
    return jsonb_build_object('ok', false, 'code', 'REGISTRATION_STILL_OPEN');
  end if;

  -- Idempotency guard: the second concurrent publish finds groups already
  -- there and returns rather than creating a duplicate set.
  if exists (select 1 from groups where game_id = v_game.id and published_at is not null) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PUBLISHED');
  end if;

  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    insert into groups (game_id, group_number, published_at)
    values (v_game.id, (v_group->>'group_number')::integer, now())
    returning id into v_group_id;

    for v_pid in
      select (value #>> '{}')::uuid from jsonb_array_elements(v_group->'participant_ids')
    loop
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_group_id, v_pid);
    end loop;

    insert into notifications (game_id, title, message, type, audience, created_by, payload)
    values (
      v_game.id,
      'Your team is ready',
      'You have been assigned to Group ' || (v_group->>'group_number'),
      'team_assignment', 'groups', v_admin,
      jsonb_build_object('group_id', v_group_id, 'group_number', (v_group->>'group_number')::integer)
    )
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;

    v_created := v_created + 1;
  end loop;

  update games set status = 'TEAMS_PUBLISHED' where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'PUBLISH_TEAMS', jsonb_build_object('groups', v_created));

  return jsonb_build_object('ok', true, 'code', 'PUBLISHED', 'groups_created', v_created);
end;
$$;

grant execute on function publish_team_assignment(jsonb) to authenticated;
