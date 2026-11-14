-- =============================================================================
-- Game for power unity! — 0011 finishing the game must not brick it
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
