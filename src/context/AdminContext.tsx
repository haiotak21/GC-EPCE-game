/**
 * Organizer state and actions.
 *
 * Organizers sign in with email + password (§8), unlike students. Being signed
 * in is not the same as being an organizer: `isAdmin` comes from the database
 * asking whether this auth user has a row in `admins`. A student who somehow
 * loads this page sees nothing, because every admin RPC re-checks server-side
 * and every admin query is filtered by RLS.
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
import { supabase, rpc, subscribeToGame, ADMIN_TABLES, describeError } from '../lib/supabase';
import type {
  Admin,
  AdminAuditLog,
  Game,
  GameStatus,
  Group,
  HelpRequest,
  Hint,
  Participant,
  Checkpoint,
  CheckpointVerification,
  Winner,
  NotificationType,
  NotificationAudience,
  PreviewAssignmentResult,
} from '../lib/database.types';

export interface GroupWithMembers extends Group {
  members: Participant[];
  /** Completed stages, 0–4. */
  completedStage: number;
  /** When each stage was verified, for the progress matrix and tie-breaking. */
  stageTimes: Record<number, string>;
}

export interface AdminState {
  ready: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  me: Admin | null;
  authError: string | null;

  game: Game | null;
  participants: Participant[];
  groups: GroupWithMembers[];
  hints: Hint[];
  checkpoints: Checkpoint[];
  helpRequests: HelpRequest[];
  winners: Winner[];
  /** Every organizer, so replies and actions can be attributed by name. */
  admins: Admin[];
  /** Shared action history — any organizer can see what the others did (§18). */
  auditLogs: AdminAuditLog[];

  /** Students who are registered but not in a team yet. */
  unassigned: Participant[];
  /** The last preview, held in memory only — never shown to students (§9.3). */
  preview: PreviewAssignmentResult | null;

  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;

