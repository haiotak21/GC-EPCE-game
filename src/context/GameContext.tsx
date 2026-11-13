import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  GameStatus,
  Participant,
  Group,
  ClueStage,
  Checkpoint,
  CheckpointAttempt,
  GroupStageProgress,
  HelpRequest,
  Notification,
  GameResult,
  AdminUser,
  AdminAuditLog,
  GameSettings,
  HelpCategory,
} from '../types';
import {
  HuntStore,
  getInitialStore,
  saveStore,
  calculateFairGroups,
  getActiveClueForGroup,
  DEFAULT_SETTINGS,
} from '../lib/store';
import { Language, translations } from '../lib/i18n';
import confetti from 'canvas-confetti';

interface GameContextType {
  // Global State
  store: HuntStore;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (typeof translations)[keyof typeof translations];
  
  // Current active user simulation
  currentRole: 'student' | 'admin';
  setCurrentRole: (role: 'student' | 'admin') => void;
  currentParticipant: Participant | null;
  setCurrentParticipant: (p: Participant | null) => void;
  currentAdmin: AdminUser | null;
  setCurrentAdmin: (a: AdminUser | null) => void;
  myGroup: Group | null;
  myTeammates: Participant[];

  // Actions - Participant
  registerStudent: (fullName: string) => { participant: Participant; recoveryCode: string };
  recoverSession: (recoveryCode: string) => boolean;
  updateTeamName: (groupId: string, newName: string) => boolean;
  verifyCheckpoint: (codeOrQr: string, stageNum?: 1 | 2 | 3 | 4) => { success: boolean; message: string; stage?: number };
  submitHelpRequest: (category: HelpCategory, message: string) => { success: boolean; message: string };
  markNotificationRead: (notificationId: string) => void;

