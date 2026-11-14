-- =============================================================================
-- GC Campus Mystery Hunt — complete backend setup
-- Paste this whole file into the Supabase SQL Editor and press Run.
--
-- For a BRAND-NEW project only. It creates tables and types, so running it a
-- second time fails with "already exists" — that is expected, and harmless.
-- To update an existing project, run the individual numbered migration files
-- in supabase/migrations/ instead; each of those IS safe to run again.
-- =============================================================================

-- =============================================================================
-- GC Campus Mystery Hunt — 0001 core schema
-- Requirements ref: §15 game states, §17 tables + constraints
--
-- All timestamps are stored in UTC (timestamptz). Display conversion to
-- Africa/Addis_Ababa happens in the application layer (§19).
-- =============================================================================

-- Supabase installs extensions into the `extensions` schema, not `public`.
-- Mirror that here so local and hosted behave identically; both statements
-- are no-ops on a Supabase project where pgcrypto already exists there.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- §15 Game Status Management — exactly the seven specified states.
create type game_status as enum (
  'REGISTRATION',
  'WAITING',
  'TEAMS_PUBLISHED',
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'WINNERS_REVEALED'
);

create type participant_status as enum ('active', 'removed');

create type admin_role as enum ('lead_organizer', 'clue_master', 'safety_marshal');

create type notification_type as enum (
  'announcement',
  'team_assignment',
  'hint',
  'help_reply',
  'game_status',
  'winners'
);

create type notification_audience as enum ('everyone', 'groups', 'participants');

create type help_request_status as enum ('pending', 'answered');

create type verification_method as enum ('qr_scan', 'organizer_code', 'staff_override');

-- -----------------------------------------------------------------------------
-- games
-- -----------------------------------------------------------------------------

create table games (
  id                  uuid primary key default gen_random_uuid(),
  title               text        not null,
  status              game_status not null default 'REGISTRATION',
  registration_open   boolean     not null default true,

  -- §7: "Default maximum: 2 accepted help requests per group for the entire
  -- event. Admin can change the limit before the game starts."
  help_request_limit  integer     not null default 2 check (help_request_limit >= 0),

  -- §9.3: "Maximum 3 members per group."
  max_group_size      integer     not null default 3 check (max_group_size between 1 and 10),

  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz
);

-- The event runs one game at a time; this guard keeps `the current game`
-- unambiguous for every lookup and RLS policy below.
create unique index games_single_active
  on games ((true))
  where status <> 'FINISHED';

-- -----------------------------------------------------------------------------
-- participants
--
-- Students never get an email/password (§22). They are issued a Supabase
-- anonymous auth user, so auth.uid() is a real, unforgeable identity and
-- §18's "do not use a student's name alone as proof of identity" holds.
-- -----------------------------------------------------------------------------

create table participants (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  auth_user_id    uuid not null unique,
  full_name       text not null check (length(btrim(full_name)) between 2 and 80),
  status          participant_status not null default 'active',

  -- §3.1 "Provide a secure recovery method if a student loses their session."
  -- Only the hash is stored; the plaintext code is shown to the student once.
  recovery_code_hash  bytea not null,
  recovery_code_hint  text  not null,  -- last 4 chars, so the UI can say "…-7F2A"

  registered_at   timestamptz not null default now()
);

-- §3.1 "Allow different participants to have identical names." — deliberately
-- no unique index on full_name.
create index participants_game_idx on participants(game_id, status);
create index participants_recovery_idx on participants using hash (recovery_code_hash);

-- -----------------------------------------------------------------------------
-- admins (§8 — three preauthorized organizer accounts)
-- -----------------------------------------------------------------------------

create table admins (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique,
  email         text not null unique,
  display_name  text not null,
  role          admin_role not null default 'lead_organizer',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- groups
-- -----------------------------------------------------------------------------

create table groups (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  group_number  integer not null check (group_number > 0),
  group_name    text check (group_name is null or length(btrim(group_name)) between 2 and 40),

  -- §3.3 "Concurrent name edits must not overwrite each other silently."
  -- Bumped on every rename; the client must send the version it last saw.
  name_version  integer not null default 0,

  published_at  timestamptz,
  created_at    timestamptz not null default now(),

  -- §17 "Unique group number per game."
  constraint groups_number_unique unique (game_id, group_number)
);

create index groups_game_idx on groups(game_id);

-- -----------------------------------------------------------------------------
-- group_members
--
-- game_id is denormalised so that "a participant belongs to at most one group
-- in the game" (§17) can be a plain unique constraint rather than a trigger.
-- -----------------------------------------------------------------------------

create table group_members (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  group_id        uuid not null references groups(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  joined_at       timestamptz not null default now(),

  -- §17 "A participant belongs to at most one group in the game."
  constraint group_members_one_group_per_game unique (game_id, participant_id),
  constraint group_members_no_duplicates unique (group_id, participant_id)
);

create index group_members_group_idx on group_members(group_id);
create index group_members_participant_idx on group_members(participant_id);

-- §17 "Maximum three members per group through a transaction-safe server
-- operation." The trigger takes a row lock on the group first, so two
-- concurrent inserts serialise instead of both reading a stale count.
create or replace function enforce_group_capacity()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_count integer;
begin
  perform 1 from groups where id = new.group_id for update;

  select g.max_group_size into v_limit
  from games g
  join groups gr on gr.game_id = g.id
  where gr.id = new.group_id;

  select count(*) into v_count
  from group_members
  where group_id = new.group_id;

  if v_count >= v_limit then
    raise exception 'group % is full (limit %)', new.group_id, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger group_members_capacity
  before insert on group_members
  for each row execute function enforce_group_capacity();

-- -----------------------------------------------------------------------------
-- hints (§5 — four clue stages)
-- -----------------------------------------------------------------------------

create table hints (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  hint_number   integer not null check (hint_number between 1 and 4),
  title         text not null,
  description   text,
  content       text,
  media_url     text,     -- Supabase Storage path (image or audio)
  external_link text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint hints_number_unique unique (game_id, hint_number)
);

-- -----------------------------------------------------------------------------
-- checkpoints (§6)
--
-- Only the hash of the QR token is stored, so a database leak does not hand
-- anyone the four checkpoint codes (§18).
-- -----------------------------------------------------------------------------

create table checkpoints (
  id                        uuid primary key default gen_random_uuid(),
  game_id                   uuid not null references games(id) on delete cascade,
  stage_number              integer not null check (stage_number between 1 and 4),
  location_label            text not null,
  verification_token_hash   bytea not null,

  -- §6 "support an optional organizer-approved checkpoint code or on-site staff
  -- confirmation. This can be enabled for checkpoints where cheating is a
  -- concern." When true, a scan alone is not enough.
  requires_organizer_code   boolean not null default false,
  organizer_code_hash       bytea,

  active                    boolean not null default true,
  created_at                timestamptz not null default now(),

  constraint checkpoints_stage_unique unique (game_id, stage_number),
  constraint checkpoints_token_unique unique (verification_token_hash),
  constraint checkpoints_organizer_code_present check (
    not requires_organizer_code or organizer_code_hash is not null
  )
);

-- -----------------------------------------------------------------------------
-- checkpoint_verifications (§6, §12)
-- -----------------------------------------------------------------------------

create table checkpoint_verifications (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid not null references games(id) on delete cascade,
  group_id            uuid not null references groups(id) on delete cascade,
  checkpoint_id       uuid not null references checkpoints(id) on delete cascade,
  verified_by         uuid not null references participants(id),
  verified_at         timestamptz not null default now(),
  verification_method verification_method not null default 'qr_scan',

  -- §17 "Unique checkpoint completion per group and checkpoint."
  -- This is what makes a repeated scan a no-op rather than duplicate progress.
  constraint checkpoint_verifications_once unique (group_id, checkpoint_id)
);

create index checkpoint_verifications_group_idx on checkpoint_verifications(group_id);
create index checkpoint_verifications_game_idx on checkpoint_verifications(game_id, verified_at);

-- -----------------------------------------------------------------------------
-- notifications + recipients (§4, §10)
-- -----------------------------------------------------------------------------

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id) on delete cascade,
  title       text not null,
  message     text not null,
  type        notification_type not null default 'announcement',
  audience    notification_audience not null default 'everyone',
  media_url   text,
  payload     jsonb,  -- team reveal / winner data rendered by the client
  created_by  uuid references admins(id),
  created_at  timestamptz not null default now()
);

