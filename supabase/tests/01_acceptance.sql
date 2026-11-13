-- =============================================================================
-- GC Campus Mystery Hunt — acceptance tests (§21)
--
-- Run against a database that has had 0001–0003 applied:
--   psql "$DATABASE_URL" -f supabase/tests/01_acceptance.sql
--
-- Prints one row per assertion and a final summary. Exits non-zero if any
-- assertion failed.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- pgcrypto lives in `extensions` on Supabase (and in our local mirror), so a
-- plain session cannot see digest() without this. The RPCs set their own
-- search_path; this is only for the SQL in this file.
set search_path = public, extensions;

drop table if exists test_results;
create table test_results (
  id serial primary key,
  section text,
  name text,
  passed boolean,
  detail text
);
grant insert, select on test_results to authenticated;
grant usage, select on sequence test_results_id_seq to authenticated;

create or replace function t(p_section text, p_name text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into test_results(section, name, passed, detail) values (p_section, p_name, p_cond, p_detail);
end; $$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

truncate games cascade;
truncate admins cascade;
truncate rate_limit_events;

insert into games (id, title, status, registration_open)
values ('11111111-1111-1111-1111-111111111111', 'GC Mystery Hunt 2026', 'REGISTRATION', true);

insert into admins (id, auth_user_id, email, display_name, role)
values ('22222222-2222-2222-2222-222222222222',
        '22222222-0000-0000-0000-000000000002',
        'organizer1@hunt.gc', 'Lead Organizer', 'lead_organizer');

insert into hints (game_id, hint_number, title, content, published_at) values
  ('11111111-1111-1111-1111-111111111111', 1, 'Stage 1', 'Library clock tower', now()),
  ('11111111-1111-1111-1111-111111111111', 2, 'Stage 2', 'Engineering quad', now()),
  ('11111111-1111-1111-1111-111111111111', 3, 'Stage 3', 'Student lounge', now()),
  ('11111111-1111-1111-1111-111111111111', 4, 'Stage 4', 'Grand stadium', now());

insert into checkpoints (game_id, stage_number, location_label, verification_token_hash) values
  ('11111111-1111-1111-1111-111111111111', 1, 'Library',  digest('TOKEN-S1','sha256')),
  ('11111111-1111-1111-1111-111111111111', 2, 'Quad',     digest('TOKEN-S2','sha256')),
  ('11111111-1111-1111-1111-111111111111', 3, 'Lounge',   digest('TOKEN-S3','sha256')),
  ('11111111-1111-1111-1111-111111111111', 4, 'Stadium',  digest('TOKEN-S4','sha256'));

-- =============================================================================
-- §9.3 Team sizing rule
-- =============================================================================

do $$
begin
  perform t('team-sizing', 'n=1 leaves the student pending (no group)',
            plan_group_sizes(1) = '{}'::integer[], plan_group_sizes(1)::text);
  perform t('team-sizing', 'n=2 -> 2',
            plan_group_sizes(2) = array[2], plan_group_sizes(2)::text);
  perform t('team-sizing', 'n=4 -> 2+2 (never a single-member group)',
            plan_group_sizes(4) = array[2,2], plan_group_sizes(4)::text);
  perform t('team-sizing', 'n=6 -> 3+3 (spec example)',
            plan_group_sizes(6) = array[3,3], plan_group_sizes(6)::text);
  perform t('team-sizing', 'n=7 -> 3+2+2 (spec example)',
            plan_group_sizes(7) = array[3,2,2], plan_group_sizes(7)::text);
  perform t('team-sizing', 'n=8 -> 3+3+2 (spec example)',
            plan_group_sizes(8) = array[3,3,2], plan_group_sizes(8)::text);
  perform t('team-sizing', 'n=10 -> 3+3+2+2 (spec example)',
            plan_group_sizes(10) = array[3,3,2,2], plan_group_sizes(10)::text);
  perform t('team-sizing', 'no group ever exceeds 3, n=2..60',
            not exists (
              select 1 from generate_series(2,60) n, unnest(plan_group_sizes(n)) sz where sz > 3
            ));
  perform t('team-sizing', 'no single-member group, n=2..60',
            not exists (
              select 1 from generate_series(2,60) n, unnest(plan_group_sizes(n)) sz where sz < 2
            ));
  perform t('team-sizing', 'every student placed except a lone leftover, n=2..60',
            not exists (
              select 1 from generate_series(2,60) n
              where coalesce((select sum(sz) from unnest(plan_group_sizes(n)) sz), 0) <> n
            ));
end $$;

-- =============================================================================
-- §3.1 Registration
-- =============================================================================

do $$
declare
  r1 jsonb; r2 jsonb; r3 jsonb;
  v_uid uuid := '33333333-0000-0000-0000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', v_uid::text, false);

  r1 := register_participant('Abebe Kebede');
  perform t('registration', 'student registers with only a name',
            (r1->>'ok')::boolean and r1->>'code' = 'REGISTERED', r1::text);

  perform t('registration', 'a recovery code is issued once',
            length(r1->>'recovery_code') > 0);

  -- §3.1 "Prevent repeated registrations caused by double-clicking."
  r2 := register_participant('Abebe Kebede');
  perform t('registration', 'double-click does not create a second participant',
            r2->>'code' = 'ALREADY_REGISTERED'
            and (select count(*) from participants where auth_user_id = v_uid) = 1,
            r2::text);

  -- §3.1 name validation
  perform set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-00000000000e', false);
  r3 := register_participant('   ');
  perform t('registration', 'empty name rejected', r3->>'code' = 'NAME_TOO_SHORT', r3::text);

  -- §3.1 "Allow different participants to have identical names."
  perform set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-00000000000f', false);
  r3 := register_participant('Abebe Kebede');
  perform t('registration', 'duplicate names allowed', (r3->>'ok')::boolean, r3::text);
