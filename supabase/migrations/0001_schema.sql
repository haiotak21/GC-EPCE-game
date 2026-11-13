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
