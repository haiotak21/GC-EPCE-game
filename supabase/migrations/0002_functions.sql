-- =============================================================================
-- Game for power unity! — 0002 identity helpers and transactional RPCs
--
-- Every rule the browser must not be trusted with lives here (§18: "Never trust
-- a role or group ID supplied by the browser alone"). The client calls these;
-- it never writes to the tables directly.
--
-- All SECURITY DEFINER functions pin search_path so a caller cannot shadow a
-- table name and redirect the function to their own object.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity helpers
-- -----------------------------------------------------------------------------

create or replace function current_participant_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select p.id
  from participants p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

create or replace function current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select a.id
  from admins a
  where a.auth_user_id = auth.uid()
    and a.active
  limit 1;
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from admins a where a.auth_user_id = auth.uid() and a.active
  );
$$;

create or replace function current_group_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select gm.group_id
  from group_members gm
  join participants p on p.id = gm.participant_id
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

-- Highest consecutively verified stage for a group. Stage N+1 is the only
-- checkpoint that group may verify next (§6 "Prevent teams from skipping
-- stages") and the highest hint they may read (§5 "Future hints must remain
-- hidden until unlocked").
create or replace function group_completed_stage(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(max(c.stage_number), 0)
  from checkpoint_verifications v
  join checkpoints c on c.id = v.checkpoint_id
  where v.group_id = p_group_id
    -- only count an unbroken run from stage 1
    and not exists (
      select 1 from generate_series(1, c.stage_number) s
      where not exists (
        select 1
        from checkpoint_verifications v2
        join checkpoints c2 on c2.id = v2.checkpoint_id
        where v2.group_id = p_group_id and c2.stage_number = s
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (§18)
-- -----------------------------------------------------------------------------

create or replace function check_rate_limit(
  p_bucket   text,
  p_subject  text,
  p_max      integer,
  p_window   interval
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  delete from rate_limit_events
  where created_at < now() - interval '1 day';

  select count(*) into v_count
  from rate_limit_events
  where bucket = p_bucket
    and subject = p_subject
    and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'rate limit exceeded for %', p_bucket
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;

  insert into rate_limit_events(bucket, subject) values (p_bucket, p_subject);
end;
$$;

-- -----------------------------------------------------------------------------
-- §3.1 Registration
--
-- The caller must already hold an anonymous Supabase session, so auth.uid() is
-- a real identity. Re-calling with the same uid returns the existing record
-- rather than creating a second one — this is what makes double-clicking
-- "Join Challenge" harmless (§3.1 "Prevent repeated registrations caused by
-- double-clicking").
-- -----------------------------------------------------------------------------

create or replace function register_participant(p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game       games%rowtype;
  v_existing   participants%rowtype;
  v_code       text;
  v_id         uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    return jsonb_build_object('ok', false, 'code', 'NAME_TOO_SHORT');
  end if;

  -- Idempotent: same auth user => same participant.
  select * into v_existing from participants where auth_user_id = auth.uid();
  if found then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_REGISTERED',
      'participant_id', v_existing.id,
      'full_name', v_existing.full_name
    );
  end if;

  perform check_rate_limit('register', auth.uid()::text, 3, interval '1 hour');

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- §3.1 "Registration must be unavailable when the admin closes registration."
  if not v_game.registration_open or v_game.status <> 'REGISTRATION' then
    return jsonb_build_object('ok', false, 'code', 'REGISTRATION_CLOSED');
  end if;

  -- Ambiguity-free alphabet (no O/0/I/1) because students read this aloud.
  v_code := upper(
    substr(translate(encode(gen_random_bytes(12), 'base64'), '+/=OI01lo', ''), 1, 8)
  );

  insert into participants (game_id, auth_user_id, full_name, recovery_code_hash, recovery_code_hint)
  values (
    v_game.id,
    auth.uid(),
    btrim(p_full_name),
    digest(v_code, 'sha256'),
    right(v_code, 4)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'code', 'REGISTERED',
    'participant_id', v_id,
    -- Shown to the student once; only the hash is retained.
    'recovery_code', v_code
  );
end;
$$;

-- §3.1 "Provide a secure recovery method if a student loses their session."
-- The student signs in anonymously on the new device, then redeems the code,
-- which re-points their participant row at the new auth uid.
create or replace function redeem_recovery_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant participants%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  perform check_rate_limit('recover', auth.uid()::text, 10, interval '1 hour');

  select * into v_participant
  from participants
  where recovery_code_hash = digest(upper(btrim(p_code)), 'sha256')
    and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;

  update participants set auth_user_id = auth.uid() where id = v_participant.id;

  return jsonb_build_object(
    'ok', true, 'code', 'RECOVERED',
    'participant_id', v_participant.id,
    'full_name', v_participant.full_name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- §9.3 Team assignment
--
-- Sizing rule, taken from the worked examples in the spec:
--   n % 3 = 0  ->  all threes                 (6 -> 3+3)
--   n % 3 = 2  ->  threes + one pair          (8 -> 3+3+2)
--   n % 3 = 1  ->  threes + two pairs         (7 -> 3+2+2, 10 -> 3+3+2+2)
--   n = 1      ->  no group; left pending for admin review
-- This never produces a single-member group, per "Avoid single-member groups
-- when groups of 2 can be created".
-- -----------------------------------------------------------------------------

create or replace function plan_group_sizes(n integer)
returns integer[]
language plpgsql
immutable
as $$
declare
  sizes integer[] := '{}';
  threes integer;
  i integer;
begin
  if n < 2 then
    return sizes;                       -- 0 students, or 1 left pending
  end if;

  if n % 3 = 0 then
    threes := n / 3;
  elsif n % 3 = 2 then
    threes := (n - 2) / 3;
  else                                  -- n % 3 = 1, and n >= 4
    threes := (n - 4) / 3;
  end if;

  for i in 1..threes loop
    sizes := sizes || 3;
  end loop;

  if n % 3 = 2 then
    sizes := sizes || 2;
  elsif n % 3 = 1 then
    sizes := sizes || 2 || 2;
  end if;

  return sizes;
end;
$$;

-- Read-only: produces a shuffle for the admin to look at. Writes nothing and
-- notifies nobody (§9.3 "Do not notify students until the assignments are
-- published"), so Shuffle Again is free to call repeatedly.
create or replace function preview_team_assignment()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game    games%rowtype;
  v_ids     uuid[];
  v_sizes   integer[];
  v_groups  jsonb := '[]'::jsonb;
  v_cursor  integer := 1;
  i         integer;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- Only students not already in a group are eligible.
  select coalesce(array_agg(p.id order by random()), '{}')
  into v_ids
  from participants p
  where p.game_id = v_game.id
    and p.status = 'active'
    and not exists (select 1 from group_members gm where gm.participant_id = p.id);

  v_sizes := plan_group_sizes(array_length(v_ids, 1));

  for i in 1..coalesce(array_length(v_sizes, 1), 0) loop
    v_groups := v_groups || jsonb_build_object(
      'group_number', i,
      'participant_ids', to_jsonb(v_ids[v_cursor : v_cursor + v_sizes[i] - 1])
    );
    v_cursor := v_cursor + v_sizes[i];
  end loop;

  return jsonb_build_object(
    'ok', true,
    'groups', v_groups,
    -- §9.3 "If only one student remains, leave the student pending for admin review."
    'pending_participant_ids',
      to_jsonb(coalesce(v_ids[v_cursor : coalesce(array_length(v_ids, 1), 0)], '{}'))
  );
end;
$$;

-- Atomic publish. Takes the exact preview the admin approved so that what they
-- saw is what ships. The lock on the game row is what makes two admins pressing
-- Publish simultaneously safe (§9.3 "The operation must be safe if two admins
-- click Publish simultaneously").
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
      -- The capacity trigger and the one-group-per-game constraint both fire
      -- here; a bad payload aborts the whole transaction rather than half
      -- publishing.
      insert into group_members (game_id, group_id, participant_id)
      values (v_game.id, v_group_id, v_pid);
    end loop;

    -- §9.3 step 7: real-time assignment notification, one per group.
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

-- §3.3 Team name, with optimistic concurrency so two teammates renaming at the
-- same time cannot silently clobber each other.
create or replace function set_group_name(
  p_group_id uuid,
  p_name text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_group groups%rowtype;
begin
  select * into v_group from groups where id = p_group_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- A student may rename only their own group; an admin may rename any
  -- (§3.3 "Admin can edit inappropriate names").
  if not is_admin() and current_group_id() is distinct from p_group_id then
    raise exception 'not your group' using errcode = '42501';
  end if;

  if v_group.name_version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'VERSION_CONFLICT',
      'current_name', v_group.group_name,
      'current_version', v_group.name_version
    );
  end if;

  update groups
  set group_name = btrim(p_name), name_version = name_version + 1
  where id = p_group_id;

  return jsonb_build_object('ok', true, 'code', 'RENAMED', 'version', v_group.name_version + 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- §6 Checkpoint verification
--
-- The client sends the raw token from the QR code; the server hashes and
-- matches it. Group progress, stage ordering, pause state and idempotency are
-- all decided here, never in the browser.
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
  v_game         games%rowtype;
  v_checkpoint   checkpoints%rowtype;
  v_completed    integer;
  v_inserted     uuid;
  v_notif        uuid;
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  select gm.group_id into v_group_id
  from group_members gm where gm.participant_id = v_participant;

  if v_group_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GROUP');
  end if;

  -- Serialise two teammates scanning the same sign at the same moment.
  perform 1 from groups where id = v_group_id for update;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  -- §5 "If the admin pauses the game, new checkpoint progress must temporarily stop."
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

  -- §6 optional second factor for checkpoints where a photographed QR is a
  -- real risk: an organizer code handed out on site.
  if v_checkpoint.requires_organizer_code then
    if p_organizer_code is null
       or digest(upper(btrim(p_organizer_code)), 'sha256') <> v_checkpoint.organizer_code_hash then
      return jsonb_build_object(
        'ok', false, 'code', 'ORGANIZER_CODE_REQUIRED',
        'stage', v_checkpoint.stage_number
      );
    end if;
  end if;

  v_completed := group_completed_stage(v_group_id);

  -- Already done: a repeat scan is a no-op, not duplicate progress
  -- (§21 "Repeated scans do not create duplicate progress").
  if exists (
    select 1 from checkpoint_verifications
    where group_id = v_group_id and checkpoint_id = v_checkpoint.id
  ) then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_VERIFIED',
      'stage', v_checkpoint.stage_number,
      'completed_stage', v_completed
    );
  end if;

  -- §6 "Prevent teams from skipping stages."
  if v_checkpoint.stage_number <> v_completed + 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'WRONG_STAGE',
      'stage', v_checkpoint.stage_number,
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

  -- §6 "Notify the group's members of successful verification."
  insert into notifications (game_id, title, message, type, audience, payload)
  values (
    v_game.id,
    'Checkpoint ' || v_checkpoint.stage_number || ' verified',
    'Your team reached ' || v_checkpoint.location_label || '.',
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

-- -----------------------------------------------------------------------------
-- §7 Help requests
--
-- The allowance is per group, and the group row lock means several teammates
-- pressing the button together cannot push the team over the limit
-- (§7 "Multiple teammates clicking simultaneously must not exceed the limit").
-- -----------------------------------------------------------------------------

create or replace function create_help_request(p_message text, p_stage integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant uuid := current_participant_id();
  v_group_id    uuid;
  v_game        games%rowtype;
  v_used        integer;
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

  perform 1 from groups where id = v_group_id for update;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  perform check_rate_limit('help_request', v_group_id::text, 5, interval '5 minutes');

  select count(*) into v_used
  from help_requests
  where group_id = v_group_id and not is_exempt;

  if v_used >= v_game.help_request_limit then
    return jsonb_build_object(
      'ok', false, 'code', 'LIMIT_REACHED',
      'used', v_used, 'limit', v_game.help_request_limit
    );
  end if;

  v_stage := coalesce(p_stage, least(group_completed_stage(v_group_id) + 1, 4));

  insert into help_requests (game_id, group_id, requested_by, stage_number, message)
  values (v_game.id, v_group_id, v_participant, v_stage, btrim(coalesce(p_message, '')))
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'code', 'SUBMITTED',
    'request_id', v_id,
    'remaining', v_game.help_request_limit - v_used - 1
  );
end;
$$;

-- §13 Admin reply. Visible only to the requesting group (§7 "A response must
-- only be visible to the requesting group") — enforced by writing recipient
-- rows for that group alone.
create or replace function answer_help_request(p_request_id uuid, p_reply text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_request help_requests%rowtype;
  v_notif   uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_request from help_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update help_requests
  set status = 'answered', admin_reply = btrim(p_reply), answered_by = v_admin, answered_at = now()
  where id = p_request_id;

  insert into notifications (game_id, title, message, type, audience, created_by, payload)
  values (
    v_request.game_id, 'Reply from the organizers', btrim(p_reply),
    'help_reply', 'groups', v_admin,
    jsonb_build_object('group_id', v_request.group_id, 'help_request_id', p_request_id)
  )
  returning id into v_notif;

  insert into notification_recipients (notification_id, participant_id)
  select v_notif, gm.participant_id from group_members gm where gm.group_id = v_request.group_id;

  insert into admin_audit_logs (game_id, admin_id, action, target_id)
  values (v_request.game_id, v_admin, 'ANSWER_HELP_REQUEST', p_request_id);

  return jsonb_build_object('ok', true, 'code', 'ANSWERED');
end;
$$;

-- -----------------------------------------------------------------------------
-- §10 Notification fan-out
--
-- Recipients are resolved server-side from the audience, so a student can never
-- be handed someone else's message by tampering with the request.
-- -----------------------------------------------------------------------------

create or replace function send_notification(
  p_title text,
  p_message text,
  p_type notification_type default 'announcement',
  p_audience notification_audience default 'everyone',
  p_target_ids uuid[] default null,
  p_media_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_notif uuid;
  v_count integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  insert into notifications (game_id, title, message, type, audience, media_url, created_by)
  values (v_game.id, p_title, p_message, p_type, p_audience, p_media_url, v_admin)
  returning id into v_notif;

  if p_audience = 'everyone' then
    insert into notification_recipients (notification_id, participant_id)
    select v_notif, p.id from participants p
    where p.game_id = v_game.id and p.status = 'active';

  elsif p_audience = 'groups' then
    insert into notification_recipients (notification_id, participant_id)
    select distinct v_notif, gm.participant_id
    from group_members gm
    where gm.group_id = any(p_target_ids);

  elsif p_audience = 'participants' then
    insert into notification_recipients (notification_id, participant_id)
    select v_notif, p.id from participants p
    where p.id = any(p_target_ids) and p.status = 'active';
  end if;

  get diagnostics v_count = row_count;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game.id, v_admin, 'SEND_NOTIFICATION', v_notif,
          jsonb_build_object('audience', p_audience, 'recipients', v_count));

  return jsonb_build_object('ok', true, 'notification_id', v_notif, 'recipients', v_count);
end;
$$;

create or replace function mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_participant uuid := current_participant_id();
begin
  if v_participant is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION');
  end if;

  update notification_recipients
  set read_at = coalesce(read_at, now())
  where notification_id = p_notification_id and participant_id = v_participant;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- §14 Winners
--
-- Selections are written with revealed_at null and stay invisible to students
-- until reveal_winners flips the game status (§14 "Winner selections remain
-- private until publication").
-- -----------------------------------------------------------------------------

create or replace function set_winner_selection(p_selections jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_sel   jsonb;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  if exists (select 1 from winners where game_id = v_game.id and revealed_at is not null) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REVEALED');
  end if;

  delete from winners where game_id = v_game.id;

  -- The unique constraints on (game_id, position) and (game_id, group_id)
  -- reject a duplicate group or position (§14).
  for v_sel in select * from jsonb_array_elements(p_selections)
  loop
    insert into winners (game_id, group_id, position, prize_amount)
    values (
      v_game.id,
      (v_sel->>'group_id')::uuid,
      (v_sel->>'position')::integer,
      (v_sel->>'prize_amount')::numeric
    );
  end loop;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'SET_WINNER_SELECTION', p_selections);

  return jsonb_build_object('ok', true, 'code', 'SAVED');
end;
$$;

create or replace function reveal_winners()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_notif uuid;
  v_count integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select count(*) into v_count from winners where game_id = v_game.id;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'NO_SELECTION');
  end if;

  if v_game.status = 'WINNERS_REVEALED' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REVEALED');
  end if;

  update winners set revealed_at = now() where game_id = v_game.id and revealed_at is null;
  update games set status = 'WINNERS_REVEALED', finished_at = coalesce(finished_at, now())
  where id = v_game.id;

  insert into notifications (game_id, title, message, type, audience, created_by)
  values (v_game.id, 'Winners announced', 'The results are in!', 'winners', 'everyone', v_admin)
  returning id into v_notif;

  insert into notification_recipients (notification_id, participant_id)
  select v_notif, p.id from participants p where p.game_id = v_game.id and p.status = 'active';

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'REVEAL_WINNERS', jsonb_build_object('positions', v_count));

  return jsonb_build_object('ok', true, 'code', 'REVEALED');
end;
$$;

-- -----------------------------------------------------------------------------
-- §15 Game status transitions
-- -----------------------------------------------------------------------------

create or replace function set_game_status(p_status game_status)
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

  select * into v_game from games where status <> 'FINISHED' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  update games
  set status = p_status,
      registration_open = (p_status = 'REGISTRATION'),
      started_at  = case when p_status = 'ACTIVE' then coalesce(started_at, now()) else started_at end,
      finished_at = case when p_status in ('FINISHED','WINNERS_REVEALED')
                         then coalesce(finished_at, now()) else finished_at end
  where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'SET_GAME_STATUS',
          jsonb_build_object('from', v_game.status, 'to', p_status));

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;