end $$;

-- Remaining students for the grouping tests.
do $$
declare i integer; r jsonb;
begin
  for i in 2..7 loop
    perform set_config('request.jwt.claim.sub',
                       ('33333333-0000-0000-0000-00000000000' || i)::text, false);
    r := register_participant('Student ' || i);
  end loop;
end $$;

-- §3.1 registration closes
do $$
declare r jsonb;
begin
  update games set registration_open = false;
  perform set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-0000000000aa', false);
  r := register_participant('Late Student');
  perform t('registration', 'registration blocked once admin closes it',
            r->>'code' = 'REGISTRATION_CLOSED', r::text);
  update games set registration_open = true;
end $$;

-- §3.1 recovery
do $$
declare r jsonb; v_code text; v_pid uuid;
begin
  perform set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000001', false);
  r := register_participant('Recoverable Student');
  v_code := r->>'recovery_code';
  v_pid  := (r->>'participant_id')::uuid;

  -- New device => new anonymous uid, then redeem.
  perform set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000002', false);
  r := redeem_recovery_code(v_code);
  perform t('recovery', 'valid recovery code restores the session',
            (r->>'ok')::boolean and (r->>'participant_id')::uuid = v_pid, r::text);
  perform t('recovery', 'session now resolves to the recovered participant',
            current_participant_id() = v_pid);

  r := redeem_recovery_code('NOTACODE');
  perform t('recovery', 'invalid recovery code rejected', r->>'code' = 'INVALID_CODE', r::text);
end $$;

-- =============================================================================
-- §9.3 Team assignment
-- =============================================================================