  setGameStatus: (status: GameStatus) => Promise<void>;
  previewTeams: () => Promise<void>;
  clearPreview: () => void;
  publishTeams: () => Promise<{ ok: boolean; message: string }>;
  /** Places students who registered after the draw (§9.2 late registrations). */
  assignLateParticipants: () => Promise<{ ok: boolean; message: string }>;
  /** Clears the draw so it can be redone. Refuses once any team has progress. */
  resetTeams: () => Promise<{ ok: boolean; message: string }>;
  /** Wipes students, teams, progress and messages; reopens registration. */
  resetGame: (includeClues: boolean) => Promise<{ ok: boolean; message: string }>;
  sendNotification: (args: {
    title: string;
    message: string;
    type?: NotificationType;
    audience?: NotificationAudience;
    targetIds?: string[];
  }) => Promise<{ ok: boolean; message: string }>;
  answerHelp: (requestId: string, reply: string) => Promise<void>;
  /** §11 clue authoring. groupId null = a shared clue for every team. */
  saveHint: (args: {
    hintNumber: number;
    title: string;
    content?: string;
    description?: string;
    /** null = a shared clue every team sees. */
    groupNumber?: number | null;
    mediaUrl?: string;
    publish?: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  setHintPublished: (
    hintNumber: number,
    groupNumber: number | null,
    published: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  /** §6 issues one checkpoint code. Returns the plaintext token ONCE. */
  issueCode: (
    stage: number,
    groupNumber: number | null,
    location?: string
  ) => Promise<{ ok: boolean; code?: string; token?: string; label?: string }>;
  setWinners: (
    selections: Array<{ group_id: string; position: 1 | 2 | 3; prize_amount: number }>
  ) => Promise<{ ok: boolean; message: string }>;
  revealWinners: () => Promise<{ ok: boolean; message: string }>;
  refresh: () => Promise<void>;
}

const AdminContext = createContext<AdminState | undefined>(undefined);

export const AdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState<Admin | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [hints, setHints] = useState<Hint[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [preview, setPreview] = useState<PreviewAssignmentResult | null>(null);

  const refreshing = useRef(false);
  const queued = useRef(false);

  const loadAll = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    setSignedIn(!!session);

    if (!session) {
      setIsAdmin(false);
      setMe(null);
      return;
    }

    // The database decides, not the client.
    const { data: adminFlag } = await supabase.rpc('is_admin');
    const admin = adminFlag === true;
    setIsAdmin(admin);
    if (!admin) {
      setMe(null);
      return;
    }

    const [
      meRes,
      gameRes,
      participantsRes,
      groupsRes,
      membersRes,
      hintsRes,
      checkpointsRes,
      helpRes,
      winnersRes,
      verificationsRes,
      adminsRes,
      auditRes,
    ] = await Promise.all([
      supabase.from('admins').select('*').eq('auth_user_id', session.user.id).maybeSingle(),
      supabase.from('games').select('*').limit(1).maybeSingle(),
      supabase.from('participants').select('*').order('registered_at'),
      supabase.from('groups').select('*').order('group_number'),
      supabase.from('group_members').select('group_id, participant:participants(*)'),
      supabase.from('hints').select('*').order('hint_number'),
      supabase.from('checkpoints').select('*').order('stage_number'),
      supabase.from('help_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('winners').select('*').order('position'),
      supabase.from('checkpoint_verifications').select('*').order('verified_at'),
      supabase.from('admins').select('*').order('created_at'),
      supabase.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    setMe((meRes.data as Admin | null) ?? null);
    setGame((gameRes.data as Game | null) ?? null);
    setParticipants((participantsRes.data as Participant[] | null) ?? []);
    setHints((hintsRes.data as Hint[] | null) ?? []);
    setCheckpoints((checkpointsRes.data as Checkpoint[] | null) ?? []);
    setHelpRequests((helpRes.data as HelpRequest[] | null) ?? []);
    setWinners((winnersRes.data as Winner[] | null) ?? []);
    setAdmins((adminsRes.data as Admin[] | null) ?? []);
    setAuditLogs((auditRes.data as AdminAuditLog[] | null) ?? []);

    // Stitch groups together with their members and progress (§12 matrix).
    const rawGroups = (groupsRes.data as Group[] | null) ?? [];
    const memberRows =
      (membersRes.data as Array<{ group_id: string; participant: Participant | null }> | null) ?? [];
    const checkpointRows = (checkpointsRes.data as Checkpoint[] | null) ?? [];
    const verificationRows = (verificationsRes.data as CheckpointVerification[] | null) ?? [];

    const stageOf = new Map(checkpointRows.map((c) => [c.id, c.stage_number]));

    setGroups(
      rawGroups.map((g) => {
        const members = memberRows
          .filter((m) => m.group_id === g.id && m.participant)
          .map((m) => m.participant as Participant);

        const stageTimes: Record<number, string> = {};
        for (const v of verificationRows) {
          if (v.group_id !== g.id) continue;
          const stage = stageOf.get(v.checkpoint_id);
          if (stage) stageTimes[stage] = v.verified_at;
        }

        // Longest unbroken run from stage 1.
        let completedStage = 0;
        while (stageTimes[completedStage + 1]) completedStage += 1;

        return { ...g, members, completedStage, stageTimes };
      })
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
      console.error('Admin refresh failed:', err);
    } finally {
      refreshing.current = false;
      setReady(true);
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [loadAll]);

  useEffect(() => {
    let channel: ReturnType<typeof subscribeToGame> | null = null;

    void refresh();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    channel = subscribeToGame(ADMIN_TABLES, () => void refresh());

    return () => {
      sub.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // --- Auth ------------------------------------------------------------------

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null);

      // An organizer may already hold an anonymous student session in this
      // browser; signing in with a password replaces it cleanly.
      await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setAuthError(
          error.message.toLowerCase().includes('invalid')
            ? 'Wrong email or password.'
            : error.message
        );
        return false;
      }

      const { data: adminFlag } = await supabase.rpc('is_admin');
      if (adminFlag !== true) {
        // Authenticated, but not an organizer. Do not leave them half-in.
        await supabase.auth.signOut();
        setAuthError('That account is not an organizer for this game.');
        return false;
      }

      // Commit the result we just confirmed, before any refresh.
      //
      // refresh() returns immediately when another refresh is already running
      // (the onAuthStateChange handler fires one), so awaiting it is NOT a
      // guarantee that isAdmin has been set. Relying on that raced with the
      // router and bounced a freshly signed-in organizer back to the login
      // form.
      setSignedIn(true);
      setIsAdmin(true);
      setReady(true);

      await refresh();
      return true;
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setMe(null);
    setPreview(null);
    await refresh();
  }, [refresh]);

  // --- Actions ---------------------------------------------------------------

  const setGameStatus = useCallback(
    async (status: GameStatus) => {
      await rpc('set_game_status', { p_status: status });
      await refresh();
    },
    [refresh]
  );

  const previewTeams = useCallback(async () => {
    const result = await rpc('preview_team_assignment');
    setPreview(result);
  }, []);

  const clearPreview = useCallback(() => setPreview(null), []);

  const publishTeams = useCallback(async () => {
    if (!preview?.groups?.length) {
      return { ok: false, message: 'Nothing to publish — press Assign Teams first.' };
    }
    const result = await rpc('publish_team_assignment', { p_groups: preview.groups });
    setPreview(null);
    await refresh();

    if (result.ok) {
      return { ok: true, message: `Published ${result.groups_created} teams.` };
    }
    return {
      ok: false,
      message:
        result.code === 'ALREADY_PUBLISHED'
          ? 'Teams were already published — possibly by another organizer just now.'
          : result.code === 'REGISTRATION_STILL_OPEN'
            ? 'Close registration first — the student list must be final before drawing teams.'
            : 'Could not publish teams.',
    };
  }, [preview, refresh]);

  const assignLateParticipants = useCallback(async () => {
    const result = (await rpc(
      'assign_unassigned_participants' as never,
      {} as never
    )) as unknown as {
      ok: boolean;
      code?: string;
      placed?: number;
      new_teams?: number;
      still_pending?: number;
    };
    await refresh();

    if (!result.ok) return { ok: false, message: 'Could not assign the new students.' };
    if (result.code === 'NOTHING_TO_DO') {
      return { ok: true, message: 'Everyone already has a team.' };
    }

    const parts = [`Placed ${result.placed} student(s)`];
    if (result.new_teams) parts.push(`${result.new_teams} new team(s)`);
    if (result.still_pending) {
      parts.push(`${result.still_pending} still waiting — too few to form a team`);
    }
    return { ok: true, message: `${parts.join(' · ')}.` };
  }, [refresh]);

  const resetTeams = useCallback(async () => {
    const result = (await rpc('reset_team_assignment' as never, {} as never)) as unknown as {
      ok: boolean;
      code?: string;
      groups_removed?: number;
    };
    await refresh();

    if (result.ok) {
      return { ok: true, message: `Cleared ${result.groups_removed} team(s). Draw again below.` };
    }
    return {
      ok: false,
      message:
        result.code === 'PROGRESS_EXISTS'
          ? 'Teams have already verified checkpoints — redrawing now would erase their progress.'
          : result.code === 'WINNERS_SELECTED'
            ? 'Winners have been selected, so teams can no longer be changed.'
            : 'Could not clear the teams.',
    };
  }, [refresh]);

  const resetGame = useCallback(
    async (includeClues: boolean) => {
      const result = (await rpc('reset_game' as never, {
        p_include_clues: includeClues,
      } as never)) as unknown as {
        ok: boolean;
        participants_removed?: number;
        groups_removed?: number;
        clues_removed?: boolean;
      };
      await refresh();
      if (!result.ok) return { ok: false, message: 'Could not reset the game.' };
      return {
        ok: true,
        message:
          `Reset done — removed ${result.participants_removed ?? 0} student(s) and ` +
          `${result.groups_removed ?? 0} team(s). ` +
          (result.clues_removed ? 'Clues were cleared too.' : 'Your clues and codes were kept.') +
          ' Registration is open again.',
      };
    },
    [refresh]
  );

  const sendNotification = useCallback(
    async (args: {
      title: string;
      message: string;
      type?: NotificationType;
      audience?: NotificationAudience;
      targetIds?: string[];
    }) => {
      const result = await rpc('send_notification', {
        p_title: args.title,
        p_message: args.message,
        p_type: args.type ?? 'announcement',
        p_audience: args.audience ?? 'everyone',
        p_target_ids: args.targetIds ?? null,
      });
      await refresh();
      return result.ok
        ? { ok: true, message: `Sent to ${result.recipients} student(s).` }
        : { ok: false, message: 'Could not send.' };
    },
    [refresh]
  );

  const answerHelp = useCallback(
    async (requestId: string, reply: string) => {
      await rpc('answer_help_request', { p_request_id: requestId, p_reply: reply });
      await refresh();
    },
    [refresh]
  );

  const saveHint = useCallback(
    async (args: {
      hintNumber: number;
      title: string;
      content?: string;
      description?: string;
      groupNumber?: number | null;
      mediaUrl?: string;
      publish?: boolean;
    }) => {
      try {
      const result = (await rpc('upsert_hint' as never, {
        p_hint_number: args.hintNumber,
        p_title: args.title,
        p_content: args.content ?? null,
        p_description: args.description ?? null,
        p_group_number: args.groupNumber ?? null,
        // '' clears an attachment; undefined leaves it untouched.
        p_media_url: args.mediaUrl ?? null,
        p_publish: args.publish ?? false,
      } as never)) as unknown as { ok: boolean; code?: string };
      await refresh();
      if (result.ok) return { ok: true, message: 'Saved.' };
      return {
        ok: false,
        message:
          result.code === 'TITLE_REQUIRED'
            ? 'Give the clue a title.'
            : result.code === 'NO_GAME'
              ? 'No game found — create one, or check the game status on Overview.'
              : `Could not save the clue (${result.code ?? 'unknown'}).`,
      };
      } catch (err) {
        return { ok: false, message: `Could not save the clue: ${describeError(err)}` };
      }
    },
    [refresh]
  );

  const setHintPublished = useCallback(
    async (hintNumber: number, groupNumber: number | null, published: boolean) => {
      const result = (await rpc('set_hint_published' as never, {
        p_hint_number: hintNumber,
        p_group_number: groupNumber,
        p_published: published,
      } as never)) as unknown as { ok: boolean };
      await refresh();
      return result.ok
        ? { ok: true, message: published ? 'Clue published.' : 'Clue hidden again.' }
        : { ok: false, message: 'Could not change that clue.' };
    },
    [refresh]
  );

  const issueCode = useCallback(
    async (stage: number, groupNumber: number | null, location?: string) => {
      const { data, error } = await supabase.rpc('issue_checkpoint_code', {
        p_stage: stage,
        p_group_number: groupNumber,
        p_location: location ?? null,
      });
      if (error) throw new Error(error.message || error.code || 'RPC failed');
      await refresh();
      return (data ?? { ok: false }) as { ok: boolean; code?: string; token?: string; label?: string };
    },
    [refresh]
  );

  const setWinnersAction = useCallback(
    async (selections: Array<{ group_id: string; position: 1 | 2 | 3; prize_amount: number }>) => {
      try {
        const result = await rpc('set_winner_selection', { p_selections: selections });
        await refresh();
        return result.ok
          ? { ok: true, message: 'Winner selection saved (still hidden from students).' }
          : { ok: false, message: 'Could not save selection.' };
      } catch {
        // The unique constraints reject a duplicate group or position.
        return { ok: false, message: 'Each team and each position may appear only once.' };
      }
    },
    [refresh]
  );

  const revealWinnersAction = useCallback(async () => {
    const result = await rpc('reveal_winners');
    await refresh();
    if (result.ok) return { ok: true, message: 'Winners revealed to everyone.' };
    return {
      ok: false,
      message:
        result.code === 'NO_SELECTION'
          ? 'Choose the three winning teams first.'
          : result.code === 'ALREADY_REVEALED'
            ? 'Winners have already been revealed.'
            : 'Could not reveal winners.',
    };
  }, [refresh]);

  const assignedIds = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));
  const unassigned = participants.filter((p) => p.status === 'active' && !assignedIds.has(p.id));

  return (
    <AdminContext.Provider
      value={{
        ready,
        signedIn,
        isAdmin,
        me,
        authError,
        game,
        participants,
        groups,
        hints,
        checkpoints,
        helpRequests,
        winners,
        admins,
        auditLogs,
        unassigned,
        preview,
        signIn,
        signOut,
        setGameStatus,
        previewTeams,
        clearPreview,
        publishTeams,
        assignLateParticipants,
        resetTeams,
        resetGame,
        sendNotification,
        answerHelp,
        saveHint,
        setHintPublished,
        issueCode,
        setWinners: setWinnersAction,
        revealWinners: revealWinnersAction,
        refresh,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export function useAdmin(): AdminState {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside an AdminProvider');
  return ctx;
}