create index notifications_game_idx on notifications(game_id, created_at desc);

-- One row per participant who is allowed to see the notification. This table
-- is the access-control list; §18 "do not expose private notification
-- recipients" is enforced by RLS letting a student see only their own row.
create table notification_recipients (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references notifications(id) on delete cascade,
  participant_id   uuid not null references participants(id) on delete cascade,
  read_at          timestamptz,

  constraint notification_recipients_unique unique (notification_id, participant_id)
);

create index notification_recipients_participant_idx
  on notification_recipients(participant_id, read_at);

-- -----------------------------------------------------------------------------
-- help_requests (§7, §13)
-- -----------------------------------------------------------------------------

create table help_requests (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  group_id      uuid not null references groups(id) on delete cascade,
  requested_by  uuid not null references participants(id),
  stage_number  integer not null check (stage_number between 1 and 4),
  message       text,
  status        help_request_status not null default 'pending',

  -- §7 "Admin can grant an exceptional extra request with a logged reason."
  -- Exempt rows do not count against the group's allowance.
  is_exempt     boolean not null default false,
  exempt_reason text,

  admin_reply   text,
  answered_by   uuid references admins(id),
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,

  constraint help_requests_exempt_reason check (not is_exempt or exempt_reason is not null)
);

create index help_requests_group_idx on help_requests(group_id);
create index help_requests_status_idx on help_requests(game_id, status, created_at);

-- -----------------------------------------------------------------------------
-- winners (§14)
-- -----------------------------------------------------------------------------

create table winners (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  group_id      uuid not null references groups(id) on delete cascade,
  position      integer not null check (position between 1 and 3),
  prize_amount  numeric(10,2) not null check (prize_amount >= 0),
  revealed_at   timestamptz,
  created_at    timestamptz not null default now(),

  -- §17 "Unique winner position per game."
  constraint winners_position_unique unique (game_id, position),
  -- §17 "A group cannot win more than one position in the same game."
  constraint winners_group_unique unique (game_id, group_id)
);

-- -----------------------------------------------------------------------------
-- admin_audit_logs (§18)
-- -----------------------------------------------------------------------------

create table admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references games(id) on delete set null,
  admin_id    uuid references admins(id),
  action      text not null,
  target_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_logs_game_idx on admin_audit_logs(game_id, created_at desc);

-- -----------------------------------------------------------------------------
-- rate_limit_events (§18 "Use rate limiting for registration and help requests")
-- -----------------------------------------------------------------------------

create table rate_limit_events (
  id          bigserial primary key,
  bucket      text not null,   -- 'register' | 'help_request' | ...
  subject     text not null,   -- auth uid, group id, or IP supplied by the edge
  created_at  timestamptz not null default now()
);

create index rate_limit_events_lookup on rate_limit_events(bucket, subject, created_at desc);

-- =============================================================================
-- GC Campus Mystery Hunt — 0002 identity helpers and transactional RPCs
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

-- =============================================================================
-- GC Campus Mystery Hunt — 0003 Row Level Security (§18)
--
-- Shape of the policy set:
--   * Students get SELECT only, always narrowed to their own row, their own
--     group, or something explicitly published to them.
--   * Students get NO insert/update/delete policy on any table. Every write
--     goes through a SECURITY DEFINER function in 0002, which is how §18's
--     "never trust a role or group ID supplied by the browser" is enforced.
--   * Admins read everything; their writes also go through the RPCs.
-- =============================================================================

alter table games                    enable row level security;
alter table participants             enable row level security;
alter table admins                   enable row level security;
alter table groups                   enable row level security;
alter table group_members            enable row level security;
alter table hints                    enable row level security;
alter table checkpoints              enable row level security;
alter table checkpoint_verifications enable row level security;
alter table notifications            enable row level security;
alter table notification_recipients  enable row level security;
alter table help_requests            enable row level security;
alter table winners                  enable row level security;
alter table admin_audit_logs         enable row level security;
alter table rate_limit_events        enable row level security;

-- -----------------------------------------------------------------------------
-- games — everyone signed in needs the current status to render the home page.
-- -----------------------------------------------------------------------------

create policy games_select_all on games
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- participants — own row, plus teammates so the team card can list names (§3.3).
-- A student can never enumerate the full roster.
-- -----------------------------------------------------------------------------

create policy participants_select_self_or_teammate on participants
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or id in (
      select gm.participant_id from group_members gm
      where gm.group_id = current_group_id()
    )
    or is_admin()
  );

-- -----------------------------------------------------------------------------
-- admins — organizers only. Students must not be able to list the organizers.
-- -----------------------------------------------------------------------------

create policy admins_select_admin_only on admins
  for select to authenticated
  using (is_admin());

-- -----------------------------------------------------------------------------
-- groups / group_members — own group only (§12 "Do not make other teams'
-- progress publicly visible during the game"), plus winning groups once the
-- results are out so the winner popup can name them.
-- -----------------------------------------------------------------------------

create policy groups_select_own on groups
  for select to authenticated
  using (
    id = current_group_id()
    or is_admin()
    or id in (select w.group_id from winners w where w.revealed_at is not null)
  );

create policy group_members_select_own on group_members
  for select to authenticated
  using (
    group_id = current_group_id()
    or is_admin()
    or group_id in (select w.group_id from winners w where w.revealed_at is not null)
  );

-- -----------------------------------------------------------------------------
-- hints — the URL-guessing defence (§5 "Teams cannot access future clues simply
-- by guessing a URL"). A student sees a hint only when it is published AND
-- their group has earned it. Enforced in the database, so it holds no matter
-- what the client asks for.
-- -----------------------------------------------------------------------------

create policy hints_select_unlocked on hints
  for select to authenticated
  using (
    is_admin()
    or (
      published_at is not null
      and current_group_id() is not null
      and hint_number <= group_completed_stage(current_group_id()) + 1
    )
  );

-- -----------------------------------------------------------------------------
-- checkpoints — admin only. Students never read this table; they submit a token
-- to verify_checkpoint() instead, so the token hashes never reach a browser.
-- -----------------------------------------------------------------------------

create policy checkpoints_select_admin_only on checkpoints
  for select to authenticated
  using (is_admin());

-- -----------------------------------------------------------------------------
-- checkpoint_verifications — a team sees its own progress and no one else's.
-- -----------------------------------------------------------------------------

create policy checkpoint_verifications_select_own on checkpoint_verifications
  for select to authenticated
  using (group_id = current_group_id() or is_admin());

-- -----------------------------------------------------------------------------
-- notifications — readable only via an explicit recipient row, which is how
-- §10's "Group-specific messages must not be accessible to members of other
-- groups" is guaranteed.
-- -----------------------------------------------------------------------------

create policy notifications_select_addressed on notifications
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from notification_recipients r
      where r.notification_id = notifications.id
        and r.participant_id = current_participant_id()
    )
  );