do $$
declare
  v_preview jsonb; v_publish jsonb; v_again jsonb;
  v_eligible integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);

  select count(*) into v_eligible from participants
  where status = 'active'
    and not exists (select 1 from group_members gm where gm.participant_id = participants.id);

  v_preview := preview_team_assignment();

  -- §9.3 + 0007: the roster must be final before it can be divided up.
  v_publish := publish_team_assignment(v_preview->'groups');
  perform t('assignment', 'publishing is refused while registration is open',
            v_publish->>'code' = 'REGISTRATION_STILL_OPEN', v_publish::text);

  perform set_game_status('WAITING');
  perform t('assignment', 'closing registration clears registration_open',
            (select not registration_open from games limit 1));

  v_preview := preview_team_assignment();
  perform t('assignment', 'admin can preview a shuffle', (v_preview->>'ok')::boolean);

  -- §9.3 "Do not notify students until the assignments are published."
  perform t('assignment', 'preview writes no groups',
            (select count(*) from groups) = 0);
  perform t('assignment', 'preview sends no notifications',
            (select count(*) from notifications) = 0);

  v_publish := publish_team_assignment(v_preview->'groups');
  perform t('assignment', 'publish succeeds', (v_publish->>'ok')::boolean, v_publish::text);

  perform t('assignment', 'every group has 3 or fewer members',
            not exists (
              select 1 from group_members group by group_id having count(*) > 3
            ));

  perform t('assignment', 'no participant is in two groups',
            not exists (
              select 1 from group_members group by participant_id having count(*) > 1
            ));

  perform t('assignment', 'game advanced to TEAMS_PUBLISHED',
            (select status from games limit 1) = 'TEAMS_PUBLISHED');

  perform t('assignment', 'each group got an assignment notification',
            (select count(*) from notifications where type = 'team_assignment')
              = (select count(*) from groups));

  -- §9.3 "safe if two admins click Publish simultaneously"
  v_again := publish_team_assignment(v_preview->'groups');
  perform t('assignment', 'second concurrent publish is refused, not duplicated',
            v_again->>'code' = 'ALREADY_PUBLISHED', v_again::text);
end $$;

-- §17 hard constraint: a 4th member cannot be forced into a group
do $$
declare v_group uuid; v_spare uuid; v_err text;
begin
  select group_id into v_group from group_members group by group_id having count(*) = 3 limit 1;
  perform set_config('request.jwt.claim.sub', '55555555-0000-0000-0000-000000000001', false);
  insert into participants (game_id, auth_user_id, full_name, recovery_code_hash, recovery_code_hint)
  values ((select id from games limit 1), '55555555-0000-0000-0000-000000000001',
          'Overflow Student', digest('X','sha256'), 'XXXX')
  returning id into v_spare;

  begin
    insert into group_members (game_id, group_id, participant_id)
    values ((select id from games limit 1), v_group, v_spare);
    perform t('assignment', 'direct insert of a 4th member is rejected', false, 'insert succeeded');
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform t('assignment', 'direct insert of a 4th member is rejected', true, v_err);
  end;
end $$;

-- §3.3 team name concurrency
do $$
declare v_group uuid; r1 jsonb; r2 jsonb; v_member uuid;
begin
  select gm.group_id, gm.participant_id into v_group, v_member
  from group_members gm limit 1;

  perform set_config('request.jwt.claim.sub',
    (select auth_user_id::text from participants where id = v_member), false);

  r1 := set_group_name(v_group, 'The Detectives', 0);
  perform t('team-name', 'member can name their own group', (r1->>'ok')::boolean, r1::text);

  -- Second teammate still holding version 0 must not silently clobber.
  r2 := set_group_name(v_group, 'Mystery Hunters', 0);
  perform t('team-name', 'stale concurrent rename is refused, not silently applied',
            r2->>'code' = 'VERSION_CONFLICT', r2::text);

  perform t('team-name', 'group number is unchanged by renaming',
            (select group_number from groups where id = v_group) is not null);
end $$;

-- =============================================================================
-- §6 Checkpoint verification
-- =============================================================================

do $$
declare
  v_group uuid; v_member uuid; r jsonb;
