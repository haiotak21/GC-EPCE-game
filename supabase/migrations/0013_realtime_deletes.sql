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