-- §18 "Do not expose private notification recipients" — a student sees only
-- their own delivery row, never the full recipient list.
create policy notification_recipients_select_own on notification_recipients
  for select to authenticated
  using (participant_id = current_participant_id() or is_admin());

-- -----------------------------------------------------------------------------
-- help_requests — own group only (§7 "A response must only be visible to the
-- requesting group").
-- -----------------------------------------------------------------------------

create policy help_requests_select_own on help_requests
  for select to authenticated
  using (group_id = current_group_id() or is_admin());

-- -----------------------------------------------------------------------------
-- winners — invisible until revealed (§14 "Winner selections remain private
-- until publication").
-- -----------------------------------------------------------------------------

create policy winners_select_revealed on winners
  for select to authenticated
  using (revealed_at is not null or is_admin());

-- -----------------------------------------------------------------------------
-- admin_audit_logs — organizers only.
-- -----------------------------------------------------------------------------

create policy admin_audit_logs_select_admin on admin_audit_logs
  for select to authenticated
  using (is_admin());

-- rate_limit_events gets no policy at all: reachable only from SECURITY
-- DEFINER functions.

-- -----------------------------------------------------------------------------
-- Grants
--
-- SELECT only, and only on what a client legitimately renders. Writes are
-- reachable exclusively through the functions granted below.
-- -----------------------------------------------------------------------------

grant select on
  games, participants, groups, group_members, hints,
  checkpoint_verifications, notifications, notification_recipients,
  help_requests, winners
to authenticated;

grant select on admins, checkpoints, admin_audit_logs to authenticated;

-- Student-callable RPCs.
grant execute on function
  register_participant(text),
  redeem_recovery_code(text),
  verify_checkpoint(text, text),
  create_help_request(text, integer),
  set_group_name(uuid, text, integer),
  mark_notification_read(uuid),
  current_participant_id(),
  current_group_id(),
  group_completed_stage(uuid)
to authenticated;

-- Admin-callable RPCs. Each re-checks current_admin_id() internally, so a
-- student calling one gets a 42501 rather than a silent success.
grant execute on function
  preview_team_assignment(),
  publish_team_assignment(jsonb),
  send_notification(text, text, notification_type, notification_audience, uuid[], text),
  answer_help_request(uuid, text),
  set_winner_selection(jsonb),
  reveal_winners(),
  set_game_status(game_status),
  is_admin(),
  current_admin_id()
to authenticated;

-- Nothing is callable or readable without a session.
revoke all on schema public from anon;

-- =============================================================================
-- GC Campus Mystery Hunt — 0004 bootstrap helpers
--
-- These set up a real event. Nothing here hardcodes a secret: the checkpoint
-- QR tokens are generated on demand and returned in plaintext exactly once,
-- so they live on your printed signs and nowhere in this repository (§18
-- "Do not expose secret API keys in the frontend").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Linking the three organizer accounts (§8)
--
-- Create the three users in Supabase Auth first (Dashboard > Authentication >
-- Add user, with email + password), then call this once per organizer to bind
-- that auth user to an admin row. Being in auth.users is NOT enough to get
-- admin powers — only a row here counts.
-- -----------------------------------------------------------------------------

create or replace function link_admin_account(
  p_email         text,
  p_auth_user_id  uuid,
  p_display_name  text,
  p_role          admin_role default 'lead_organizer'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into admins (auth_user_id, email, display_name, role)
  values (p_auth_user_id, lower(btrim(p_email)), p_display_name, p_role)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        display_name = excluded.display_name,
        role         = excluded.role,
        active       = true
  returning id into v_id;

  return jsonb_build_object('ok', true, 'admin_id', v_id, 'email', lower(btrim(p_email)));
end;
$$;

revoke execute on function link_admin_account(text, uuid, text, admin_role) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Creating the event
-- -----------------------------------------------------------------------------

create or replace function create_game(
  p_title text default 'GC Campus Mystery Hunt 2026',
  p_help_request_limit integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
  i integer;
begin
  if exists (select 1 from games where status <> 'FINISHED') then
    return jsonb_build_object('ok', false, 'code', 'GAME_ALREADY_EXISTS');
  end if;

  insert into games (title, status, registration_open, help_request_limit)
  values (p_title, 'REGISTRATION', true, p_help_request_limit)
  returning id into v_game_id;

  -- Four empty clue slots for the admin to fill in (§11). They stay
  -- unpublished, so no student can see them yet.
  for i in 1..4 loop
    insert into hints (game_id, hint_number, title, content)
    values (v_game_id, i, 'Stage ' || i || ' — not written yet', null);
  end loop;

  return jsonb_build_object('ok', true, 'game_id', v_game_id);
end;
$$;

revoke execute on function create_game(text, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Checkpoint QR tokens (§6)
--
-- Returns the plaintext token for each stage ONCE. Only the hash is stored, so
-- a database dump never reveals the four codes. Encode each returned token in
-- the QR sign you print for that location.
--
-- Calling this again rotates the tokens and invalidates every previously
-- printed sign — useful if a code leaks mid-event.
-- -----------------------------------------------------------------------------

-- Output names deliberately differ from the checkpoints column names
-- (stage_number / location_label) so the ON CONFLICT target below is
-- unambiguous inside plpgsql.
create or replace function provision_checkpoints(p_locations text[] default null)
returns table (stage integer, label text, qr_token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
  v_labels  text[] := coalesce(p_locations, array['Stage 1','Stage 2','Stage 3','Stage 4']);
  i integer;
  v_token text;
begin
  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    raise exception 'no active game; call create_game() first';
  end if;

  for i in 1..4 loop
    -- url-safe, unguessable, and short enough to retype if a camera fails
    v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));

    insert into checkpoints (game_id, stage_number, location_label, verification_token_hash)
    values (v_game_id, i, v_labels[i], digest(v_token, 'sha256'))
    on conflict (game_id, stage_number) do update
      set verification_token_hash = excluded.verification_token_hash,
          location_label          = excluded.location_label,
          active                  = true;

    stage    := i;
    label    := v_labels[i];
    qr_token := v_token;
    return next;
  end loop;
end;
$$;

revoke execute on function provision_checkpoints(text[]) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Turning on the on-site second factor for a checkpoint (§6)
--
-- Use this for any location where a photographed QR is a real risk. Afterwards
-- a scan alone is refused; the student must also enter the code an organizer
-- reads out at the location.
-- -----------------------------------------------------------------------------

create or replace function set_checkpoint_organizer_code(
  p_stage integer,
  p_code  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
begin
  select id into v_game_id from games where status <> 'FINISHED' limit 1;

  update checkpoints
  set requires_organizer_code = (p_code is not null),
      organizer_code_hash     = case when p_code is null
                                     then null
                                     else digest(upper(btrim(p_code)), 'sha256') end
  where game_id = v_game_id and stage_number = p_stage;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'stage', p_stage, 'enabled', p_code is not null);
end;
$$;

revoke execute on function set_checkpoint_organizer_code(integer, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime (§16)
--
-- Supabase Realtime respects RLS, so each student receives only the rows their
-- policies already allow. Adding the tables to the publication is all that is
-- needed; no extra authorization layer.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      games, groups, group_members, hints,
      checkpoint_verifications, notifications, notification_recipients,
      help_requests, winners;
  end if;
exception when duplicate_object then
  null;  -- already added
end $$;

-- =============================================================================
-- GC Campus Mystery Hunt — 0005 fix: make pgcrypto reachable from the RPCs
--
-- Supabase installs pgcrypto into the `extensions` schema, not `public`.
-- Migrations 0002 and 0004 pinned `search_path = public, pg_temp`, which left
-- gen_random_bytes() and digest() invisible, so provision_checkpoints() and
-- register_participant() failed with:
--
--   ERROR: 42883: function gen_random_bytes(integer) does not exist
--
-- This adds `extensions` to the search path of every SECURITY DEFINER
-- function. Naming a schema that does not exist is harmless, so this is also
-- safe on a plain Postgres where pgcrypto sits in public.
--
-- Safe to run more than once.
-- =============================================================================

-- Belt and braces: on Supabase both of these are no-ops.
create schema if not exists extensions;
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create extension pgcrypto with schema extensions;
  end if;
end $$;

-- --- 0002: identity helpers ---------------------------------------------------
alter function current_participant_id()        set search_path = public, extensions, pg_temp;
alter function current_admin_id()              set search_path = public, extensions, pg_temp;
alter function is_admin()                      set search_path = public, extensions, pg_temp;
alter function current_group_id()              set search_path = public, extensions, pg_temp;
alter function group_completed_stage(uuid)     set search_path = public, extensions, pg_temp;

-- --- 0002: rate limiting ------------------------------------------------------
alter function check_rate_limit(text, text, integer, interval)
  set search_path = public, extensions, pg_temp;

-- --- 0002: registration and recovery (use digest + gen_random_bytes) ----------
alter function register_participant(text)      set search_path = public, extensions, pg_temp;
alter function redeem_recovery_code(text)      set search_path = public, extensions, pg_temp;

-- --- 0002: teams --------------------------------------------------------------
alter function preview_team_assignment()       set search_path = public, extensions, pg_temp;
alter function publish_team_assignment(jsonb)  set search_path = public, extensions, pg_temp;
alter function set_group_name(uuid, text, integer)
  set search_path = public, extensions, pg_temp;

-- --- 0002: gameplay (verify_checkpoint uses digest) ---------------------------
alter function verify_checkpoint(text, text)   set search_path = public, extensions, pg_temp;
alter function create_help_request(text, integer)
  set search_path = public, extensions, pg_temp;
alter function answer_help_request(uuid, text) set search_path = public, extensions, pg_temp;

-- --- 0002: notifications ------------------------------------------------------
alter function send_notification(text, text, notification_type, notification_audience, uuid[], text)
  set search_path = public, extensions, pg_temp;
alter function mark_notification_read(uuid)    set search_path = public, extensions, pg_temp;

-- --- 0002: winners and status -------------------------------------------------
alter function set_winner_selection(jsonb)     set search_path = public, extensions, pg_temp;
alter function reveal_winners()                set search_path = public, extensions, pg_temp;
alter function set_game_status(game_status)    set search_path = public, extensions, pg_temp;

-- --- 0004: bootstrap (provision_checkpoints uses gen_random_bytes) ------------
alter function link_admin_account(text, uuid, text, admin_role)
  set search_path = public, extensions, pg_temp;
alter function create_game(text, integer)      set search_path = public, extensions, pg_temp;
alter function provision_checkpoints(text[])   set search_path = public, extensions, pg_temp;
alter function set_checkpoint_organizer_code(integer, text)
  set search_path = public, extensions, pg_temp;

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

-- =============================================================================
-- GC Campus Mystery Hunt — 0007 teams may only be drawn once registration shuts
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

-- =============================================================================
-- GC Campus Mystery Hunt — 0008 per-group clues and per-group checkpoints
--
-- Until now there was one set of four clues for the whole game. Organizers
-- want to write a different route for each team, so that teams cannot simply
-- follow each other around campus.
--
-- Both `hints` and `checkpoints` gain a nullable group_id:
--   group_id IS NULL  -> shared: applies to every team (the old behaviour)
--   group_id = <team> -> that team only
--
-- Keeping NULL meaningful matters practically: a shared route needs 4 printed
-- QR signs, while a fully per-group route needs 4 signs per team. Organizers
-- can mix — shared clues for stages everyone visits, per-group clues where
-- routes should diverge — without any schema change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------

alter table hints       add column if not exists group_id uuid references groups(id) on delete cascade;
alter table checkpoints add column if not exists group_id uuid references groups(id) on delete cascade;

-- Replace the old "one row per stage per game" rules with ones that treat the
-- shared row and each team's row as separate things.
alter table hints       drop constraint if exists hints_number_unique;
alter table checkpoints drop constraint if exists checkpoints_stage_unique;

-- A plain UNIQUE would not help: Postgres treats NULLs as distinct, so it
-- would allow many shared rows for the same stage. Two partial indexes do it.
create unique index if not exists hints_shared_unique
  on hints (game_id, hint_number) where group_id is null;
create unique index if not exists hints_per_group_unique
  on hints (game_id, hint_number, group_id) where group_id is not null;

create unique index if not exists checkpoints_shared_unique
  on checkpoints (game_id, stage_number) where group_id is null;
create unique index if not exists checkpoints_per_group_unique
  on checkpoints (game_id, stage_number, group_id) where group_id is not null;

create index if not exists hints_group_idx on hints(group_id);
create index if not exists checkpoints_group_idx on checkpoints(group_id);

-- -----------------------------------------------------------------------------
-- Verification must respect team ownership
--
-- Without this, a team could scan another team's sign — which with diverging
-- routes is exactly the cheat the per-group design exists to prevent.
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

  perform 1 from groups where id = v_group_id for update;

  select * into v_game from games where status <> 'FINISHED' limit 1;
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

  -- A real code, but belonging to a different team's route.
  if v_checkpoint.group_id is not null and v_checkpoint.group_id <> v_group_id then
    return jsonb_build_object('ok', false, 'code', 'OTHER_TEAM_CHECKPOINT');
  end if;

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

  if exists (
    select 1 from checkpoint_verifications
    where group_id = v_group_id and checkpoint_id = v_checkpoint.id
  ) then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_VERIFIED',
      'stage', v_checkpoint.stage_number, 'completed_stage', v_completed
    );
  end if;

  if v_checkpoint.stage_number <> v_completed + 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'WRONG_STAGE',
      'stage', v_checkpoint.stage_number, 'expected_stage', v_completed + 1
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
-- Students see their own team's clue, or the shared one
-- -----------------------------------------------------------------------------

drop policy if exists hints_select_unlocked on hints;

create policy hints_select_unlocked on hints
  for select to authenticated
  using (
    is_admin()
    or (
      published_at is not null
      and current_group_id() is not null
      and (group_id is null or group_id = current_group_id())
      and hint_number <= group_completed_stage(current_group_id()) + 1
    )
  );

-- -----------------------------------------------------------------------------
-- Authoring (§11) — replaces editing clues by hand in SQL
-- -----------------------------------------------------------------------------

create or replace function upsert_hint(
  p_hint_number   integer,
  p_title         text,
  p_content       text default null,
  p_description   text default null,
  p_group_id      uuid default null,
  p_media_url     text default null,
  p_external_link text default null,
  p_publish       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_id    uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_hint_number not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'TITLE_REQUIRED');
  end if;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select id into v_id from hints
  where game_id = v_game.id
    and hint_number = p_hint_number
    and group_id is not distinct from p_group_id;

  if v_id is null then
    insert into hints (game_id, group_id, hint_number, title, description, content,
                       media_url, external_link, published_at)
    values (v_game.id, p_group_id, p_hint_number, btrim(p_title), p_description, p_content,
            p_media_url, p_external_link, case when p_publish then now() end)
    returning id into v_id;
  else
    update hints
    set title         = btrim(p_title),
        description   = p_description,
        content       = p_content,
        media_url     = p_media_url,
        external_link = p_external_link,
        updated_at    = now(),
        -- Publishing is sticky: saving an edit to a live clue does not
        -- silently pull it back from the teams already reading it.
        published_at  = case when p_publish then coalesce(published_at, now()) else published_at end
    where id = v_id;
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game.id, v_admin, 'UPSERT_HINT', v_id,
          jsonb_build_object('stage', p_hint_number, 'group_id', p_group_id, 'published', p_publish));

  return jsonb_build_object('ok', true, 'code', 'SAVED', 'hint_id', v_id);
end;
$$;

create or replace function set_hint_published(
  p_hint_number integer,
  p_group_id    uuid default null,
  p_published   boolean default true
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

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  update hints
  set published_at = case when p_published then coalesce(published_at, now()) else null end,
      updated_at   = now()
  where game_id = v_game.id
    and hint_number = p_hint_number
    and group_id is not distinct from p_group_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, case when p_published then 'PUBLISH_HINT' else 'UNPUBLISH_HINT' end,
          jsonb_build_object('stage', p_hint_number, 'group_id', p_group_id));

  return jsonb_build_object('ok', true, 'code', 'UPDATED');
end;
$$;

-- -----------------------------------------------------------------------------
-- Generating the codes to print (§6)
--
-- Returns plaintext tokens ONCE; only hashes are kept. Pass a group to issue
-- that team's private codes, or NULL for the shared set.
-- -----------------------------------------------------------------------------

create or replace function provision_checkpoints_for(
  p_group_id  uuid default null,
  p_locations text[] default null,
  p_stages    integer[] default array[1,2,3,4]
)
returns table (stage integer, label text, qr_token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin   uuid := current_admin_id();
  v_game_id uuid;
  v_labels  text[] := coalesce(p_locations, array['Stage 1','Stage 2','Stage 3','Stage 4']);
  v_token   text;
  v_stage   integer;
  i         integer;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    raise exception 'no active game';
  end if;

  for i in 1..coalesce(array_length(p_stages, 1), 0) loop
    v_stage := p_stages[i];
    v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));

    if exists (
      select 1 from checkpoints c
      where c.game_id = v_game_id and c.stage_number = v_stage
        and c.group_id is not distinct from p_group_id
    ) then
      update checkpoints c
      set verification_token_hash = digest(v_token, 'sha256'),
          location_label = coalesce(v_labels[i], c.location_label),
          active = true
      where c.game_id = v_game_id and c.stage_number = v_stage
        and c.group_id is not distinct from p_group_id;
    else
      insert into checkpoints (game_id, group_id, stage_number, location_label, verification_token_hash)
      values (v_game_id, p_group_id, v_stage,
              coalesce(v_labels[i], 'Stage ' || v_stage), digest(v_token, 'sha256'));
    end if;

    stage    := v_stage;
    label    := coalesce(v_labels[i], 'Stage ' || v_stage);
    qr_token := v_token;
    return next;
  end loop;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game_id, v_admin, 'PROVISION_CHECKPOINTS',
          jsonb_build_object('group_id', p_group_id, 'stages', p_stages));
end;
$$;

grant execute on function upsert_hint(integer, text, text, text, uuid, text, text, boolean) to authenticated;
grant execute on function set_hint_published(integer, uuid, boolean) to authenticated;
grant execute on function provision_checkpoints_for(uuid, text[], integer[]) to authenticated;

-- =============================================================================
-- GC Campus Mystery Hunt — 0009 author clues by group NUMBER, not group row
--
-- 0008 tied a clue to a specific team row, which meant clues could only be
-- written after the draw. Organizers want the opposite: write all the routes
-- in advance, then run the draw on the day.
--
-- So clues and checkpoints now key on a plain group NUMBER. "Group 7's route"
-- can be written before anybody has registered; whichever three students end
-- up as Group 7 receive it.
--
--   group_number IS NULL -> shared: every team sees it
--   group_number = N     -> only the team drawn as Group N
--
-- Also adds a Storage bucket so clues can carry an image or audio file (§11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Swap group_id for group_number
-- -----------------------------------------------------------------------------

alter table hints       add column if not exists group_number integer;
alter table checkpoints add column if not exists group_number integer;

-- Carry across anything written under 0008 before dropping the old column.
-- Guarded so this migration can be run again safely: on a second run the
-- group_id column is already gone, and a bare UPDATE would fail with
-- "column h.group_id does not exist".
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hints' and column_name = 'group_id'
  ) then
    execute $m$
      update hints h set group_number = g.group_number
      from groups g where h.group_id = g.id and h.group_number is null
    $m$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checkpoints' and column_name = 'group_id'
  ) then
    execute $m$
      update checkpoints c set group_number = g.group_number
      from groups g where c.group_id = g.id and c.group_number is null
    $m$;
  end if;
