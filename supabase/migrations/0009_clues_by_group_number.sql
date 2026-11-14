-- =============================================================================
-- Game for power unity! — 0009 author clues by group NUMBER, not group row
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
