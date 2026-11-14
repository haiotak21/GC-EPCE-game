-- =============================================================================
-- Game for power unity! — 0010 repairs after the group_number change
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
