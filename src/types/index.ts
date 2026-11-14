/**
 * Core domain types for Game for power unity!
 * (የGC የካምፓስ ሚስጥር ፍለጋ)
 */

export type GameStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'TEAMS_PUBLISHED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'FINISHED'
  | 'WINNERS_REVEALED';

export interface Participant {
  id: string;
  authUserId: string;
  displayName: string;
  registeredAt: string;
  recoveryCode: string;
  status: 'active' | 'removed';
  assignedGroupId?: string;
}

export interface Group {
  id: string;
  gameId: string;
  number: number;
  teamName: string;
  customNameSet: boolean;
  publishedAt: string;
  memberIds: string[];
  captainId?: string; // Randomly designated group member allowed to rename squad
}

export type MediaType = 'text' | 'image' | 'audio' | 'riddle' | 'pdf';

export interface ClueStage {
  id: string;
  stage: 1 | 2 | 3 | 4;
  titleAmharic: string;
  titleEnglish: string;
  locationPlaceholder: string;
  bodyAmharic: string;
  bodyEnglish: string;
  riddleAmharic?: string;
  riddleEnglish?: string;
  codedCipher?: string;
  mediaType: MediaType;
  mediaUrl?: string;
  attachedPdfUrl?: string;
  attachedAudioUrl?: string;
  attachmentName?: string;
  transcriptAmharic?: string;
  transcriptEnglish?: string;
  status: 'draft' | 'published';
  releasedAt?: string;
  targetType: 'all' | 'specific_groups';
  targetGroupIds?: string[];
  targetGroupId?: string; // Specific group this clue is tailored for
  organizerAddenda?: string[];
}

export interface Checkpoint {
  id: string;
  stage: 1 | 2 | 3 | 4;
  locationLabel: string;
  shortCode: string;
  qrCodeValue: string;
  status: 'active' | 'revoked';
  isRotating: boolean;
  scanWindowMinutes?: number;
}

export interface CheckpointAttempt {
  id: string;
  checkpointId: string;
  groupId: string;
  stage: 1 | 2 | 3 | 4;
  participantId: string;
  participantName: string;
  codeEntered: string;
  result: 'success' | 'already_completed' | 'invalid_order' | 'expired' | 'invalid_code';
  createdAt: string;
  note?: string;
}

export interface GroupStageProgress {
  groupId: string;
  stage: 1 | 2 | 3 | 4;
  verifiedAt: string;
  verifiedBy: 'qr_scan' | 'manual_code' | 'organizer_override';
  verifierName?: string;
}

export type HelpCategory = 'stuck' | 'qr_issue' | 'accessibility' | 'safety';

export interface HelpMessage {
  id: string;
  senderId: string;
  senderName: string;
  isAdmin: boolean;
  body: string;
  sentAt: string;
}

export interface HelpRequest {
  id: string;
  groupId: string;
  participantId: string;
  participantName: string;
  stage: 1 | 2 | 3 | 4;
  category: HelpCategory;
  message: string;
  status: 'pending' | 'answered' | 'resolved';
  createdAt: string;
  replies: HelpMessage[];
}

export type NotificationType = 'hint' | 'team' | 'announcement' | 'safety';

export interface Notification {
  id: string;
  gameId: string;
  titleAmharic: string;
  titleEnglish: string;
  bodyAmharic: string;
  bodyEnglish: string;
  type: NotificationType;
  priority: 'normal' | 'urgent';
  targetType: 'all' | 'groups' | 'users' | 'unassigned';
  targetIds?: string[];
  createdAt: string;
  createdBy: string;
  readBy: string[]; // participantIds
  teamRevealData?: {
    groupId: string;
    groupName: string;
    memberNames: string[];
    captainId?: string;
    captainName?: string;
  };
  finishData?: {
    groupId: string;
    groupName: string;
    rank: number;
    memberNames: string[];
  };
  winnerData?: {
    firstPlace: { groupName: string; memberNames: string[]; prizeEtb: number };
    secondPlace: { groupName: string; memberNames: string[]; prizeEtb: number };
    thirdPlace: { groupName: string; memberNames: string[]; prizeEtb: number };
  };
}

export interface WinnerPlace {
  rank: 1 | 2 | 3;
  groupId: string;
  prizeEtb: number;
}

export interface GameResult {
  id: string;
  gameId: string;
  status: 'draft' | 'published';
  publishedAt?: string;
  revision: number;
  winners: WinnerPlace[];
  congratulationAmharic: string;
  congratulationEnglish: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'lead_organizer' | 'clue_master' | 'safety_marshal';
  active: boolean;
}

export interface AdminAuditLog {
  id: string;
  adminEmail: string;
  event: string;
  target: string;
  beforeSummary?: string;
  afterSummary?: string;
  timestamp: string;
}

export interface GameSettings {
  title: string;
  firstPrizeEtb: number;
  secondPrizeEtb: number;
  thirdPrizeEtb: number;
  maxTeamSize: number;
  maxHelpRequestsPerTeam: number;
  prizeSharingRule: string;
  tieBreakingRule: string;
  campusSafetyNotes: string;
  languageDefault: 'am' | 'en';
}