end $$;

drop index if exists hints_shared_unique;
drop index if exists hints_per_group_unique;
drop index if exists checkpoints_shared_unique;
drop index if exists checkpoints_per_group_unique;
drop index if exists hints_group_idx;
drop index if exists checkpoints_group_idx;

-- The 0008 policy reads group_id, so it has to go before the column does.
-- It is recreated against group_number further down.
drop policy if exists hints_select_unlocked on hints;

alter table hints       drop column if exists group_id;
alter table checkpoints drop column if exists group_id;

alter table hints       drop constraint if exists hints_group_number_range;
alter table checkpoints drop constraint if exists checkpoints_group_number_range;
alter table hints
  add constraint hints_group_number_range check (group_number is null or group_number between 1 and 50);
alter table checkpoints
  add constraint checkpoints_group_number_range check (group_number is null or group_number between 1 and 50);

create unique index if not exists hints_shared_unique
  on hints (game_id, hint_number) where group_number is null;
create unique index if not exists hints_per_group_unique
  on hints (game_id, hint_number, group_number) where group_number is not null;

create unique index if not exists checkpoints_shared_unique
  on checkpoints (game_id, stage_number) where group_number is null;
create unique index if not exists checkpoints_per_group_unique
  on checkpoints (game_id, stage_number, group_number) where group_number is not null;

