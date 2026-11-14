-- =============================================================================
-- Game for power unity! — 0014 reset blocked by Supabase's unqualified-delete guard
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
