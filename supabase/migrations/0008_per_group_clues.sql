-- =============================================================================
-- Game for power unity! — 0008 per-group clues and per-group checkpoints
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
