-- =============================================================================
-- Game for power unity! — 0019 shorter checkpoint codes
--
-- GCMH-53AEE079FE5AEA999F was 23 characters. Typing that on a phone, outdoors,
-- in a hurry, is miserable and error-prone.
--
-- New shape: EPCE + 4 characters, e.g. EPCE7K4M.
--
-- The alphabet leaves out O, 0, I, 1, S and 5, which are the pairs people
-- confuse when reading a printed sign or hearing a code called out. That
-- leaves 30 characters, so 30^4 = 810,000 possibilities.
--
-- That is far fewer than before, so this migration also rate-limits WRONG
-- codes. Without it, 810,000 is within reach of a script; with 10 wrong
-- guesses per team per 5 minutes it would take years, while a student
-- mistyping a code a few times notices nothing.
--
-- Existing codes keep working: verification matches on the stored hash and
-- does not care what shape the code is. Only newly generated ones are short.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function generate_checkpoint_code()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  -- No O/0, I/1, or S/5: the pairs misread on a sign or misheard aloud.
  alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  result text := 'EPCE';
  i integer;
begin
  for i in 1..4 loop
    -- floor(random()*30) is 0..29; substr is 1-based.
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Issue a code in the new shape
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
  v_admin   uuid := current_admin_id();
  v_game_id uuid;
  v_token   text;
  v_label   text;
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

  -- A shorter code means collisions are possible, and the hash column is
  -- unique. Try again rather than failing in the organizer's face.
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

  v_label := coalesce(nullif(btrim(coalesce(p_location, '')), ''), 'Stage ' || p_stage);

  if exists (
    select 1 from checkpoints c
    where c.game_id = v_game_id and c.stage_number = p_stage
      and c.group_number is not distinct from p_group_number
  ) then
    update checkpoints c
    set verification_token_hash = digest(v_token, 'sha256'),
        location_label = v_label,
        active = true
    where c.game_id = v_game_id and c.stage_number = p_stage
      and c.group_number is not distinct from p_group_number;
  else
    insert into checkpoints (game_id, group_number, stage_number, location_label, verification_token_hash)
    values (v_game_id, p_group_number, p_stage, v_label, digest(v_token, 'sha256'));
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game_id, v_admin, 'ISSUE_CHECKPOINT_CODE',
          jsonb_build_object('stage', p_stage, 'group_number', p_group_number));

  return jsonb_build_object('ok', true, 'code', 'ISSUED', 'token', v_token, 'label', v_label);
end;
$$;

-- -----------------------------------------------------------------------------
-- Slow down guessing
--
-- Only WRONG codes count against the limit, so a team scanning the right sign
-- repeatedly is never affected.
-- -----------------------------------------------------------------------------