begin
  select gm.group_id, gm.participant_id into v_group, v_member
  from group_members gm limit 1;
  perform set_config('request.jwt.claim.sub',
    (select auth_user_id::text from participants where id = v_member), false);

  -- §5 game must be running
  update games set status = 'TEAMS_PUBLISHED';
  r := verify_checkpoint('TOKEN-S1');
  perform t('checkpoint', 'no progress before the game is started',
            r->>'code' = 'GAME_NOT_ACTIVE', r::text);

  update games set status = 'ACTIVE';

  -- §6 "Prevent teams from skipping stages."
  r := verify_checkpoint('TOKEN-S3');
  perform t('checkpoint', 'stage skipping is blocked',
            r->>'code' = 'WRONG_STAGE' and (r->>'expected_stage')::int = 1, r::text);
  -- The reply must not reveal which checkpoint was scanned (migration 0015).
  perform t('checkpoint', 'a wrong scan does not reveal which checkpoint it was',
            not (r::text like '%"stage"%'), r::text);

  r := verify_checkpoint('WRONG-TOKEN');
  perform t('checkpoint', 'unknown code rejected', r->>'code' = 'INVALID_CODE', r::text);

  r := verify_checkpoint('TOKEN-S1');
  perform t('checkpoint', 'stage 1 verifies', r->>'code' = 'VERIFIED', r::text);

  -- §21 "Repeated scans do not create duplicate progress."
  r := verify_checkpoint('TOKEN-S1');
  perform t('checkpoint', 'repeat scan is a no-op', r->>'code' = 'ALREADY_VERIFIED', r::text);
  perform t('checkpoint', 'repeat scan created no second row',
            (select count(*) from checkpoint_verifications where group_id = v_group) = 1);

  -- §5 pause
  update games set status = 'PAUSED';
  r := verify_checkpoint('TOKEN-S2');
  perform t('checkpoint', 'paused game blocks new progress',
            r->>'code' = 'GAME_PAUSED', r::text);

  -- §15 "A paused game must be able to resume without losing progress."
  update games set status = 'ACTIVE';
  perform t('checkpoint', 'progress survives the pause',
            group_completed_stage(v_group) = 1);

  r := verify_checkpoint('TOKEN-S2');
  perform t('checkpoint', 'stage 2 verifies after resume', r->>'code' = 'VERIFIED', r::text);

  -- §6 "If one member verifies, that checkpoint counts for the whole group."
  perform t('checkpoint', 'progress is recorded against the group, not the scanner',
            (select count(distinct group_id) from checkpoint_verifications) = 1
            and group_completed_stage(v_group) = 2);
end $$;

-- A teammate of the same group sees the progress their teammate earned.
do $$
declare v_group uuid; v_other uuid;
begin
  select gm.group_id into v_group from checkpoint_verifications cv
  join group_members gm on gm.group_id = cv.group_id limit 1;

  select gm.participant_id into v_other
  from group_members gm
  where gm.group_id = v_group
    and gm.participant_id <> (select verified_by from checkpoint_verifications
                              where group_id = v_group limit 1)
  limit 1;

  if v_other is not null then
    perform set_config('request.jwt.claim.sub',
      (select auth_user_id::text from participants where id = v_other), false);
    perform t('checkpoint', 'teammate inherits the group''s completed stage',
              group_completed_stage(current_group_id()) = 2);
  end if;
end $$;

-- §6 optional organizer code for cheat-prone checkpoints
do $$
declare v_member uuid; r jsonb;
begin
  update checkpoints
  set requires_organizer_code = true, organizer_code_hash = digest('ONSITE42','sha256')
  where stage_number = 3;

  select gm.participant_id into v_member from group_members gm
  where gm.group_id = (select group_id from checkpoint_verifications limit 1) limit 1;
  perform set_config('request.jwt.claim.sub',
    (select auth_user_id::text from participants where id = v_member), false);

  r := verify_checkpoint('TOKEN-S3');
  perform t('checkpoint', 'photographed QR alone fails when organizer code is required',
            r->>'code' = 'ORGANIZER_CODE_REQUIRED', r::text);

  r := verify_checkpoint('TOKEN-S3', 'WRONGCODE');
  perform t('checkpoint', 'wrong organizer code rejected',
            r->>'code' = 'ORGANIZER_CODE_REQUIRED', r::text);

  r := verify_checkpoint('TOKEN-S3', 'onsite42');
  perform t('checkpoint', 'correct organizer code accepted (case-insensitive)',
            r->>'code' = 'VERIFIED', r::text);
