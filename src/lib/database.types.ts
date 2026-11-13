/**
 * Types mirroring the Supabase schema in supabase/migrations.
 *
 * Framework-agnostic on purpose — these are valid whether the frontend stays
 * on Vite or moves to Next.js.
 *
 * Once the Supabase project exists you can regenerate the table types with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 * The RpcResults block at the bottom is hand-written either way, because the
 * generator types every RPC return as `Json`.
 */

// -----------------------------------------------------------------------------
// Enums (§15 game states, and the rest from 0001_schema.sql)
// -----------------------------------------------------------------------------

export type GameStatus =
  | 'REGISTRATION'
  | 'WAITING'
  | 'TEAMS_PUBLISHED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'FINISHED'
  | 'WINNERS_REVEALED';

export type ParticipantStatus = 'active' | 'removed';

export type AdminRole = 'lead_organizer' | 'clue_master' | 'safety_marshal';

export type NotificationType =
  | 'announcement'
  | 'team_assignment'
  | 'hint'
  | 'help_reply'
  | 'game_status'
  | 'winners';

export type NotificationAudience = 'everyone' | 'groups' | 'participants';

export type HelpRequestStatus = 'pending' | 'answered';

export type VerificationMethod = 'qr_scan' | 'organizer_code' | 'staff_override';

export type StageNumber = 1 | 2 | 3 | 4;

// -----------------------------------------------------------------------------
// Rows
// -----------------------------------------------------------------------------