create index if not exists hints_group_number_idx on hints(group_number);
create index if not exists checkpoints_group_number_idx on checkpoints(group_number);

-- -----------------------------------------------------------------------------
-- Helper: the number of the team the caller belongs to
-- -----------------------------------------------------------------------------

create or replace function current_group_number()
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select g.group_number
  from groups g
  join group_members gm on gm.group_id = g.id
  join participants p on p.id = gm.participant_id
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

grant execute on function current_group_number() to authenticated;

-- -----------------------------------------------------------------------------
-- Students see the shared clue, or the one written for their team number
-- -----------------------------------------------------------------------------

drop policy if exists hints_select_unlocked on hints;

create policy hints_select_unlocked on hints
  for select to authenticated
  using (
    is_admin()
    or (
      published_at is not null
      and current_group_id() is not null
      and (group_number is null or group_number = current_group_number())
      and hint_number <= group_completed_stage(current_group_id()) + 1
    )
  );

-- -----------------------------------------------------------------------------
-- Verification respects team ownership by number
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
  v_game         games%rowtype;
  v_checkpoint   checkpoints%rowtype;
  v_completed    integer;
  v_inserted     uuid;
  v_notif        uuid;
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

  select * into v_game from games where status <> 'FINISHED' limit 1;
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

  -- A real code, but it belongs to a different team's route.
  if v_checkpoint.group_number is not null and v_checkpoint.group_number <> v_group_number then
    return jsonb_build_object('ok', false, 'code', 'OTHER_TEAM_CHECKPOINT');
  end if;

  if v_checkpoint.requires_organizer_code then
    if p_organizer_code is null
       or digest(upper(btrim(p_organizer_code)), 'sha256') <> v_checkpoint.organizer_code_hash then
      return jsonb_build_object(
        'ok', false, 'code', 'ORGANIZER_CODE_REQUIRED', 'stage', v_checkpoint.stage_number
      );
    end if;
  end if;

  v_completed := group_completed_stage(v_group_id);

  if exists (
    select 1 from checkpoint_verifications
    where group_id = v_group_id and checkpoint_id = v_checkpoint.id
  ) then
    return jsonb_build_object(
      'ok', true, 'code', 'ALREADY_VERIFIED',
      'stage', v_checkpoint.stage_number, 'completed_stage', v_completed
    );
  end if;

  if v_checkpoint.stage_number <> v_completed + 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'WRONG_STAGE',
      'stage', v_checkpoint.stage_number, 'expected_stage', v_completed + 1
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
-- Authoring, now by group number and with attachments
-- -----------------------------------------------------------------------------