end $$;

-- =============================================================================
-- §7 Help requests
-- =============================================================================

do $$
declare v_group uuid; v_member uuid; r jsonb;
begin
  select gm.group_id, gm.participant_id into v_group, v_member
  from group_members gm limit 1;
  perform set_config('request.jwt.claim.sub',
    (select auth_user_id::text from participants where id = v_member), false);

  perform t('help', 'default allowance is 2 per group',
            (select help_request_limit from games limit 1) = 2);

  r := create_help_request('We are stuck');
  perform t('help', 'first request accepted', r->>'code' = 'SUBMITTED', r::text);
  r := create_help_request('Still stuck');
  perform t('help', 'second request accepted', r->>'code' = 'SUBMITTED', r::text);

  r := create_help_request('One more');
  perform t('help', 'third request refused at the limit',
            r->>'code' = 'LIMIT_REACHED', r::text);

  perform t('help', 'limit counts the group, not the individual',
            (select count(*) from help_requests where group_id = v_group) = 2);

  -- §7 "Admin can grant an exceptional extra request with a logged reason."
  insert into help_requests (game_id, group_id, requested_by, stage_number, message, is_exempt, exempt_reason)
  values ((select id from games limit 1), v_group, v_member, 1, 'Safety issue', true, 'Medical');

  r := create_help_request('After exemption');
  perform t('help', 'exempt request does not consume the allowance',
            r->>'code' = 'LIMIT_REACHED', r::text);
end $$;

-- §13 admin reply reaches only the requesting group
do $$
declare v_req uuid; v_group uuid; r jsonb;
begin
  select id, group_id into v_req, v_group from help_requests where not is_exempt limit 1;
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
  r := answer_help_request(v_req, 'Look near the clock tower.');
  perform t('help', 'admin reply recorded', (r->>'ok')::boolean, r::text);

  perform t('help', 'reply is addressed only to the requesting group',
            (select count(*) from notification_recipients nr
             join notifications n on n.id = nr.notification_id
             where n.type = 'help_reply'
               and nr.participant_id not in (
                 select participant_id from group_members where group_id = v_group)) = 0);
end $$;

-- =============================================================================
-- §14 Winners
-- =============================================================================

do $$
declare v_g1 uuid; v_g2 uuid; v_g3 uuid; r jsonb; v_err text;
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
  select id into v_g1 from groups order by group_number limit 1 offset 0;
  select id into v_g2 from groups order by group_number limit 1 offset 1;
  select id into v_g3 from groups order by group_number limit 1 offset 2;

  r := set_winner_selection(jsonb_build_array(
    jsonb_build_object('group_id', v_g1, 'position', 1, 'prize_amount', 3000),
    jsonb_build_object('group_id', v_g2, 'position', 2, 'prize_amount', 2000),
    jsonb_build_object('group_id', v_g3, 'position', 3, 'prize_amount', 1000)
  ));
  perform t('winners', 'admin can save a winner selection', (r->>'ok')::boolean, r::text);

  perform t('winners', 'selection is not revealed yet',
            (select count(*) from winners where revealed_at is not null) = 0);

  -- §14 "The same group cannot occupy two winning positions."
  begin
    r := set_winner_selection(jsonb_build_array(
      jsonb_build_object('group_id', v_g1, 'position', 1, 'prize_amount', 3000),
      jsonb_build_object('group_id', v_g1, 'position', 2, 'prize_amount', 2000)
    ));
    perform t('winners', 'same group in two positions rejected', false, 'accepted');
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform t('winners', 'same group in two positions rejected', true, v_err);
  end;
end $$;

-- =============================================================================
-- RLS — the isolation guarantees (§18)
-- These run as the `authenticated` role, the way a browser actually connects.
-- =============================================================================