  // Actions - Admin
  updateGameStatus: (newStatus: GameStatus, reason?: string) => void;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
  previewShuffle: () => { groups: { number: number; memberIds: string[] }[]; pendingExceptions: string[] };
  confirmPublishTeams: () => void;
  alignTeamsDirectly: () => void;
  cancelPreviewShuffle: () => void;
  reassignMember: (participantId: string, targetGroupId: string, reason: string) => void;
  removeParticipant: (participantId: string, reason: string) => void;
  reinstateParticipant: (participantId: string) => void;
  releaseClue: (stage: 1 | 2 | 3 | 4) => void;
  updateClueDraft: (clue: ClueStage) => void;
  sendNotification: (data: {
    titleAmharic: string;
    titleEnglish: string;
    bodyAmharic: string;
    bodyEnglish: string;
    type: 'hint' | 'team' | 'announcement' | 'safety';
    priority: 'normal' | 'urgent';
    targetType: 'all' | 'groups' | 'users' | 'unassigned';
    targetIds?: string[];
  }) => void;
  replyToHelpRequest: (requestId: string, replyText: string) => void;
  resolveHelpRequest: (requestId: string) => void;
  publishWinners: (winners: { rank: 1 | 2 | 3; groupId: string; prizeEtb: number }[]) => void;
  triggerCelebration: () => void;
  resetAllData: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [store, setStoreState] = useState<HuntStore>(getInitialStore);
  const [language, setLanguage] = useState<Language>('en');
  const [currentRole, setCurrentRole] = useState<'student' | 'admin'>('student');
  const [currentParticipantId, setCurrentParticipantId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gc_active_student_id');
      if (saved) return saved;
    }
    return '';
  });
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string>('organizer1@hunt.gc');

  // Sync state to local storage and dispatch broadcast
  const updateStore = useCallback((updater: (prev: HuntStore) => HuntStore) => {
    setStoreState((prev) => {
      const next = updater(prev);
      saveStore(next);
      return next;
    });
  }, []);

  // Multi-tab broadcast channel listener
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gc_mystery_hunt_store_v1' && e.newValue) {
        try {
          setStoreState(JSON.parse(e.newValue));
        } catch (err) {
          console.error(err);
        }
      }
    };

    let bc: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel('gc_mystery_hunt_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'STORE_UPDATED') {
          setStoreState(getInitialStore());
        }
      };
    }

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, []);

  // Derived user entities
  const currentParticipant = store.participants.find((p) => p.id === currentParticipantId) || null;
  const currentAdmin = store.admins.find((a) => a.email === currentAdminEmail) || null;
  const myGroup = currentParticipant?.assignedGroupId
    ? store.groups.find((g) => g.id === currentParticipant.assignedGroupId) || null
    : null;
  const myTeammates = myGroup
    ? store.participants.filter((p) => myGroup.memberIds.includes(p.id))
    : [];

  const triggerCelebration = useCallback(() => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
      });
    } catch (e) {
      console.warn('Confetti unavailable:', e);
    }
  }, []);

  // Student Actions
  const registerStudent = (fullName: string) => {
    const cleanName = fullName.trim();
    const id = `p-${Date.now()}`;
    const code = `REC-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;
    const newParticipant: Participant = {
      id,
      authUserId: `auth-${id}`,
      displayName: cleanName,
      registeredAt: new Date().toISOString(),
      recoveryCode: code,
      status: 'active',
    };

    updateStore((prev) => ({
      ...prev,
      participants: [...prev.participants, newParticipant],
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: 'system',
          event: 'STUDENT_REGISTERED',
          target: cleanName,
          afterSummary: `Participant ID: ${id}, Code: ${code}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));

    if (typeof window !== 'undefined') {
      localStorage.setItem('gc_active_student_id', id);
    }

    setCurrentParticipantId(id);
    return { participant: newParticipant, recoveryCode: code };
  };

  const recoverSession = (recoveryCode: string): boolean => {
    const clean = recoveryCode.trim().toUpperCase();
    const found = store.participants.find((p) => p.recoveryCode.toUpperCase() === clean);
    if (found) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('gc_active_student_id', found.id);
      }
      setCurrentParticipantId(found.id);
      return true;
    }
    return false;
  };

  const updateTeamName = (groupId: string, newName: string): boolean => {
    const clean = newName.trim();
    if (!clean) return false;
    updateStore((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, teamName: clean, customNameSet: true } : g)),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentParticipant?.displayName || 'student',
          event: 'TEAM_NAME_UPDATED',
          target: `Group ${groupId}`,
          afterSummary: `New name: ${clean}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
    return true;
  };

  const verifyCheckpoint = (
    codeOrQr: string,
    targetStage?: 1 | 2 | 3 | 4
  ): { success: boolean; message: string; stage?: number } => {
    if (!myGroup) {
      return { success: false, message: 'No published team found for your account.' };
    }
    if (store.gameStatus === 'PAUSED') {
      return { success: false, message: 'Game is currently paused by organizers.' };
    }
    if (store.gameStatus !== 'IN_PROGRESS') {
      return { success: false, message: 'Game is not currently active.' };
    }

    const cleanInput = codeOrQr.trim().toUpperCase();
    const matchedCheckpoint = store.checkpoints.find(
      (c) =>
        (c.shortCode.toUpperCase() === cleanInput || c.qrCodeValue.toUpperCase() === cleanInput) &&
        c.status === 'active'
    );

    if (!matchedCheckpoint) {
      // Record failed attempt
      const attempt: CheckpointAttempt = {
        id: `att-${Date.now()}`,
        checkpointId: 'unknown',
        groupId: myGroup.id,
        stage: (targetStage || 1) as 1 | 2 | 3 | 4,
        participantId: currentParticipant?.id || 'unknown',
        participantName: currentParticipant?.displayName || 'Anonymous',
        codeEntered: codeOrQr,
        result: 'invalid_code',
        createdAt: new Date().toISOString(),
        note: 'Code did not match any active checkpoint',
      };
      updateStore((prev) => ({ ...prev, attempts: [attempt, ...prev.attempts] }));
      return { success: false, message: language === 'am' ? 'የተሳሳተ ኮድ ነው። እባክዎ ፍንጩን ደግመው ያንብቡ።' : 'Invalid checkpoint code or QR.' };
    }

    const stage = matchedCheckpoint.stage;

    // Check if already completed
    const alreadyDone = store.progress.some((p) => p.groupId === myGroup.id && p.stage === stage);
    if (alreadyDone) {
      return {
        success: false,
        message: language === 'am' ? 'ይህ ደረጃ ቀደም ሲል በቡድንዎ ተረጋግጧል!' : 'This stage has already been completed by your squad!',
        stage,
      };
    }

    // Enforce stage order: Stage N requires Stage N-1
    if (stage > 1) {
      const priorStageDone = store.progress.some((p) => p.groupId === myGroup.id && p.stage === stage - 1);
      if (!priorStageDone) {
        return {
          success: false,
          message:
            language === 'am'
              ? `እባክዎ መጀመሪያ ደረጃ ${stage - 1}ን ያረጋግጡ። ደረጃዎችን መዝለል አይፈቀድም።`
              : `Must verify Stage ${stage - 1} first. Stage skipping is not permitted.`,
          stage,
        };
      }
    }

    // Success! Log attempt & add progress
    const newAttempt: CheckpointAttempt = {
      id: `att-${Date.now()}`,
      checkpointId: matchedCheckpoint.id,
      groupId: myGroup.id,
      stage,
      participantId: currentParticipant?.id || 'unknown',
      participantName: currentParticipant?.displayName || 'Anonymous',
      codeEntered: codeOrQr,
      result: 'success',
      createdAt: new Date().toISOString(),
    };

    const newProgress: GroupStageProgress = {
      groupId: myGroup.id,
      stage,
      verifiedAt: new Date().toISOString(),
      verifiedBy: cleanInput.startsWith('HUNT-') ? 'qr_scan' : 'manual_code',
      verifierName: currentParticipant?.displayName,
    };

    updateStore((prev) => {
      const updatedProgress = [...prev.progress, newProgress];
      const newNotifs: Notification[] = [];

      // If Stage < 4: Unlock next stage clue and show as pop-up
      if (stage < 4) {
        const nextStage = (stage + 1) as 1 | 2 | 3 | 4;
        const nextClue = getActiveClueForGroup(prev.clues, nextStage, myGroup.id);
        const teammateList = myTeammates.map((m) => m.displayName).join(', ');

        newNotifs.push({
          id: `notif-unlock-s${nextStage}-${Date.now()}`,
          gameId: 'game-2026',
          titleAmharic: `ደረጃ ${nextStage} ፍንጭ ተከፍቷል!`,
          titleEnglish: `Stage ${nextStage} Clue Unlocked!`,
          bodyAmharic: `${currentParticipant?.displayName || 'አንድ አባል'} ደረጃ ${stage}ን አረጋግጧል! አሁን ደረጃ ${nextStage} ለሙሉ ቡድኑ ተከፍቷል።\n\n${nextClue.titleEnglish || nextClue.titleAmharic}\n${nextClue.bodyEnglish || nextClue.bodyAmharic}\n\nእንቆቅልሽ፡ "${nextClue.riddleEnglish || nextClue.riddleAmharic || ''}"`,
          bodyEnglish: `${currentParticipant?.displayName || 'Teammate'} verified Stage ${stage}! Stage ${nextStage} is now unlocked for all ${myGroup.teamName} members (${teammateList}).\n\n${nextClue.titleEnglish}\n${nextClue.bodyEnglish}\n\nRiddle: "${nextClue.riddleEnglish || nextClue.riddleAmharic || ''}"\n\n(You can tap Cancel to close this modal; the clue remains visible on your home screen.)`,
          type: 'hint',
          priority: 'urgent',
          targetType: 'groups',
          targetIds: [myGroup.id],
          createdAt: new Date().toISOString(),
          createdBy: 'Campus Mystery System',
          readBy: [],
        });
      } else {
        // Stage 4: Squad has completed all 4 stages!
        const finishedGroupIds = Array.from(
          new Set(updatedProgress.filter((p) => p.stage === 4).map((p) => p.groupId))
        );
        const finishRank = finishedGroupIds.indexOf(myGroup.id) + 1;
        const rankSuffix =
          finishRank === 1 ? '1st' : finishRank === 2 ? '2nd' : finishRank === 3 ? '3rd' : `${finishRank}th`;

        const teammateList = myTeammates.map((m) => m.displayName).join(', ');

        // Finished modal for the completing squad
        newNotifs.push({
          id: `notif-finish-${myGroup.id}-${Date.now()}`,
          gameId: 'game-2026',
          titleAmharic: `እንኳን ደስ አላችሁ! ውድድሩን በ${rankSuffix} ደረጃ አጠናቃችኋል!`,
          titleEnglish: `Finished! You Finished in ${rankSuffix} Place!`,
          bodyAmharic: `ቡድን ${myGroup.number} (${myGroup.teamName}) 4ቱንም ደረጃዎች በተሳካ ሁኔታ አጠናቋል!\nአባላት፡ ${teammateList}\n\nሽልማታችሁን ለመቀበል ወደ ካምፓስ ዋና ስታዲየም የመጨረሻ መስመር (Grand Finish Line) ይሂዱ!`,
          bodyEnglish: `Congratulations ${myGroup.teamName}!\nYour squad verified all 4 mystery stages and crossed the finish line in ${rankSuffix} Place!\nTeammates: ${teammateList}\n\nProceed immediately to the Campus Grand Stadium North Bleachers Finish Line to meet the organizers and receive your team reward!`,
          type: 'announcement',
          priority: 'urgent',
          targetType: 'groups',
          targetIds: [myGroup.id],
          finishData: {
            groupId: myGroup.id,
            groupName: myGroup.teamName,
            rank: finishRank,
            memberNames: myTeammates.map((m) => m.displayName),
          },
          createdAt: new Date().toISOString(),
          createdBy: 'Lead Organizer',
          readBy: [],
        });

        // Broadcast alert to ALL other users on campus
        newNotifs.push({
          id: `notif-broadcast-finish-${myGroup.id}-${Date.now()}`,
          gameId: 'game-2026',
          titleAmharic: `ቡድን ${myGroup.number} በ${rankSuffix} ደረጃ ጨርሷል!`,
          titleEnglish: `${myGroup.teamName} Finished in ${rankSuffix} Place!`,
          bodyAmharic: `ቡድን ${myGroup.number} (${myGroup.teamName}) አጠናቋል! አባላት፡ ${teammateList}`,
          bodyEnglish: `${myGroup.teamName} has officially completed the hunt in ${rankSuffix} Place! Members: ${teammateList}.`,
          type: 'announcement',
          priority: 'urgent',
          targetType: 'all',
          createdAt: new Date().toISOString(),
          createdBy: 'Lead Organizer',
          readBy: [],
        });
      }

      return {
        ...prev,
        attempts: [newAttempt, ...prev.attempts],
        progress: updatedProgress,
        notifications: [...newNotifs, ...prev.notifications],
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            adminEmail: 'checkpoint-system',
            event: 'STAGE_VERIFIED',
            target: `Group ${myGroup.number}`,
            afterSummary: `Verified Stage ${stage} by ${currentParticipant?.displayName} at ${new Date().toLocaleTimeString()}`,
            timestamp: new Date().toISOString(),
          },
          ...prev.auditLogs,
        ],
      };
    });

    triggerCelebration();

    return {
      success: true,
      message:
        stage === 4
          ? `Congratulations! You have completed all 4 stages of the mystery hunt!`
          : `Stage ${stage} verified! Stage ${stage + 1} is now unlocked for your entire squad!`,
      stage,
    };
  };

  const submitHelpRequest = (
    category: HelpCategory,
    message: string
  ): { success: boolean; message: string } => {
    if (!myGroup) {
      return { success: false, message: 'You must belong to an active published team.' };
    }

    const teamRequests = store.helpRequests.filter((r) => r.groupId === myGroup.id);
    const standardHintRequests = teamRequests.filter((r) => r.category === 'stuck');

    // Emergency and safety issues are exempt from quota
    if (category === 'stuck' && standardHintRequests.length >= store.settings.maxHelpRequestsPerTeam) {
      return {
        success: false,
        message:
          language === 'am'
            ? 'ቡድንዎ የተፈቀደለትን የፍንጭ እርዳታ ኮታ ጨርሷል! የደህንነት ጥያቄዎች ግን ይስተናገዳሉ።'
            : 'Your team has reached the maximum hint assistance quota. Safety/urgent issues are still permitted.',
      };
    }

    const newReq: HelpRequest = {
      id: `help-${Date.now()}`,
      groupId: myGroup.id,
      participantId: currentParticipant?.id || 'unknown',
      participantName: currentParticipant?.displayName || 'Team Member',
      stage: 1, // calculate current stage
      category,
      message: message.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      replies: [],
    };

    updateStore((prev) => ({
      ...prev,
      helpRequests: [newReq, ...prev.helpRequests],
    }));

    return {
      success: true,
      message: language === 'am' ? 'የእርዳታ ጥያቄዎ ለአዘጋጆች ተልኳል!' : 'Assistance request dispatched to organizers!',
    };
  };

  const markNotificationRead = (notificationId: string) => {
    if (!currentParticipant) return;
    updateStore((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId && !n.readBy.includes(currentParticipant.id)
          ? { ...n, readBy: [...n.readBy, currentParticipant.id] }
          : n
      ),
    }));
  };

  // Admin Actions
  const updateGameStatus = (newStatus: GameStatus, reason?: string) => {
    updateStore((prev) => ({
      ...prev,
      gameStatus: newStatus,
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'STATUS_TRANSITION',
          target: 'Game Engine',
          beforeSummary: `Status: ${prev.gameStatus}`,
          afterSummary: `Status: ${newStatus}${reason ? ` (${reason})` : ''}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const updateSettings = (newSettings: Partial<GameSettings>) => {
    updateStore((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'SETTINGS_UPDATED',
          target: 'Game Settings',
          afterSummary: JSON.stringify(newSettings),
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const previewShuffle = () => {
    const unassignedEligible = store.participants
      .filter((p) => p.status === 'active')
      .map((p) => p.id);
    const { groups, pendingExceptions } = calculateFairGroups(unassignedEligible);

    updateStore((prev) => ({
      ...prev,
      previewGroups: groups,
    }));

    return { groups, pendingExceptions };
  };

  const cancelPreviewShuffle = () => {
    updateStore((prev) => ({ ...prev, previewGroups: null }));
  };

  const confirmPublishTeams = () => {
    if (!store.previewGroups || store.previewGroups.length === 0) return;

    const publishedGroups: Group[] = store.previewGroups.map((pg) => {
      const existing = store.groups.find((g) => g.number === pg.number);
      const chosenCaptainId = pg.memberIds[Math.floor(Math.random() * pg.memberIds.length)];
      return {
        id: `grp-${pg.number}`,
        gameId: 'game-2026',
        number: pg.number,
        teamName: existing?.customNameSet ? existing.teamName : `Group ${pg.number}`,
        customNameSet: !!existing?.customNameSet,
        publishedAt: new Date().toISOString(),
        memberIds: pg.memberIds,
        captainId: existing?.captainId || chosenCaptainId,
      };
    });

    const memberMap = new Map<string, string>();
    publishedGroups.forEach((g) => {
      g.memberIds.forEach((mId) => memberMap.set(mId, g.id));
    });

    const newTeamNotifs: Notification[] = publishedGroups.map((g) => {
      const memberNames = g.memberIds.map((mId) => {
        const p = store.participants.find((part) => part.id === mId);
        return p ? p.displayName : mId;
      });
      const captainObj = store.participants.find((p) => p.id === g.captainId);
      const captainName = captainObj ? captainObj.displayName : memberNames[0] || 'Team Leader';

      return {
        id: `notif-reveal-${g.id}-${Date.now()}`,
        gameId: 'game-2026',
        titleAmharic: `የቡድን ምደባ፡ ${g.teamName}`,
        titleEnglish: `Teams Aligned! You are in ${g.teamName}`,
        bodyAmharic: `የቡድን አባላቶችዎ፡ ${memberNames.join(', ')}\nየቡድን ስም መሪ፡ ${captainName}`,
        bodyEnglish: `Your Squad: ${g.teamName}\nTeammates: ${memberNames.join(', ')}\nDesignated Naming Leader: ${captainName}`,
        type: 'team' as const,
        priority: 'urgent' as const,
        targetType: 'groups' as const,
        targetIds: [g.id],
        teamRevealData: {
          groupId: g.id,
          groupName: g.teamName,
          memberNames,
          captainId: g.captainId,
          captainName,
        },
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin?.displayName || 'Lead Organizer',
        readBy: [],
      };
    });

    updateStore((prev) => ({
      ...prev,
      groups: publishedGroups,
      previewGroups: null,
      gameStatus: prev.gameStatus === 'REGISTRATION_CLOSED' ? 'TEAMS_PUBLISHED' : prev.gameStatus,
      participants: prev.participants.map((p) =>
        memberMap.has(p.id) ? { ...p, assignedGroupId: memberMap.get(p.id) } : p
      ),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'TEAMS_PUBLISHED',
          target: `${publishedGroups.length} Groups`,
          afterSummary: `Assigned ${memberMap.size} participants`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
      notifications: [...newTeamNotifs, ...prev.notifications],
    }));

    triggerCelebration();
  };

  const alignTeamsDirectly = () => {
    const unassignedEligible = store.participants
      .filter((p) => p.status === 'active')
      .map((p) => p.id);

    const { groups: calculatedGroups } = calculateFairGroups(unassignedEligible);

    const publishedGroups: Group[] = calculatedGroups.map((pg) => {
      const existing = store.groups.find((g) => g.number === pg.number);
      const chosenCaptainId = pg.memberIds[Math.floor(Math.random() * pg.memberIds.length)];
      return {
        id: `grp-${pg.number}`,
        gameId: 'game-2026',
        number: pg.number,
        teamName: existing?.customNameSet ? existing.teamName : `Group ${pg.number}`,
        customNameSet: !!existing?.customNameSet,
        publishedAt: new Date().toISOString(),
        memberIds: pg.memberIds,
        captainId: existing?.captainId || chosenCaptainId,
      };
    });

    const memberMap = new Map<string, string>();
    publishedGroups.forEach((g) => {
      g.memberIds.forEach((mId) => memberMap.set(mId, g.id));
    });

    const newTeamNotifs: Notification[] = publishedGroups.map((g) => {
      const memberNames = g.memberIds.map((mId) => {
        const p = store.participants.find((part) => part.id === mId);
        return p ? p.displayName : mId;
      });
      const captainObj = store.participants.find((p) => p.id === g.captainId);
      const captainName = captainObj ? captainObj.displayName : memberNames[0] || 'Team Leader';

      return {
        id: `notif-reveal-${g.id}-${Date.now()}`,
        gameId: 'game-2026',
        titleAmharic: `የቡድን ምደባ፡ ${g.teamName}`,
        titleEnglish: `Teams Aligned! You are in ${g.teamName}`,
        bodyAmharic: `የቡድን አባላቶችዎ፡ ${memberNames.join(', ')}\nየቡድን ስም መሪ፡ ${captainName}`,
        bodyEnglish: `Your Squad: ${g.teamName}\nTeammates: ${memberNames.join(', ')}\nDesignated Naming Leader: ${captainName}`,
        type: 'team' as const,
        priority: 'urgent' as const,
        targetType: 'groups' as const,
        targetIds: [g.id],
        teamRevealData: {
          groupId: g.id,
          groupName: g.teamName,
          memberNames,
          captainId: g.captainId,
          captainName,
        },
        createdAt: new Date().toISOString(),
        createdBy: currentAdmin?.displayName || 'Lead Organizer',
        readBy: [],
      };
    });

    updateStore((prev) => ({
      ...prev,
      groups: publishedGroups,
      previewGroups: null,
      gameStatus: 'TEAMS_PUBLISHED',
      participants: prev.participants.map((p) =>
        memberMap.has(p.id) ? { ...p, assignedGroupId: memberMap.get(p.id) } : p
      ),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'TEAMS_ALIGNED',
          target: `${publishedGroups.length} Squads`,
          afterSummary: `Aligned ${memberMap.size} students into squads of max 3 (remainder 2 as team of 2; remainder 1 as 4-player team)`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
      notifications: [...newTeamNotifs, ...prev.notifications],
    }));

    triggerCelebration();
  };

  const reassignMember = (participantId: string, targetGroupId: string, reason: string) => {
    updateStore((prev) => {
      const updatedGroups = prev.groups.map((g) => {
        const withoutMember = g.memberIds.filter((m) => m !== participantId);
        if (g.id === targetGroupId) {
          return { ...g, memberIds: [...withoutMember, participantId] };
        }
        return { ...g, memberIds: withoutMember };
      });

      return {
        ...prev,
        groups: updatedGroups,
        participants: prev.participants.map((p) =>
          p.id === participantId ? { ...p, assignedGroupId: targetGroupId } : p
        ),
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            adminEmail: currentAdmin?.email || 'admin',
            event: 'MEMBER_REASSIGNED',
            target: participantId,
            beforeSummary: `Moved to Group ${targetGroupId}`,
            afterSummary: `Reason: ${reason}`,
            timestamp: new Date().toISOString(),
          },
          ...prev.auditLogs,
        ],
      };
    });
  };

  const removeParticipant = (participantId: string, reason: string) => {
    updateStore((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId ? { ...p, status: 'removed' } : p
      ),
      groups: prev.groups.map((g) => ({
        ...g,
        memberIds: g.memberIds.filter((m) => m !== participantId),
      })),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'PARTICIPANT_REMOVED',
          target: participantId,
          afterSummary: `Reason: ${reason}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const reinstateParticipant = (participantId: string) => {
    updateStore((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId ? { ...p, status: 'active' } : p
      ),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'PARTICIPANT_REINSTATED',
          target: participantId,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const releaseClue = (stage: 1 | 2 | 3 | 4) => {
    updateStore((prev) => ({
      ...prev,
      clues: prev.clues.map((c) =>
        c.stage === stage ? { ...c, status: 'published', releasedAt: new Date().toISOString() } : c
      ),
      notifications: [
        {
          id: `notif-${Date.now()}`,
          gameId: 'game-2026',
          titleAmharic: `ደረጃ ${stage} ፍንጭ ይፋ ተደረገ!`,
          titleEnglish: `Stage ${stage} clue is now released!`,
          bodyAmharic: `አዘጋጆች ደረጃ ${stage}ን ለቀዋል። ወደ ፍንጮች ገጽ በመሄድ እንቆቅልሹን ይፍቱ!`,
          bodyEnglish: `Organizers have published Stage ${stage}. Decipher the mystery on your hints timeline.`,
          type: 'hint',
          priority: 'urgent',
          targetType: 'all',
          createdAt: new Date().toISOString(),
          createdBy: currentAdmin?.displayName || 'Clue Master',
          readBy: [],
        },
        ...prev.notifications,
      ],
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'CLUE_RELEASED',
          target: `Stage ${stage}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const updateClueDraft = (clue: ClueStage) => {
    updateStore((prev) => ({
      ...prev,
      clues: prev.clues.map((c) => (c.stage === clue.stage ? clue : c)),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'CLUE_DRAFT_UPDATED',
          target: `Stage ${clue.stage}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const sendNotification = (data: {
    titleAmharic: string;
    titleEnglish: string;
    bodyAmharic: string;
    bodyEnglish: string;
    type: 'hint' | 'team' | 'announcement' | 'safety';
    priority: 'normal' | 'urgent';
    targetType: 'all' | 'groups' | 'users' | 'unassigned';
    targetIds?: string[];
  }) => {
    const notif: Notification = {
      id: `notif-${Date.now()}`,
      gameId: 'game-2026',
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: currentAdmin?.displayName || 'Organizer',
      readBy: [],
    };

    updateStore((prev) => ({
      ...prev,
      notifications: [notif, ...prev.notifications],
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'BROADCAST_SENT',
          target: `${data.targetType}: ${data.titleEnglish}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const replyToHelpRequest = (requestId: string, replyText: string) => {
    const clean = replyText.trim();
    if (!clean) return;

    updateStore((prev) => ({
      ...prev,
      helpRequests: prev.helpRequests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'answered',
              replies: [
                ...r.replies,
                {
                  id: `reply-${Date.now()}`,
                  senderId: currentAdmin?.id || 'admin',
                  senderName: currentAdmin?.displayName || 'Organizer',
                  isAdmin: true,
                  body: clean,
                  sentAt: new Date().toISOString(),
                },
              ],
            }
          : r
      ),
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          adminEmail: currentAdmin?.email || 'admin',
          event: 'HELP_REPLIED',
          target: requestId,
          timestamp: new Date().toISOString(),
        },
        ...prev.auditLogs,
      ],
    }));
  };

  const resolveHelpRequest = (requestId: string) => {
    updateStore((prev) => ({
      ...prev,
      helpRequests: prev.helpRequests.map((r) =>
        r.id === requestId ? { ...r, status: 'resolved' } : r
      ),
    }));
  };

  const publishWinners = (winners: { rank: 1 | 2 | 3; groupId: string; prizeEtb: number }[]) => {
    updateStore((prev) => {
      const g1 = prev.groups.find((g) => g.id === winners.find((w) => w.rank === 1)?.groupId);
      const g2 = prev.groups.find((g) => g.id === winners.find((w) => w.rank === 2)?.groupId);
      const g3 = prev.groups.find((g) => g.id === winners.find((w) => w.rank === 3)?.groupId);

      const getMemberNames = (g?: Group): string[] => {
        if (!g) return [];
        return g.memberIds
          .map((id) => prev.participants.find((p) => p.id === id)?.displayName)
          .filter(Boolean) as string[];
      };

      const m1 = getMemberNames(g1);
      const m2 = getMemberNames(g2);
      const m3 = getMemberNames(g3);

      const g1Name = g1?.teamName || 'Group 1';
      const g2Name = g2?.teamName || 'Group 2';
      const g3Name = g3?.teamName || 'Group 3';

      const p1 = winners.find((w) => w.rank === 1)?.prizeEtb || prev.settings.firstPrizeEtb;
      const p2 = winners.find((w) => w.rank === 2)?.prizeEtb || prev.settings.secondPrizeEtb;
      const p3 = winners.find((w) => w.rank === 3)?.prizeEtb || prev.settings.thirdPrizeEtb;

      const bodyEng = `Official Winners Announcement!\n\n🏆 1st Place Champions: ${g1Name} (Members: ${m1.join(', ')}) · Prize: ${p1.toLocaleString()} ETB\n🥈 2nd Place: ${g2Name} (Members: ${m2.join(', ')}) · Prize: ${p2.toLocaleString()} ETB\n🥉 3rd Place: ${g3Name} (Members: ${m3.join(', ')}) · Prize: ${p3.toLocaleString()} ETB\n\nAll participants please assemble at the Campus Grand Stadium North Bleachers for the victory ceremony and prizes!`;
      const bodyAmh = `ይፋዊ የአሸናፊዎች ማስታወቂያ!\n\n🏆 1ኛ ደረጃ አሸናፊ፡ ${g1Name} (አባላት፡ ${m1.join(', ')}) · ሽልማት፡ ${p1.toLocaleString()} ብር\n🥈 2ኛ ደረጃ፡ ${g2Name} (አባላት፡ ${m2.join(', ')}) · ሽልማት፡ ${p2.toLocaleString()} ብር\n🥉 3ኛ ደረጃ፡ ${g3Name} (አባላት፡ ${m3.join(', ')}) · ሽልማት፡ ${p3.toLocaleString()} ብር\n\nሁሉም ተሳታፊዎች ለሽልማት አሰጣጥ ሥነ ሥርዓት ወደ ካምፓስ ዋና ስታዲየም ይምጡ!`;

      return {
        ...prev,
        gameStatus: 'WINNERS_REVEALED',
        result: {
          id: `res-${Date.now()}`,
          gameId: 'game-2026',
          status: 'published',
          publishedAt: new Date().toISOString(),
          revision: prev.result.revision + 1,
          winners,
          congratulationAmharic: prev.result.congratulationAmharic,
          congratulationEnglish: prev.result.congratulationEnglish,
        },
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            adminEmail: currentAdmin?.email || 'admin',
            event: 'WINNERS_REVEALED',
            target: `1st: ${g1Name}`,
            timestamp: new Date().toISOString(),
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif-winners-revealed-${Date.now()}`,
            gameId: 'game-2026',
            titleAmharic: `🏆 ${g1Name} የውድድሩ አሸናፊ ሆኗል!`,
            titleEnglish: `🏆 ${g1Name} Won the Mystery Hunt!`,
            bodyAmharic: bodyAmh,
            bodyEnglish: bodyEng,
            type: 'announcement',
            priority: 'urgent',
            targetType: 'all',
            winnerData: {
              firstPlace: { groupName: g1Name, memberNames: m1, prizeEtb: p1 },
              secondPlace: { groupName: g2Name, memberNames: m2, prizeEtb: p2 },
              thirdPlace: { groupName: g3Name, memberNames: m3, prizeEtb: p3 },
            },
            createdAt: new Date().toISOString(),
            createdBy: currentAdmin?.displayName || 'Lead Organizer',
            readBy: [],
          },
          ...prev.notifications,
        ],
      };
    });

    triggerCelebration();
  };

  const resetAllData = () => {
    localStorage.removeItem('gc_mystery_hunt_store_v1');
    localStorage.removeItem('gc_active_student_id');
    setCurrentParticipantId('');
    const fresh = getInitialStore();
    setStoreState(fresh);
  };

  const t = translations[language];

  return (
    <GameContext.Provider
      value={{
        store,
        language,
        setLanguage,
        t,
        currentRole,
        setCurrentRole,
        currentParticipant,
        setCurrentParticipant: (p) => setCurrentParticipantId(p ? p.id : ''),
        currentAdmin,
        setCurrentAdmin: (a) => setCurrentAdminEmail(a ? a.email : ''),
        myGroup,
        myTeammates,
        registerStudent,
        recoverSession,
        updateTeamName,
        verifyCheckpoint,
        submitHelpRequest,
        markNotificationRead,
        updateGameStatus,
        updateSettings,
        previewShuffle,
        confirmPublishTeams,
        alignTeamsDirectly,
        cancelPreviewShuffle,
        reassignMember,
        removeParticipant,
        reinstateParticipant,
        releaseClue,
        updateClueDraft,
        sendNotification,
        replyToHelpRequest,
        resolveHelpRequest,
        publishWinners,
        triggerCelebration,
        resetAllData,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