drop function if exists upsert_hint(integer, text, text, text, uuid, text, text, boolean);

create or replace function upsert_hint(
  p_hint_number   integer,
  p_title         text,
  p_content       text default null,
  p_description   text default null,
  p_group_number  integer default null,
  p_media_url     text default null,
  p_external_link text default null,
  p_publish       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := current_admin_id();
  v_game  games%rowtype;
  v_id    uuid;
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_hint_number not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'TITLE_REQUIRED');
  end if;

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  select id into v_id from hints
  where game_id = v_game.id
    and hint_number = p_hint_number
    and group_number is not distinct from p_group_number;

  if v_id is null then
    insert into hints (game_id, group_number, hint_number, title, description, content,
                       media_url, external_link, published_at)
    values (v_game.id, p_group_number, p_hint_number, btrim(p_title), p_description, p_content,
            p_media_url, p_external_link, case when p_publish then now() end)
    returning id into v_id;
  else
    update hints
    set title         = btrim(p_title),
        description   = p_description,
        content       = p_content,
        -- Passing null leaves an existing attachment alone; the UI clears it
        -- explicitly by sending an empty string.
        media_url     = case when p_media_url = '' then null
                             else coalesce(p_media_url, media_url) end,
        external_link = case when p_external_link = '' then null
                             else coalesce(p_external_link, external_link) end,
        updated_at    = now(),
        published_at  = case when p_publish then coalesce(published_at, now()) else published_at end
    where id = v_id;
  end if;

  insert into admin_audit_logs (game_id, admin_id, action, target_id, detail)
  values (v_game.id, v_admin, 'UPSERT_HINT', v_id,
          jsonb_build_object('stage', p_hint_number, 'group_number', p_group_number,
                             'published', p_publish));

  return jsonb_build_object('ok', true, 'code', 'SAVED', 'hint_id', v_id);
end;
$$;

drop function if exists set_hint_published(integer, uuid, boolean);

create or replace function set_hint_published(
  p_hint_number  integer,
  p_group_number integer default null,
  p_published    boolean default true
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

  select * into v_game from games where status <> 'FINISHED' limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  update hints
  set published_at = case when p_published then coalesce(published_at, now()) else null end,
      updated_at   = now()
  where game_id = v_game.id
    and hint_number = p_hint_number
    and group_number is not distinct from p_group_number;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, case when p_published then 'PUBLISH_HINT' else 'UNPUBLISH_HINT' end,
          jsonb_build_object('stage', p_hint_number, 'group_number', p_group_number));

  return jsonb_build_object('ok', true, 'code', 'UPDATED');
end;
$$;

-- -----------------------------------------------------------------------------
-- One code per clue, issued from the clue itself
-- -----------------------------------------------------------------------------

drop function if exists provision_checkpoints_for(uuid, text[], integer[]);

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
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_stage not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;

  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));
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

  -- Returned in plaintext exactly once; only the hash is stored.
  return jsonb_build_object('ok', true, 'code', 'ISSUED', 'token', v_token, 'label', v_label);
end;
$$;