export interface Game {
  id: string;
  title: string;
  status: GameStatus;
  registration_open: boolean;
  help_request_limit: number;
  max_group_size: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Participant {
  id: string;
  game_id: string;
  auth_user_id: string;
  full_name: string;
  status: ParticipantStatus;
  /** Last 4 characters only — the full code is never returned after registration. */
  recovery_code_hint: string;
  registered_at: string;
}

export interface Admin {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  game_id: string;
  group_number: number;
  group_name: string | null;
  /** Pass the value you last read back to set_group_name() to detect a concurrent rename. */
  name_version: number;
  published_at: string | null;
  created_at: string;
}

export interface GroupMember {
  id: string;
  game_id: string;
  group_id: string;
  participant_id: string;
  joined_at: string;
}

export interface Hint {
  id: string;
  game_id: string;
  /** null = a shared clue every team sees; otherwise that team number's clue. */
  group_number: number | null;
  hint_number: StageNumber;
  title: string;
  description: string | null;
  content: string | null;
  media_url: string | null;
  external_link: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Admin-only: RLS hides this table from students entirely. */
export interface Checkpoint {
  id: string;
  game_id: string;
  /** null = a shared sign every team uses; otherwise that team number's sign. */
  group_number: number | null;
  stage_number: StageNumber;
  location_label: string;
  requires_organizer_code: boolean;
  active: boolean;
  created_at: string;
}

export interface CheckpointVerification {
  id: string;
  game_id: string;
  group_id: string;
  checkpoint_id: string;
  verified_by: string;
  verified_at: string;
  verification_method: VerificationMethod;
}

export interface Notification {
  id: string;
  game_id: string;
  title: string;
  message: string;
  type: NotificationType;
  audience: NotificationAudience;
  media_url: string | null;
  payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface NotificationRecipient {
  id: string;
  notification_id: string;
  participant_id: string;
  read_at: string | null;
}

export interface HelpRequest {
  id: string;
  game_id: string;
  group_id: string;
  requested_by: string;
  stage_number: StageNumber;
  message: string | null;
  status: HelpRequestStatus;
  is_exempt: boolean;
  exempt_reason: string | null;
  admin_reply: string | null;
  answered_by: string | null;
  created_at: string;
  answered_at: string | null;
}

export interface Winner {
  id: string;
  game_id: string;
  group_id: string;
  position: 1 | 2 | 3;
  prize_amount: number;
  /** Null until the admin presses Reveal; RLS hides unrevealed rows from students. */
  revealed_at: string | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  game_id: string | null;
  admin_id: string | null;
  action: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// RPC results
//
// Every RPC returns { ok, code, ... }. `code` is the thing to branch on — it is
// a stable string, unlike an error message.
// -----------------------------------------------------------------------------

interface RpcBase {
  ok: boolean;
  code?: string;
}

export type RegisterResult = RpcBase &
  (
    | {
        ok: true;
        code: 'REGISTERED';
        participant_id: string;
        /** Shown to the student exactly once. Only its hash is stored. */
        recovery_code: string;
      }
    | { ok: true; code: 'ALREADY_REGISTERED'; participant_id: string; full_name: string }
    | { ok: false; code: 'NO_SESSION' | 'NAME_TOO_SHORT' | 'NO_GAME' | 'REGISTRATION_CLOSED' }
  );

export type RecoveryResult = RpcBase &
  (
    | { ok: true; code: 'RECOVERED'; participant_id: string; full_name: string }
    | { ok: false; code: 'NO_SESSION' | 'INVALID_CODE' }
  );

export type PreviewAssignmentResult = RpcBase & {
  ok: true;
  groups: Array<{ group_number: number; participant_ids: string[] }>;
  /** §9.3: a lone leftover student is held back for the admin to place. */
  pending_participant_ids: string[];
};

export type PublishAssignmentResult = RpcBase &
  (
    | { ok: true; code: 'PUBLISHED'; groups_created: number }
    | { ok: false; code: 'NO_GAME' | 'ALREADY_PUBLISHED' | 'REGISTRATION_STILL_OPEN' }
  );

export type SetGroupNameResult = RpcBase &
  (
    | { ok: true; code: 'RENAMED'; version: number }
    | { ok: false; code: 'NOT_FOUND' }
    | {
        ok: false;
        code: 'VERSION_CONFLICT';
        current_name: string | null;
        current_version: number;
      }
  );

export type VerifyCheckpointResult = RpcBase &
  (
    | {
        ok: true;
        code: 'VERIFIED';
        stage: StageNumber;
        completed_stage: StageNumber;
        next_stage: StageNumber | null;
      }
    | { ok: true; code: 'ALREADY_VERIFIED'; stage: StageNumber; completed_stage?: number }
    // Deliberately carries no `stage`: naming the scanned checkpoint would
    // reveal where a later stage is (see migration 0015).
    | { ok: false; code: 'WRONG_STAGE'; expected_stage: number }
    | { ok: false; code: 'ORGANIZER_CODE_REQUIRED'; stage?: StageNumber }
    | { ok: false; code: 'OTHER_TEAM_CHECKPOINT' }
    | {
        ok: false;
        code: 'NO_SESSION' | 'NO_GROUP' | 'NO_GAME' | 'GAME_PAUSED' | 'GAME_NOT_ACTIVE' | 'INVALID_CODE';
      }
  );

export type HelpRequestResult = RpcBase &
  (
    | { ok: true; code: 'SUBMITTED'; request_id: string; remaining: number }
    | { ok: false; code: 'LIMIT_REACHED'; used: number; limit: number }
    | { ok: false; code: 'NO_SESSION' | 'NO_GROUP' | 'NO_GAME' }
  );

export type SendNotificationResult = RpcBase & {
  ok: true;
  notification_id: string;
  recipients: number;
};

export type RevealWinnersResult = RpcBase &
  (
    | { ok: true; code: 'REVEALED' }
    | { ok: false; code: 'NO_GAME' | 'NO_SELECTION' | 'ALREADY_REVEALED' }
  );

/** Signatures of every RPC the client may call. */
export interface RpcMap {
  register_participant: { args: { p_full_name: string }; returns: RegisterResult };
  redeem_recovery_code: { args: { p_code: string }; returns: RecoveryResult };
  verify_checkpoint: {
    args: { p_token: string; p_organizer_code?: string | null };
    returns: VerifyCheckpointResult;
  };
  create_help_request: {
    args: { p_message: string; p_stage?: number | null };
    returns: HelpRequestResult;
  };
  set_group_name: {
    args: { p_group_id: string; p_name: string; p_expected_version: number };
    returns: SetGroupNameResult;
  };
  mark_notification_read: { args: { p_notification_id: string }; returns: { ok: boolean } };

  // Admin only — each re-checks the caller server-side.
  preview_team_assignment: { args: Record<string, never>; returns: PreviewAssignmentResult };
  publish_team_assignment: {
    args: { p_groups: Array<{ group_number: number; participant_ids: string[] }> };
    returns: PublishAssignmentResult;
  };
  send_notification: {
    args: {
      p_title: string;
      p_message: string;
      p_type?: NotificationType;
      p_audience?: NotificationAudience;
      p_target_ids?: string[] | null;
      p_media_url?: string | null;
    };
    returns: SendNotificationResult;
  };
  answer_help_request: {
    args: { p_request_id: string; p_reply: string };
    returns: RpcBase & { code?: 'ANSWERED' | 'NOT_FOUND' };
  };
  set_winner_selection: {
    args: {
      p_selections: Array<{ group_id: string; position: 1 | 2 | 3; prize_amount: number }>;
    };
    returns: RpcBase & { code?: 'SAVED' | 'NO_GAME' | 'ALREADY_REVEALED' };
  };
  reveal_winners: { args: Record<string, never>; returns: RevealWinnersResult };
  set_game_status: { args: { p_status: GameStatus }; returns: RpcBase & { status?: GameStatus } };
}