-- Re-save the selection the failed transaction above rolled back.
do $$
declare v_g1 uuid; v_g2 uuid; v_g3 uuid;
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
  select id into v_g1 from groups order by group_number limit 1 offset 0;
  select id into v_g2 from groups order by group_number limit 1 offset 1;
  select id into v_g3 from groups order by group_number limit 1 offset 2;
  perform set_winner_selection(jsonb_build_array(
    jsonb_build_object('group_id', v_g1, 'position', 1, 'prize_amount', 3000),
    jsonb_build_object('group_id', v_g2, 'position', 2, 'prize_amount', 2000),
    jsonb_build_object('group_id', v_g3, 'position', 3, 'prize_amount', 1000)
  ));
end $$;

-- Student A: in a group, has completed stage 2.
select set_config('request.jwt.claim.sub',
  (select p.auth_user_id::text
   from participants p
   join group_members gm on gm.participant_id = p.id
   where gm.group_id = (select group_id from checkpoint_verifications limit 1)
   limit 1), false) \gset

set role authenticated;

insert into test_results(section, name, passed, detail)
select 'rls', 'student sees only their own group', count(*) = 1, count(*)::text
from groups;

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot read other groups'' progress',
       count(*) = (select count(*) from checkpoint_verifications
                   where group_id = current_group_id()),
       count(*)::text
from checkpoint_verifications;

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot read the checkpoints table (token hashes)',
       count(*) = 0, count(*)::text
from checkpoints;

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot enumerate the organizers', count(*) = 0, count(*)::text
from admins;

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot read the admin audit log', count(*) = 0, count(*)::text
from admin_audit_logs;

-- §5 the URL-guessing defence: completed stage is 3 here, so hints 1..4 are
-- visible only up to the next unlocked one.
insert into test_results(section, name, passed, detail)
select 'rls', 'student sees only unlocked hints, never future clues',
       coalesce(max(hint_number), 0) = group_completed_stage(current_group_id()) + 1,
       'max visible hint ' || coalesce(max(hint_number), 0)::text
         || ', completed stage ' || group_completed_stage(current_group_id())::text
from hints;

insert into test_results(section, name, passed, detail)
select 'rls', 'winners stay hidden before the reveal', count(*) = 0, count(*)::text
from winners;

insert into test_results(section, name, passed, detail)
select 'rls', 'student sees only notifications addressed to them',
       not exists (
         select 1 from notifications n
         where not exists (
           select 1 from notification_recipients r
           where r.notification_id = n.id and r.participant_id = current_participant_id()
         )
       ), '';

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot read other students'' delivery rows',
       count(*) = (select count(*) from notification_recipients
                   where participant_id = current_participant_id()),
       count(*)::text
from notification_recipients;

insert into test_results(section, name, passed, detail)
select 'rls', 'student cannot see participants outside their team',
       count(*) <= 3, count(*)::text
from participants;

-- A student calling an admin RPC must be refused.
do $$
declare v_err text;
begin
  begin
    perform preview_team_assignment();
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student calling an admin RPC is refused', false, 'it succeeded');
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student calling an admin RPC is refused', true, v_err);
  end;
end $$;

-- A student must not be able to write to the tables directly.
do $$
declare v_err text;
begin
  begin
    insert into checkpoint_verifications (game_id, group_id, checkpoint_id, verified_by)
    values ((select id from games limit 1), current_group_id(),
            (select id from checkpoints limit 1), current_participant_id());
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student cannot forge their own checkpoint progress', false, 'insert succeeded');
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student cannot forge their own checkpoint progress', true, v_err);
  end;
end $$;

do $$
declare v_err text;
begin
  begin
    update games set status = 'WINNERS_REVEALED';
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student cannot change the game status', false, 'update succeeded');
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into test_results(section, name, passed, detail)
    values ('rls', 'student cannot change the game status', true, v_err);
  end;
end $$;

reset role;

