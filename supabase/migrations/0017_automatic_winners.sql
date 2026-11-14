-- =============================================================================
-- Game for power unity! — 0017 the system decides the winners, live
--
-- Until now an organizer picked three teams by hand and pressed Reveal.
-- Organizers want it automatic and immediate:
--
--   * the moment a team verifies checkpoint 4, the system works out whether
--     they are 1st, 2nd or 3rd to finish, and records it
--   * that team gets a popup telling them their place; it stays until they
--     tap Cancel
--   * every OTHER team gets a popup naming the winning team — using the name
--     the team chose for itself if they set one — which closes itself after
--     10 seconds and can be dismissed sooner
--   * five minutes after 3rd place is taken, the teams still playing are
--     asked whether to carry on or stop, and the majority decides
--
-- Placement is decided inside the same locked transaction as the scan, so two
-- teams finishing in the same second cannot both be awarded first.
--
-- Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Prize money and the end-of-game vote live on the game
-- -----------------------------------------------------------------------------

alter table games add column if not exists first_prize_etb  numeric(10,2) not null default 3000;
alter table games add column if not exists second_prize_etb numeric(10,2) not null default 2000;
alter table games add column if not exists third_prize_etb  numeric(10,2) not null default 1000;

-- When 3rd place was taken. The vote opens five minutes after this.
alter table games add column if not exists podium_filled_at timestamptz;

-- null = not decided yet; otherwise 'continue' or 'abort'.
alter table games add column if not exists post_podium_decision text
  check (post_podium_decision is null or post_podium_decision in ('continue', 'abort'));

-- -----------------------------------------------------------------------------
-- One vote per team
-- -----------------------------------------------------------------------------

create table if not exists game_votes (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  group_id   uuid not null references groups(id) on delete cascade,
  choice     text not null check (choice in ('continue', 'abort')),
  cast_by    uuid references participants(id) on delete set null,
  created_at timestamptz not null default now(),

  -- A team votes once; any member may cast it.
  constraint game_votes_one_per_team unique (game_id, group_id)
);

alter table game_votes enable row level security;
alter table game_votes replica identity full;

drop policy if exists game_votes_select on game_votes;
create policy game_votes_select on game_votes
  for select to authenticated
  using (group_id = current_group_id() or is_admin());