create or replace function verify_checkpoint(
  p_token text,
  p_organizer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant  uuid := current_participant_id();
  v_group_id     uuid;
  v_group_number integer;
  v_group_name   text;
  v_game         games%rowtype;
  v_checkpoint   checkpoints%rowtype;
  v_completed    integer;
  v_inserted     uuid;
  v_notif        uuid;
  v_next_stage   integer;
  v_next_title   text;
  v_message      text;
  v_place        integer;
  v_prize        numeric(10,2);
  v_team_label   text;
  v_place_word   text;
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  select gm.group_id, g.group_number, g.group_name
    into v_group_id, v_group_number, v_group_name
  from group_members gm
  join groups g on g.id = gm.group_id
  where gm.participant_id = v_participant;

  if v_group_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GROUP');
  end if;

  perform 1 from groups where id = v_group_id for update;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  if v_game.status = 'PAUSED' then
    return jsonb_build_object('ok', false, 'code', 'GAME_PAUSED');
  end if;
  if v_game.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE');
  end if;

  select * into v_checkpoint
  from checkpoints
  where verification_token_hash = digest(btrim(upper(p_token)), 'sha256')
    and game_id = v_game.id
    and active;

  -- Codes are stored upper-case; accept whatever case the student typed.
  if not found then
    select * into v_checkpoint
    from checkpoints
    where verification_token_hash = digest(btrim(p_token), 'sha256')
      and game_id = v_game.id
      and active;
  end if;

  if not found then
    -- Wrong code: this is the only path that counts toward the guess limit.
    begin
      perform check_rate_limit('wrong_code', v_group_id::text, 10, interval '5 minutes');
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'TOO_MANY_WRONG_CODES');
    end;
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;

  v_completed := group_completed_stage(v_group_id);

  if v_checkpoint.group_number is not null and v_checkpoint.group_number <> v_group_number then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STAGE', 'expected_stage', v_completed + 1);
  end if;

  if v_checkpoint.requires_organizer_code then
    if p_organizer_code is null
       or digest(upper(btrim(p_organizer_code)), 'sha256') <> v_checkpoint.organizer_code_hash then
      return jsonb_build_object('ok', false, 'code', 'ORGANIZER_CODE_REQUIRED');
    end if;
  end if;

  if exists (
    select 1 from checkpoint_verifications
    where group_id = v_group_id and checkpoint_id = v_checkpoint.id
  ) then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_VERIFIED',
                              'stage', v_checkpoint.stage_number, 'completed_stage', v_completed);
  end if;

  if v_checkpoint.stage_number <> v_completed + 1 then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STAGE', 'expected_stage', v_completed + 1);
  end if;

  insert into checkpoint_verifications (game_id, group_id, checkpoint_id, verified_by, verification_method)
  values (
    v_game.id, v_group_id, v_checkpoint.id, v_participant,
    (case when v_checkpoint.requires_organizer_code then 'organizer_code' else 'qr_scan' end)::verification_method
  )
  on conflict (group_id, checkpoint_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_VERIFIED', 'stage', v_checkpoint.stage_number);
  end if;

  -- --- not the final stage -----------------------------------------------
  if v_checkpoint.stage_number < 4 then
    v_next_stage := v_checkpoint.stage_number + 1;

    select h.title into v_next_title
    from hints h
    where h.game_id = v_game.id
      and h.hint_number = v_next_stage
      and h.published_at is not null
      and (h.group_number = v_group_number or h.group_number is null)
    order by (h.group_number is null)
    limit 1;

    v_message := coalesce(nullif(btrim(coalesce(v_next_title, '')), ''),
                          'Your next clue will appear here shortly.');

    insert into notifications (game_id, title, message, type, audience, payload)
    values (v_game.id,
            'Checkpoint ' || v_checkpoint.stage_number || ' verified',
            v_message, 'hint', 'groups',
            jsonb_build_object('group_id', v_group_id, 'stage', v_checkpoint.stage_number))
    returning id into v_notif;

    -- Only this team's members.
    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;

    return jsonb_build_object(
      'ok', true, 'code', 'VERIFIED',
      'stage', v_checkpoint.stage_number,
      'completed_stage', v_checkpoint.stage_number,
      'next_stage', v_next_stage
    );
  end if;

  -- --- final stage: work out the placing ---------------------------------

  v_team_label := coalesce(
    nullif(btrim(coalesce(v_group_name, '')), ''),
    'Group ' || lpad(v_group_number::text, 2, '0')
  );

  select count(*) + 1 into v_place from winners where game_id = v_game.id;

  if v_place <= 3 then
    v_prize := case v_place
                 when 1 then v_game.first_prize_etb
                 when 2 then v_game.second_prize_etb
                 else v_game.third_prize_etb
               end;

    insert into winners (game_id, group_id, position, prize_amount, revealed_at)
    values (v_game.id, v_group_id, v_place, v_prize, now())
    on conflict (game_id, group_id) do nothing;

    v_place_word := case v_place when 1 then '1st' when 2 then '2nd' else '3rd' end;

    -- (a) the finishing team only
    insert into notifications (game_id, title, message, type, audience, payload)
    values (
      v_game.id,
      '🏆 You finished in ' || v_place_word || ' place!',
      v_team_label || ' completed all four checkpoints and took ' || v_place_word ||
      ' place. Prize: ' || trim(to_char(v_prize, 'FM999,999')) || ' ETB.' ||
      E'\n\nHead to the finish line to meet the organizers.',
      'winners', 'groups',
      jsonb_build_object('group_id', v_group_id, 'place', v_place, 'celebrate', true)
    )
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;

    -- (b) everyone else: a place being won is the ONLY thing other teams are
    -- told about. Ordinary checkpoints stay private to the team that reached
    -- them.
    insert into notifications (game_id, title, message, type, audience, payload)
    values (
      v_game.id,
      v_team_label || ' took ' || v_place_word || ' place!',
      v_team_label || ' has finished all four checkpoints. ' ||
      case when v_place < 3
           then 'There are still places left — keep going!'
           else 'All three places have now been taken.' end,
      'winners', 'everyone',
      jsonb_build_object('place', v_place, 'auto_dismiss_seconds', 10,
                         'winning_group_id', v_group_id)
    )
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, p.id
    from participants p
    where p.game_id = v_game.id
      and p.status = 'active'
      and not exists (
        select 1 from group_members gm
        where gm.participant_id = p.id and gm.group_id = v_group_id
      );

    if v_place = 3 then
      update games set podium_filled_at = now() where id = v_game.id;
    end if;

  else
    insert into notifications (game_id, title, message, type, audience, payload)
    values (
      v_game.id, 'You finished the hunt!',
      v_team_label || ' completed all four checkpoints. The top three places were already taken, ' ||
      'but you made it to the end — well done.',
      'winners', 'groups',
      jsonb_build_object('group_id', v_group_id, 'place', v_place)
    )
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, null, 'TEAM_FINISHED',
          jsonb_build_object('group_id', v_group_id, 'group', v_team_label, 'place', v_place));

  return jsonb_build_object(
    'ok', true, 'code', 'VERIFIED',
    'stage', 4, 'completed_stage', 4, 'next_stage', null,
    'place', v_place
  );
end;
$$;

grant execute on function generate_checkpoint_code() to authenticated;
grant execute on function issue_checkpoint_code(integer, integer, text) to authenticated;
grant execute on function verify_checkpoint(text, text) to authenticated;

do $$
declare v_sample text;
begin
  v_sample := generate_checkpoint_code();
  raise notice 'New codes look like: %  (% characters)', v_sample, length(v_sample);
end $$;
