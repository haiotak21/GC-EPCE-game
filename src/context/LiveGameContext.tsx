/**
 * Live game state, backed by Supabase.
 *
 * Replaces the localStorage store: state lives in the database, every device
 * sees the same thing, and changes arrive over Realtime without a refresh.
 *
 * The read model is deliberately dumb — on any change we refetch what this
 * student is allowed to see. RLS already narrows every query to their own row,
 * their own group and their own messages, so there is no filtering to do here
 * and no way for a client bug to leak another team's data.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  supabase,
  ensureSession,
  clearSession,
  rpc,
  subscribeToGame,
  STUDENT_TABLES,
} from '../lib/supabase';
import type {
  Game,
  Group,
  Hint,
  Participant,
  CheckpointVerification,
  Notification,
  NotificationRecipient,
  HelpRequest,
  Winner,
  RegisterResult,
  VerifyCheckpointResult,
  HelpRequestResult,
  SetGroupNameResult,
} from '../lib/database.types';

export interface LiveGameState {
  /** False until the first load finishes, so the UI can avoid flashing empty states. */
  ready: boolean;
  /** Set when the connection itself is broken (bad config, anonymous sign-ins off). */
  fatalError: string | null;
  /**
   * True when this browser is signed in with an organizer account.
   *
   * An organizer who opens the student page in the same browser is handed the
   * organizer's identity, because the session already exists — typing a name
   * only labels it. They then see every team's data, which is what happened in
   * testing. The page warns instead of quietly registering them.
   */
  isOrganizerSession: boolean;
  /** Signs out of the organizer account and starts a fresh student session. */
  switchToStudentSession: () => Promise<void>;

  game: Game | null;
  me: Participant | null;
  myGroup: Group | null;
  teammates: Participant[];
  hints: Hint[];
  verifications: CheckpointVerification[];
  notifications: Array<Notification & { read_at: string | null }>;
  helpRequests: HelpRequest[];
  winners: Array<Winner & { group_number?: number; group_name?: string | null }>;

  /** Stages this team has finished, as an unbroken run from 1. */
  completedStage: number;
  unreadCount: number;
  /** Shown once after registering, then never retrievable again. */
  recoveryCode: string | null;

  register: (fullName: string) => Promise<RegisterResult>;
  recoverSession: (code: string) => Promise<boolean>;
  verifyCheckpoint: (token: string, organizerCode?: string) => Promise<VerifyCheckpointResult>;
  requestHelp: (message: string) => Promise<HelpRequestResult>;
  renameGroup: (name: string) => Promise<SetGroupNameResult>;
  markRead: (notificationId: string) => Promise<void>;
  /** Clears the whole unread queue in one go. */
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const LiveGameContext = createContext<LiveGameState | undefined>(undefined);