grant select on game_votes to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table game_votes;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Verification now awards places
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

  -- Lock the game too: placement is read-then-write, and two teams finishing
  -- at the same moment must not both read "no winners yet".
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
  where verification_token_hash = digest(btrim(p_token), 'sha256')
    and game_id = v_game.id
    and active;

  if not found then
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

  -- ---------------------------------------------------------------------------
  -- Not the final stage: announce the next clue as before.
  -- ---------------------------------------------------------------------------
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

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, gm.participant_id from group_members gm where gm.group_id = v_group_id;

    return jsonb_build_object(
      'ok', true, 'code', 'VERIFIED',
      'stage', v_checkpoint.stage_number,
      'completed_stage', v_checkpoint.stage_number,
      'next_stage', v_next_stage
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Final stage: work out the placing.
  -- ---------------------------------------------------------------------------

  -- The team calls itself whatever it chose; fall back to the number.
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

    -- Revealed straight away: the whole point is that it is announced live.
    insert into winners (game_id, group_id, position, prize_amount, revealed_at)
    values (v_game.id, v_group_id, v_place, v_prize, now())
    on conflict (game_id, group_id) do nothing;

    v_place_word := case v_place when 1 then '1st' when 2 then '2nd' else '3rd' end;

    -- (a) The finishing team. No timer — they get to enjoy it.
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

    -- (b) Everybody else. Closes itself after 10 seconds so it cannot block a
    -- team that is mid-scan.
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

    -- Third place fills the podium: start the five-minute clock on the vote.
    if v_place = 3 then
      update games set podium_filled_at = now() where id = v_game.id;
    end if;

  else
    -- Finished, but off the podium.
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

grant execute on function verify_checkpoint(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- The vote: carry on, or stop here?
-- -----------------------------------------------------------------------------

/** Teams still playing — the ones entitled to vote. */
create or replace function teams_still_playing(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::integer
  from groups g
  where g.game_id = p_game_id
    and group_completed_stage(g.id) < 4;
$$;

create or replace function cast_game_vote(p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant uuid := current_participant_id();
  v_group_id    uuid;
  v_game        games%rowtype;
  v_eligible    integer;
  v_continue    integer;
  v_abort       integer;
  v_notif       uuid;
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;
  if p_choice not in ('continue', 'abort') then
    return jsonb_build_object('ok', false, 'code', 'BAD_CHOICE');
  end if;

  select gm.group_id into v_group_id
  from group_members gm where gm.participant_id = v_participant;
  if v_group_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GROUP');
  end if;

  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  if v_game.podium_filled_at is null then
    return jsonb_build_object('ok', false, 'code', 'VOTE_NOT_OPEN');
  end if;
  if v_game.post_podium_decision is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED',
                              'decision', v_game.post_podium_decision);
  end if;

  insert into game_votes (game_id, group_id, choice, cast_by)
  values (v_game.id, v_group_id, p_choice, v_participant)
  on conflict (game_id, group_id) do update set choice = excluded.choice, created_at = now();

  v_eligible := teams_still_playing(v_game.id);
  select count(*) filter (where choice = 'continue'),
         count(*) filter (where choice = 'abort')
    into v_continue, v_abort
  from game_votes gv
  join groups g on g.id = gv.group_id
  where gv.game_id = v_game.id and group_completed_stage(g.id) < 4;

  -- Decided as soon as one side has more than half of the teams still playing,
  -- so nobody waits on a team that has stopped paying attention.
  if v_continue * 2 > v_eligible or v_abort * 2 > v_eligible
     or v_continue + v_abort >= v_eligible then

    update games
    set post_podium_decision = case when v_abort > v_continue then 'abort' else 'continue' end,
        status = case when v_abort > v_continue then 'FINISHED' else status end,
        finished_at = case when v_abort > v_continue then coalesce(finished_at, now()) else finished_at end
    where id = v_game.id
    returning post_podium_decision into v_game.post_podium_decision;

    insert into notifications (game_id, title, message, type, audience, payload)
    values (
      v_game.id,
      case when v_game.post_podium_decision = 'abort'
           then 'The hunt has been stopped'
           else 'The hunt continues!' end,
      case when v_game.post_podium_decision = 'abort'
           then 'Most teams voted to stop. Please head to the finish line — thank you for playing!'
           else 'Most teams voted to keep going. Finish your remaining checkpoints!' end,
      'game_status', 'everyone',
      jsonb_build_object('decision', v_game.post_podium_decision,
                         'continue_votes', v_continue, 'abort_votes', v_abort,
                         'auto_dismiss_seconds', 10)
    )
    returning id into v_notif;

    insert into notification_recipients (notification_id, participant_id)
    select v_notif, p.id from participants p
    where p.game_id = v_game.id and p.status = 'active';

    insert into admin_audit_logs (game_id, admin_id, action, detail)
    values (v_game.id, null, 'POST_PODIUM_VOTE',
            jsonb_build_object('decision', v_game.post_podium_decision,
                               'continue', v_continue, 'abort', v_abort));
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'VOTED',
    'choice', p_choice,
    'continue_votes', v_continue,
    'abort_votes', v_abort,
    'teams_voting', v_eligible,
    'decision', v_game.post_podium_decision
  );
end;
$$;

grant execute on function cast_game_vote(text) to authenticated;
grant execute on function teams_still_playing(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- What a student needs to render the vote prompt
-- -----------------------------------------------------------------------------

create or replace function post_podium_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game     games%rowtype;
  v_group_id uuid := current_group_id();
  v_eligible integer;
  v_continue integer;
  v_abort    integer;
  v_mine     text;
begin
  select * into v_game from games order by created_at desc limit 1;
  if not found or v_game.podium_filled_at is null then
    return jsonb_build_object('open', false);
  end if;

  v_eligible := teams_still_playing(v_game.id);

  select count(*) filter (where choice = 'continue'),
         count(*) filter (where choice = 'abort')
    into v_continue, v_abort
  from game_votes gv
  join groups g on g.id = gv.group_id
  where gv.game_id = v_game.id and group_completed_stage(g.id) < 4;

  select choice into v_mine from game_votes
  where game_id = v_game.id and group_id = v_group_id;

  return jsonb_build_object(
    -- Opens five minutes after third place, and only for teams still playing.
    'open', v_game.post_podium_decision is null
            and now() >= v_game.podium_filled_at + interval '5 minutes'
            and v_group_id is not null
            and group_completed_stage(v_group_id) < 4,
    'podium_filled_at', v_game.podium_filled_at,
    'opens_at', v_game.podium_filled_at + interval '5 minutes',
    'decision', v_game.post_podium_decision,
    'my_vote', v_mine,
    'continue_votes', v_continue,
    'abort_votes', v_abort,
    'teams_voting', v_eligible
  );
end;
$$;

grant execute on function post_podium_state() to authenticated;