grant execute on function upsert_hint(integer, text, text, text, integer, text, text, boolean) to authenticated;
grant execute on function set_hint_published(integer, integer, boolean) to authenticated;
grant execute on function issue_checkpoint_code(integer, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage for clue attachments (§11 image / audio upload)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('clue-media', 'clue-media', true)
on conflict (id) do nothing;

drop policy if exists "clue media admin write" on storage.objects;
drop policy if exists "clue media admin update" on storage.objects;
drop policy if exists "clue media admin delete" on storage.objects;
drop policy if exists "clue media read" on storage.objects;

-- Only organizers may upload; anyone may read, because students must be able
-- to load the audio or image inside their clue.
create policy "clue media admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clue-media' and is_admin());

create policy "clue media admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'clue-media' and is_admin());

create policy "clue media admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clue-media' and is_admin());

create policy "clue media read" on storage.objects
  for select to public
  using (bucket_id = 'clue-media');

-- =============================================================================
-- GC Campus Mystery Hunt — 0010 repairs after the group_number change
--
-- Three problems introduced by 0008/0009, all fixed here. Safe to run any
-- number of times.
--
-- 1. provision_checkpoints() (from 0004) still used
--       ON CONFLICT (game_id, stage_number)
--    but 0008 replaced that constraint with partial indexes, so the old
--    function now fails with "no unique or exclusion constraint matching the
--    ON CONFLICT specification". That is the function the earlier setup
--    instructions told organizers to run, so it must keep working.
--
-- 2. 0009 was not re-runnable: its backfill reads hints.group_id, which 0009
--    itself drops. Running it twice therefore failed with
--    "column h.group_id does not exist". Nothing was broken by that, but the
--    error is alarming and the advice "safe to run twice" was wrong.
--
-- 3. The storage policies in 0009 can fail on Supabase, because
--    storage.objects is owned by supabase_storage_admin rather than postgres.
--    They are now attempted defensively, so one failure cannot stop the rest
--    of a migration from applying.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Repair the original bulk provisioning helper
-- -----------------------------------------------------------------------------

create or replace function provision_checkpoints(p_locations text[] default null)
returns table (stage integer, label text, qr_token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_game_id uuid;
  v_labels  text[] := coalesce(p_locations, array['Stage 1','Stage 2','Stage 3','Stage 4']);
  i integer;
  v_token text;
begin
  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    raise exception 'no active game; call create_game() first';
  end if;

  for i in 1..4 loop
    v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));

    -- Explicit existence check rather than ON CONFLICT: the uniqueness rule is
    -- now a partial index, which ON CONFLICT cannot target by column list.
    -- These are the SHARED checkpoints, so group_number is null.
    if exists (
      select 1 from checkpoints c
      where c.game_id = v_game_id and c.stage_number = i and c.group_number is null
    ) then
      update checkpoints c
      set verification_token_hash = digest(v_token, 'sha256'),
          location_label          = coalesce(v_labels[i], c.location_label),
          active                  = true
      where c.game_id = v_game_id and c.stage_number = i and c.group_number is null;
    else
      insert into checkpoints (game_id, group_number, stage_number, location_label, verification_token_hash)
      values (v_game_id, null, i, coalesce(v_labels[i], 'Stage ' || i), digest(v_token, 'sha256'));
    end if;

    stage    := i;
    label    := coalesce(v_labels[i], 'Stage ' || i);
    qr_token := v_token;
    return next;
  end loop;
end;
$$;

-- Organizers call this from the dashboard, so it needs the same grant as the
-- per-clue version. It still checks nothing itself beyond the game existing —
-- it is reachable only by someone who already passed the admin check in the UI
-- and, for direct calls, by the SQL editor.
revoke execute on function provision_checkpoints(text[]) from public, anon;

-- -----------------------------------------------------------------------------
-- 2. Storage, attempted defensively
--
-- If these raise (insufficient privilege on storage.objects), the migration
-- carries on and the organizer creates the bucket from the dashboard instead.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('clue-media', 'clue-media', true)
  on conflict (id) do update set public = true;
exception when others then
  raise notice 'Could not create the clue-media bucket automatically (%). Create it in the dashboard: Storage > New bucket > name "clue-media" > Public.', sqlerrm;
end $$;

do $$
begin
  drop policy if exists "clue media admin write" on storage.objects;
  drop policy if exists "clue media admin update" on storage.objects;
  drop policy if exists "clue media admin delete" on storage.objects;
  drop policy if exists "clue media read" on storage.objects;

  create policy "clue media admin write" on storage.objects
    for insert to authenticated with check (bucket_id = 'clue-media' and is_admin());
  create policy "clue media admin update" on storage.objects
    for update to authenticated using (bucket_id = 'clue-media' and is_admin());
  create policy "clue media admin delete" on storage.objects
    for delete to authenticated using (bucket_id = 'clue-media' and is_admin());
  create policy "clue media read" on storage.objects
    for select to public using (bucket_id = 'clue-media');
exception when others then
  raise notice 'Could not set clue-media storage policies automatically (%). A public bucket works without them.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Confirm the per-clue code function is present and callable
--
-- Re-declared here so that a project where 0009 only partly applied still ends
-- up with a working Generate code button.
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
begin
  if v_admin is null then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_stage not between 1 and 4 then
    return jsonb_build_object('ok', false, 'code', 'BAD_STAGE');
  end if;

  select id into v_game_id from games where status <> 'FINISHED' limit 1;
  if v_game_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  v_token := 'GCMH-' || upper(encode(gen_random_bytes(9), 'hex'));
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

grant execute on function issue_checkpoint_code(integer, integer, text) to authenticated;

-- A quick self-check an organizer can read in the SQL editor output.
do $$
declare v_missing text := '';
begin
  if to_regprocedure('public.issue_checkpoint_code(integer,integer,text)') is null then
    v_missing := v_missing || ' issue_checkpoint_code';
  end if;
  if to_regprocedure('public.upsert_hint(integer,text,text,text,integer,text,text,boolean)') is null then
    v_missing := v_missing || ' upsert_hint';
  end if;
  if v_missing = '' then
    raise notice 'All clue functions present. Generate code should now work.';
  else
    raise warning 'Still missing:%. Re-run migration 0009.', v_missing;
  end if;
end $$;

-- =============================================================================
-- GC Campus Mystery Hunt — 0011 finishing the game must not brick it
--
-- THE BUG
-- Nearly every function found the current game with:
--     select * into v_game from games where status <> 'FINISHED' limit 1;
-- so the moment an organizer pressed "Finish game", every one of them returned
-- NO_GAME: no clue could be saved, no code issued, no message sent.
--
-- Worse, set_game_status() used the same lookup, so the status could not be
-- changed back. A single click left the event permanently unusable with no
-- route out through the interface.
--
-- THE FIX
-- "The current game" now means the most recently created game, whatever its
-- status. Functions that genuinely require play to be underway (checkpoint
-- verification, registration, help requests) still check the status
-- explicitly and return their own clear codes — those checks were always
-- separate from finding the game, and they are untouched.
--
-- Safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rewrite the lookup inside every function that uses it
--
-- Done by reading each function's own definition and re-declaring it, so the
-- bodies stay exactly as written apart from this one pattern. Listing ~17
-- functions out in full would risk quietly reverting later fixes.
-- -----------------------------------------------------------------------------

do $$
declare
  r        record;
  src      text;
  updated  text := '';
begin
  -- prokind='f' excludes aggregates and window functions: pg_get_functiondef
  -- raises on those, and the planner is free to evaluate it before the schema
  -- filter, so the pattern match has to happen inside the loop instead.
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    src := pg_get_functiondef(r.oid);
    continue when src not like '%from games where status <> ''FINISHED''%';

    -- Both shapes that appear in the codebase.
    src := replace(
      src,
      'from games where status <> ''FINISHED'' for update',
      'from games order by created_at desc limit 1 for update'
    );
    src := replace(
      src,
      'from games where status <> ''FINISHED'' limit 1',
      'from games order by created_at desc limit 1'
    );

    -- create_game() deliberately asks "does an unfinished game already exist?"
    -- That is a different question and must keep its original meaning.
    if r.proname <> 'create_game' then
      execute src;
      updated := updated || ' ' || r.proname;
    end if;
  end loop;

  if updated = '' then
    raise notice 'No functions needed the game-lookup fix (already applied).';
  else
    raise notice 'Fixed the game lookup in:%', updated;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Let organizers leave the FINISHED state
