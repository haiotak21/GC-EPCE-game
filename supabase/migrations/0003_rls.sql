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