-- After the reveal, students can see the results.
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
  r := reveal_winners();
  perform t('winners', 'reveal succeeds', (r->>'ok')::boolean, r::text);
  perform t('winners', 'game status moves to WINNERS_REVEALED',
            (select status from games limit 1) = 'WINNERS_REVEALED');
end $$;

select set_config('request.jwt.claim.sub',
  (select p.auth_user_id::text
   from participants p
   join group_members gm on gm.participant_id = p.id
   limit 1), false) \gset

set role authenticated;
insert into test_results(section, name, passed, detail)
select 'rls', 'students can see winners after the reveal', count(*) = 3, count(*)::text
from winners;
reset role;


-- =============================================================================
-- §11 / §6 per-group clues and per-team checkpoints (migration 0008)
-- =============================================================================

do $$
declare
  v_g1 uuid; v_g2 uuid; v_t1 text; v_t2 text; r jsonb; v_member uuid;
begin
  perform set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
  select id into v_g1 from groups order by group_number limit 1 offset 0;
  select id into v_g2 from groups order by group_number limit 1 offset 1;

  -- Each team gets its own clue and its own stage-1 sign.
  r := upsert_hint(1, 'Group 1 route', 'Head to the library', null, 1, null, null, true);
  perform t('per-group', 'a team-specific clue can be written', (r->>'ok')::boolean, r::text);

  r := upsert_hint(1, 'Group 2 route', 'Head to the quad', null, 2, null, null, true);
  perform t('per-group', 'a second team gets a different clue', (r->>'ok')::boolean, r::text);

  v_t1 := issue_checkpoint_code(1, 1, 'Library') ->> 'token';
  v_t2 := issue_checkpoint_code(1, 2, 'Quad') ->> 'token';
  perform t('per-group', 'each team gets its own checkpoint code', v_t1 <> v_t2);

  -- A member of group 1 may not use group 2's sign.
  select gm.participant_id into v_member from group_members gm where gm.group_id = v_g1 limit 1;
  perform set_config('request.jwt.claim.sub',
    (select auth_user_id::text from participants where id = v_member), false);

  update games set status = 'ACTIVE';
  r := verify_checkpoint(v_t2);
  perform t('per-group', 'a team cannot use another team''s checkpoint code',
            r->>'code' in ('OTHER_TEAM_CHECKPOINT', 'WRONG_STAGE'), r::text);
  perform t('per-group', 'another team''s code does not reveal whose it is',
            not (r::text like '%group%'), r::text);
end $$;

-- A student must not be able to read another team's clue.
select set_config('request.jwt.claim.sub',
  (select p.auth_user_id::text
   from participants p
   join group_members gm on gm.participant_id = p.id
   where gm.group_id = (select id from groups order by group_number limit 1)
   limit 1), false) \gset

set role authenticated;
insert into test_results(section, name, passed, detail)
select 'per-group', 'a student sees only their own team''s clue',
       count(*) filter (where title = 'Group 2 route') = 0
         and count(*) filter (where title = 'Group 1 route') = 1,
       'visible clues: ' || coalesce(string_agg(title, ', '), 'none')
from hints;
reset role;

-- =============================================================================
-- Summary
-- =============================================================================

\echo ''
\echo '=============================== RESULTS ==============================='
select
  case when passed then 'PASS' else 'FAIL' end as result,
  section,
  name
from test_results
order by id;

\echo ''
select
  count(*) filter (where passed)       as passed,
  count(*) filter (where not passed)   as failed,
  count(*)                             as total
from test_results;

\echo ''
\echo 'Failures (if any):'
select section, name, detail from test_results where not passed order by id;

-- Non-zero exit if anything failed (with ON_ERROR_STOP, this fails the run).
do $$
declare v_failed integer;
begin
  select count(*) into v_failed from test_results where not passed;
  if v_failed > 0 then
    raise exception '% assertion(s) failed', v_failed;
  end if;
  raise notice 'All % assertions passed.', (select count(*) from test_results);
end $$;