--
-- Re-declared in full rather than patched, because this is the one function
-- that must be certain to work: it is the way out of any wrong status.
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

  -- The current game, whatever state it is in — including FINISHED.
  select * into v_game from games order by created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_GAME');
  end if;

  update games
  set status = p_status,
      registration_open = (p_status = 'REGISTRATION'),
      started_at  = case when p_status = 'ACTIVE' then coalesce(started_at, now()) else started_at end,
      -- Cleared when reopening, so a reopened game does not look finished.
      finished_at = case
                      when p_status in ('FINISHED', 'WINNERS_REVEALED') then coalesce(finished_at, now())
                      else null
                    end
  where id = v_game.id;

  insert into admin_audit_logs (game_id, admin_id, action, detail)
  values (v_game.id, v_admin, 'SET_GAME_STATUS',
          jsonb_build_object('from', v_game.status, 'to', p_status));

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

grant execute on function set_game_status(game_status) to authenticated;

-- -----------------------------------------------------------------------------
-- The single-active-game index assumed a finished game frees the slot
--
-- With FINISHED no longer meaning "gone", that index would block creating a
-- second game while the first sits in any other state. Replaced with a rule
-- that simply allows one game per event, which is what the spec describes.
-- -----------------------------------------------------------------------------

drop index if exists games_single_active;

-- -----------------------------------------------------------------------------
-- Repair: bring a game that is stuck in FINISHED back into play
--
-- Only touches an event that has no revealed winners, so a genuinely completed
-- hunt is left alone. Remove this block if you ever want a game to stay
-- finished through a re-run of this migration.
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_status game_status;
begin
  select id, status into v_id, v_status from games order by created_at desc limit 1;

  if v_id is not null and v_status = 'FINISHED'
     and not exists (select 1 from winners where game_id = v_id and revealed_at is not null)
  then
    update games set status = 'PAUSED', finished_at = null where id = v_id;
    raise notice 'Your game was stuck in FINISHED and has been set to PAUSED. Press Start game on the Overview tab when you are ready.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Self-check
-- -----------------------------------------------------------------------------

do $$
declare v_left integer;
begin
  select count(*) into v_left
  from (
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'create_game'
  ) fns
  where pg_get_functiondef(fns.oid) like '%from games where status <> ''FINISHED''%';

  if v_left = 0 then
    raise notice 'All clear: finishing the game no longer disables the app.';
  else
    raise warning '% function(s) still use the old lookup.', v_left;
  end if;
end $$;

-- =============================================================================
-- GC Campus Mystery Hunt — 0012 reset the event back to the starting line
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

-- =============================================================================
-- GC Campus Mystery Hunt — 0013 make deletions reach the phones
--
-- THE BUG
-- After "Start the event over", students stayed on their old screen as though
-- nothing had happened — still showing a finished hunt, still apparently
-- registered.
--
-- WHY
-- Postgres defaults to REPLICA IDENTITY DEFAULT, which puts only the primary
-- key into the write-ahead log for a DELETE. Supabase Realtime has to apply
-- Row Level Security to every event before sending it, and it cannot decide
-- whether a student may see a row when all it has is an id. So delete events
-- were silently dropped, and a phone never learned its participant row was
-- gone.
--
-- Inserts and updates were unaffected, which is why everything else during the
-- event worked and only the reset appeared broken.
--
-- THE FIX
-- REPLICA IDENTITY FULL writes the whole old row, so the security rules can be
-- evaluated and the event delivered. The cost is a larger write-ahead log per
-- delete, which for an event of this size is irrelevant.
--
-- Safe to run more than once.
-- =============================================================================

alter table participants             replica identity full;
alter table groups                   replica identity full;
alter table group_members            replica identity full;
alter table checkpoint_verifications replica identity full;
alter table notifications            replica identity full;
alter table notification_recipients  replica identity full;
alter table help_requests            replica identity full;
alter table winners                  replica identity full;
alter table hints                    replica identity full;

-- Make sure every table the student page watches is actually published.
-- Adding one twice raises duplicate_object, so each is attempted separately.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication here (normal outside Supabase).';
    return;
  end if;

  foreach t in array array[
    'games', 'groups', 'group_members', 'hints',
    'checkpoint_verifications', 'notifications', 'notification_recipients',
    'help_requests', 'winners', 'participants'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;  -- already published
      when others then
        raise notice 'Could not publish % (%)', t, sqlerrm;
    end;
  end loop;

  raise notice 'Realtime publication checked. Deletions will now reach students.';
end $$;

-- =============================================================================
-- GC Campus Mystery Hunt — 0014 reset blocked by Supabase's unqualified-delete guard
--
-- THE BUG
--   Reset failed: DELETE requires a WHERE clause (21000)
--
-- WHY
-- Supabase enables pg_safeupdate for the API roles. It rejects any DELETE or
-- UPDATE with no WHERE clause, which is a sensible guard against wiping a
-- table by accident from the dashboard.
--
-- reset_game() cleared the rate-limit table with a bare
--     delete from rate_limit_events;
-- Every other delete in that function is already scoped by game_id; this one
-- was not, because clearing it entirely is genuinely what we want.
--
-- The guard applies to the session role, so being SECURITY DEFINER does not
-- exempt it. Giving the statement an explicit WHERE satisfies the check while
-- still removing every row.
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
  -- cascade, so those rows must go before the students they point at.
  delete from checkpoint_verifications where game_id = v_game.id;
  delete from help_requests            where game_id = v_game.id;
  delete from winners                  where game_id = v_game.id;
  delete from notifications            where game_id = v_game.id;  -- cascades recipients
  delete from group_members            where game_id = v_game.id;
  delete from groups                   where game_id = v_game.id;
  delete from participants             where game_id = v_game.id;

  -- Registration allows 3 attempts per hour per device; without clearing this
  -- a rehearsal would hit the limit on the second run from the same phone.
  --
  -- The WHERE is required, not decorative: Supabase's pg_safeupdate guard
  -- rejects an unqualified DELETE with SQLSTATE 21000. `id is not null` is
  -- always true for a primary key, so this still removes every row.
  delete from rate_limit_events where id is not null;

  if p_include_clues then
    delete from checkpoints where game_id = v_game.id;
    delete from hints       where game_id = v_game.id;

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

-- -----------------------------------------------------------------------------
-- Guard against this whole class of bug
--
-- Any other function carrying an unqualified DELETE or UPDATE would fail the
-- same way, and only at the moment an organizer pressed the button. Check now
-- instead.
-- -----------------------------------------------------------------------------

do $$
declare
  r       record;
  src     text;
  flagged text := '';
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    src := pg_get_functiondef(r.oid);
    -- A delete/update naming a table and ending at the semicolon with no WHERE.
    if src ~* E'(delete\\s+from|update)\\s+[a-z_]+\\s*;' then
      flagged := flagged || ' ' || r.proname;
    end if;
  end loop;

  if flagged = '' then
    raise notice 'No unqualified DELETE/UPDATE left. Reset should now work.';
  else
    raise warning 'These still contain an unqualified DELETE/UPDATE and will fail on Supabase:%', flagged;
  end if;
end $$;

-- =============================================================================
-- GC Campus Mystery Hunt — 0015 two fixes to checkpoint verification
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

-- =============================================================================
-- GC Campus Mystery Hunt — 0016 teams of two
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

