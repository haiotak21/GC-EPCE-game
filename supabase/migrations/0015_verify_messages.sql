-- =============================================================================
-- Game for power unity! — 0015 two fixes to checkpoint verification
--
-- 1. INFORMATION LEAK
--    Scanning the wrong sign replied:
--      "This is checkpoint 4, but your team needs checkpoint 1 next"
--    which hands a team the location of stage 4 for free. A team that stumbles
--    past a later sign — or deliberately tries one — learns exactly where a
--    future stage is. The reply must not say which checkpoint was scanned.
--    Their own next stage is fine to state: they already know it.
--
-- 2. WRONG NOTIFICATION TEXT
--    On success the notification read:
--      "Your team reached The Library Clock Tower."
--    That is the checkpoint's internal location label, written by organizers
--    for their own reference, and it can give away the answer. It should
--    announce the NEXT clue's title instead — the thing the team now needs.
--
-- Safe to run more than once.
-- =============================================================================

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
  v_game         games%rowtype;
  v_checkpoint   checkpoints%rowtype;
  v_completed    integer;
  v_inserted     uuid;
  v_notif        uuid;
  v_next_stage   integer;
  v_next_title   text;
  v_message      text;
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  select gm.group_id, g.group_number into v_group_id, v_group_number
  from group_members gm
  join groups g on g.id = gm.group_id
  where gm.participant_id = v_participant;

  if v_group_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GROUP');
  end if;

  perform 1 from groups where id = v_group_id for update;

  select * into v_game from games order by created_at desc limit 1;
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
  where verification_token_hash = digest(btrim(p_token), 'sha256')
    and game_id = v_game.id
    and active;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;

  v_completed := group_completed_stage(v_group_id);

  -- A real code belonging to another team's route. Deliberately indistinguishable
  -- from "wrong checkpoint": saying which team it belongs to would leak too.
  if v_checkpoint.group_number is not null and v_checkpoint.group_number <> v_group_number then
    return jsonb_build_object(
      'ok', false, 'code', 'WRONG_STAGE',
      'expected_stage', v_completed + 1
    );
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
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_VERIFIED',
      'stage', v_checkpoint.stage_number, 'completed_stage', v_completed
    );
  end if;

  -- FIX 1: no 'stage' key here. The team is told what they need next, never
  -- what they just found.
  if v_checkpoint.stage_number <> v_completed + 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'WRONG_STAGE',
      'expected_stage', v_completed + 1
    );
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

  -- FIX 2: announce the next clue's title, preferring this team's own clue
  -- over the shared one, exactly as the student's clue screen resolves it.
  v_next_stage := v_checkpoint.stage_number + 1;

  if v_next_stage <= 4 then
    select h.title into v_next_title
    from hints h
    where h.game_id = v_game.id
      and h.hint_number = v_next_stage
      and h.published_at is not null
      and (h.group_number = v_group_number or h.group_number is null)
    order by (h.group_number is null)   -- false sorts first: the team's own clue wins
    limit 1;

    v_message := coalesce(
      nullif(btrim(coalesce(v_next_title, '')), ''),
      'Your next clue will appear here shortly.'
    );
  else
    v_message := 'You have completed all four stages. Head for the finish line!';
  end if;

  insert into notifications (game_id, title, message, type, audience, payload)
  values (
    v_game.id,
    'Checkpoint ' || v_checkpoint.stage_number || ' verified',
    v_message,
    'hint', 'groups',
    jsonb_build_object('group_id', v_group_id, 'stage', v_checkpoint.stage_number)
  )
  returning id into v_notif;

  insert into notification_recipients (notification_id, participant_id)
  select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;

  return jsonb_build_object(
    'ok', true, 'code', 'VERIFIED',
    'stage', v_checkpoint.stage_number,
    'completed_stage', v_checkpoint.stage_number,
    'next_stage', case when v_checkpoint.stage_number < 4 then v_checkpoint.stage_number + 1 end
  );
end;
$$;

grant execute on function verify_checkpoint(text, text) to authenticated;