export const LiveGameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isOrganizerSession, setIsOrganizerSession] = useState(false);

  const [game, setGame] = useState<Game | null>(null);
  const [me, setMe] = useState<Participant | null>(null);
  const [myGroup, setMyGroup] = useState<Group | null>(null);
  const [teammates, setTeammates] = useState<Participant[]>([]);
  const [hints, setHints] = useState<Hint[]>([]);
  const [verifications, setVerifications] = useState<CheckpointVerification[]>([]);
  const [notifications, setNotifications] = useState<
    Array<Notification & { read_at: string | null }>
  >([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [winners, setWinners] = useState<
    Array<Winner & { group_number?: number; group_name?: string | null }>
  >([]);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  // Guards against overlapping refreshes: a burst of realtime events should
  // produce one refetch, not six racing ones that can land out of order.
  const refreshing = useRef(false);
  const queued = useRef(false);

  const loadAll = useCallback(async () => {
    const session = await ensureSession();
    const authUserId = session?.user?.id;
    if (!authUserId) return;

    /**
     * Who am I, and which team am I in?
     *
     * These two come first and everything below is filtered by them. Nothing
     * here relies on the access rules to mean "mine", because several of them
     * deliberately mean more than that: notification_recipients, help_requests
     * and checkpoint_verifications all end in `or is_admin()`, and
     * group_members also exposes the winning team. An organizer who opens the
     * student page is an admin, so trusting those rules showed them every
     * student's notifications, duplicated once per recipient — reported from
     * live testing as notifications from other teams appearing three times
     * over.
     */
    const [participantRes, groupRes, adminRes] = await Promise.all([
      supabase.rpc('current_participant_id'),
      supabase.rpc('current_group_id'),
      supabase.rpc('is_admin'),
    ]);

    setIsOrganizerSession(adminRes.data === true);

    const myParticipantId = (participantRes.data as string | null) ?? null;
    const myGroupId = (groupRes.data as string | null) ?? null;

    const [gameRes, meRes, hintsRes, verificationsRes, recipientsRes, helpRes, winnersRes] =
      await Promise.all([
        supabase.from('games').select('*').limit(1).maybeSingle(),
        supabase.from('participants').select('*').eq('auth_user_id', authUserId).maybeSingle(),
        supabase.from('hints').select('*').order('hint_number'),

        myGroupId
          ? supabase
              .from('checkpoint_verifications')
              .select('*')
              .eq('group_id', myGroupId)
              .order('verified_at')
          : Promise.resolve({ data: [] as CheckpointVerification[] }),

        myParticipantId
          ? supabase
              .from('notification_recipients')
              .select('read_at, participant_id, notification:notifications(*)')
              .eq('participant_id', myParticipantId)
          : Promise.resolve({ data: [] }),

        myGroupId
          ? supabase
              .from('help_requests')
              .select('*')
              .eq('group_id', myGroupId)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as HelpRequest[] }),

        supabase.from('winners').select('*, group:groups(group_number, group_name)').order('position'),
      ]);

    setGame((gameRes.data as Game | null) ?? null);

    // If the organizer reset the event, this student's record is gone. Drop
    // the one-time recovery code with it, so the fresh registration screen
    // does not show a code that no longer unlocks anything.
    const meRow = (meRes.data as Participant | null) ?? null;
    if (!meRow) setRecoveryCode(null);
    setMe(meRow);

    setVerifications((verificationsRes.data as CheckpointVerification[] | null) ?? []);
    setHelpRequests((helpRes.data as HelpRequest[] | null) ?? []);

    // Group + teammates. Only visible once the organizer publishes teams.
    let myGroupRow: Group | null = null;
    if (myGroupId) {
      const [gRes, membersRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', myGroupId).maybeSingle(),
        supabase
          .from('group_members')
          .select('participant:participants(*)')
          .eq('group_id', myGroupId),
      ]);
      myGroupRow = (gRes.data as Group | null) ?? null;
      setMyGroup(myGroupRow);
      setTeammates(
        ((membersRes.data as Array<{ participant: Participant }> | null) ?? [])
          .map((row) => row.participant)
          .filter(Boolean)
      );
    } else {
      setMyGroup(null);
      setTeammates([]);
    }

    /**
     * Clues. An organizer viewing the student page can read every clue,
     * including other teams' and unpublished drafts, so narrow to what this
     * team has actually earned rather than showing whatever came back.
     */
    const myGroupNumber = myGroupRow?.group_number ?? null;
    const completed = ((verificationsRes.data as CheckpointVerification[] | null) ?? []).length;
    setHints(
      ((hintsRes.data as Hint[] | null) ?? []).filter(
        (h) =>
          h.published_at !== null &&
          (h.group_number === null || h.group_number === myGroupNumber) &&
          h.hint_number <= Math.min(completed + 1, 4)
      )
    );

    /**
     * Notifications. Deduplicated by notification id: a message addressed to a
     * whole team has one delivery row per member, and an organizer can see all
     * of them. Without this the same message appeared three times, and
     * dismissing it opened an identical popup underneath.
     */
    const recipientRows =
      (recipientsRes.data as Array<
        Pick<NotificationRecipient, 'read_at' | 'participant_id'> & {
          notification: Notification | null;
        }
      > | null) ?? [];

    const seen = new Set<string>();
    setNotifications(
      recipientRows
        .filter((r) => r.notification && (!myParticipantId || r.participant_id === myParticipantId))
        .filter((r) => {
          const id = (r.notification as Notification).id;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((r) => ({ ...(r.notification as Notification), read_at: r.read_at }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );

    const winnerRows =
      (winnersRes.data as Array<
        Winner & { group: { group_number: number; group_name: string | null } | null }
      > | null) ?? [];
    setWinners(
      winnerRows.map((w) => ({
        ...w,
        group_number: w.group?.group_number,
        group_name: w.group?.group_name ?? null,
      }))
    );
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      queued.current = true;
      return;
    }
    refreshing.current = true;
    try {
      await loadAll();
    } catch (err) {
      console.error('Refresh failed:', err);
      if (err instanceof Error && /anonymous|configuration/i.test(err.message)) {
        setFatalError(err.message);
      }
    } finally {
      refreshing.current = false;
      setReady(true);
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [loadAll]);

  // First load + realtime subscription.
  useEffect(() => {
    let channel: ReturnType<typeof subscribeToGame> | null = null;
    let cancelled = false;

    (async () => {
      try {
        await ensureSession();
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        channel = subscribeToGame(STUDENT_TABLES, () => void refresh());
      } catch (err) {
        console.error('Startup failed:', err);
        setFatalError(err instanceof Error ? err.message : String(err));
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Safety net: realtime can miss events on a flaky campus connection, and a
  // phone that misses one would sit on a stale screen indefinitely. A slow
  // poll costs almost nothing at this scale and guarantees every device
  // converges — including after an organizer resets the event.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  // Coming back from a locked phone or a tunnel: resync immediately rather
  // than waiting for the next realtime event (§16).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh]);

  // --- Actions ---------------------------------------------------------------

  const register = useCallback(
    async (fullName: string): Promise<RegisterResult> => {
      const result = await rpc('register_participant', { p_full_name: fullName });
      if (result.ok && 'recovery_code' in result && result.recovery_code) {
        setRecoveryCode(result.recovery_code);
      }
      await refresh();
      return result;
    },
    [refresh]
  );

  const recoverSession = useCallback(
    async (code: string): Promise<boolean> => {
      const result = await rpc('redeem_recovery_code', { p_code: code });
      await refresh();
      return result.ok;
    },
    [refresh]
  );

  const verifyCheckpoint = useCallback(
    async (token: string, organizerCode?: string): Promise<VerifyCheckpointResult> => {
      const result = await rpc('verify_checkpoint', {
        p_token: token,
        p_organizer_code: organizerCode ?? null,
      });
      await refresh();
      return result;
    },
    [refresh]
  );

  const requestHelp = useCallback(
    async (message: string): Promise<HelpRequestResult> => {
      const result = await rpc('create_help_request', { p_message: message });
      await refresh();
      return result;
    },
    [refresh]
  );

  const renameGroup = useCallback(
    async (name: string): Promise<SetGroupNameResult> => {
      if (!myGroup) {
        return { ok: false, code: 'NOT_FOUND' } as SetGroupNameResult;
      }
      // Sends the version we last saw, so a teammate renaming at the same
      // moment produces a clear conflict instead of a silent overwrite.
      const result = await rpc('set_group_name', {
        p_group_id: myGroup.id,
        p_name: name,
        p_expected_version: myGroup.name_version,
      });
      await refresh();
      return result;
    },
    [myGroup, refresh]
  );

  const markRead = useCallback(
    async (notificationId: string) => {
      // Update locally first. A refresh round trip takes a moment on campus
      // wifi, and without this the row still looks unread, so students tap it
      // again and again.
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      await rpc('mark_notification_read', { p_notification_id: notificationId });
      await refresh();
    },
    [refresh]
  );

  /**
   * Leaves the organizer account and comes back as a brand-new student.
   *
   * Reloads rather than refetching: a different identity means every piece of
   * state on the page belongs to someone else.
   */
  const switchToStudentSession = useCallback(async () => {
    await clearSession();
    await ensureSession();
    window.location.reload();
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;

    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));

    await Promise.all(
      unread.map((n) => rpc('mark_notification_read', { p_notification_id: n.id }))
    );
    await refresh();
  }, [notifications, refresh]);

  // --- Derived ---------------------------------------------------------------

  // How many stages this team has finished.
  //
  // Counting rows is sound here precisely because the database refuses any
  // verification that is not exactly `completed + 1` — so a team's rows are
  // always the unbroken run 1..n, never a gap. The database stays
  // authoritative (group_completed_stage); this is only for rendering.
  const completedStage = Math.min(verifications.length, 4);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <LiveGameContext.Provider
      value={{
        ready,
        fatalError,
        isOrganizerSession,
        switchToStudentSession,
        game,
        me,
        myGroup,
        teammates,
        hints,
        verifications,
        notifications,
        helpRequests,
        winners,
        completedStage,
        unreadCount,
        recoveryCode,
        register,
        recoverSession,
        verifyCheckpoint,
        requestHelp,
        renameGroup,
        markRead,
        markAllRead,
        refresh,
      }}
    >
      {children}
    </LiveGameContext.Provider>
  );
};

export function useLiveGame(): LiveGameState {
  const ctx = useContext(LiveGameContext);
  if (!ctx) throw new Error('useLiveGame must be used inside a LiveGameProvider');
  return ctx;
}
