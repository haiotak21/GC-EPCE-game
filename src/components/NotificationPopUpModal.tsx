import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  Compass,
  AlertTriangle,
  Megaphone,
  Users,
  Trophy,
  CheckCircle2,
  Edit3,
  FileText,
  Volume2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { NotificationType } from '../types';
import { playMysteryAudioClue } from '../lib/store';

interface ModalItem {
  id: string;
  clueId?: string;
  title: string;
  body: string;
  type: NotificationType;
  isClue: boolean;
  stage?: 1 | 2 | 3 | 4;
  priority?: 'normal' | 'urgent';
  attachedPdfUrl?: string;
  attachedAudioUrl?: string;
  attachmentName?: string;
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
  createdAt: string;
}

export const NotificationPopUpModal: React.FC = () => {
  const { store, currentParticipant, markNotificationRead, updateTeamName } = useGame();

  // Track dismissed pop-up IDs in state and sessionStorage so they disappear on Cancel
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem('gc_dismissed_popups');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // State for team rename prompt after tapping Cancel on team reveal
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [customSquadName, setCustomSquadName] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Filter notifications for this participant
  const unacknowledgedNotifications = store.notifications.filter((n) => {
    if (dismissedIds.includes(n.id)) return false;
    // Check targetType
    if (n.targetType === 'groups' && n.targetIds) {
      if (!currentParticipant?.assignedGroupId || !n.targetIds.includes(currentParticipant.assignedGroupId)) {
        return false;
      }
    }
    return true;
  });

  // Collect published clues that haven't been dismissed
  const cluePopups: ModalItem[] = store.clues
    .filter((c) => c.status === 'published' && !dismissedIds.includes(`clue-popup-${c.id}`))
    .filter((c) => {
      // Check group-specific clue targeting
      if (c.targetGroupId && currentParticipant?.assignedGroupId) {
        return c.targetGroupId === currentParticipant.assignedGroupId;
      }
      return true;
    })
    .map((c) => ({
      id: `clue-popup-${c.id}`,
      clueId: c.id,
      title: c.titleEnglish || c.titleAmharic,
      body: c.riddleEnglish
        ? `${c.bodyEnglish || c.bodyAmharic}\n\nRiddle: "${c.riddleEnglish}"`
        : c.riddleAmharic
        ? `${c.bodyAmharic || c.bodyEnglish}\n\nእንቆቅልሽ፡ "${c.riddleAmharic}"`
        : c.bodyEnglish || c.bodyAmharic,
      type: 'hint',
      isClue: true,
      stage: c.stage,
      attachedPdfUrl: c.attachedPdfUrl,
      attachedAudioUrl: c.attachedAudioUrl,
      attachmentName: c.attachmentName,
      createdAt: c.releasedAt || new Date().toISOString(),
    }));

  const normalizedNotifications: ModalItem[] = unacknowledgedNotifications.map((n) => ({
    id: n.id,
    title: n.titleEnglish || n.titleAmharic,
    body: n.bodyEnglish || n.bodyAmharic,
    type: n.type,
    isClue: false,
    priority: n.priority,
    teamRevealData: n.teamRevealData,
    finishData: n.finishData,
    winnerData: n.winnerData,
    createdAt: n.createdAt,
  }));

  const allPopups: ModalItem[] = [...normalizedNotifications, ...cluePopups];
  const activePopup: ModalItem | null = allPopups[0] || null;

  const handleDismissCurrent = (popupId: string) => {
    const nextDismissed = [...dismissedIds, popupId];
    setDismissedIds(nextDismissed);
    try {
      sessionStorage.setItem('gc_dismissed_popups', JSON.stringify(nextDismissed));
    } catch (e) {
      console.warn(e);
    }

    if (currentParticipant && !popupId.startsWith('clue-popup-')) {
      markNotificationRead(popupId);
    }
  };

  const handleCancel = () => {
    if (!activePopup) return;

    // Check if this is a team reveal notification and if the user is the designated captain
    if (activePopup.teamRevealData && currentParticipant) {
      const isCaptain = currentParticipant.id === activePopup.teamRevealData.captainId;
      if (isCaptain) {
        // Prompt them to change the squad name or leave it
        setRenamingGroupId(activePopup.teamRevealData.groupId);
        setCustomSquadName(activePopup.teamRevealData.groupName || 'Group 1');
        return; // Don't dismiss yet, show the rename step
      }
    }

    handleDismissCurrent(activePopup.id);
  };

  const handleSaveCustomTeamName = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingGroupId && customSquadName.trim()) {
      updateTeamName(renamingGroupId, customSquadName.trim());
    }
    setRenamingGroupId(null);
    if (activePopup) {
      handleDismissCurrent(activePopup.id);
    }
  };

  const handleLeaveTeamNameAsIs = () => {
    setRenamingGroupId(null);
    if (activePopup) {
      handleDismissCurrent(activePopup.id);
    }
  };

  const handlePlayChime = async () => {
    setIsPlayingAudio(true);
    await playMysteryAudioClue();
    setIsPlayingAudio(false);
  };

  if (!activePopup && !renamingGroupId) return null;

  // Render Rename Squad Prompt if captain tapped Cancel on team reveal
  if (renamingGroupId) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      >
        <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full space-y-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-amber-400">
                Squad Naming Leader
              </span>
              <h2 className="text-base font-black text-white">Customize Your Squad Name</h2>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-2">
            <p>
              You were randomly chosen as your squad's naming leader! You can customize your squad name now, or leave it as <span className="text-amber-400 font-bold">{customSquadName}</span>.
            </p>
          </div>

          <form onSubmit={handleSaveCustomTeamName} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Squad Name
              </label>
              <input
                type="text"
                value={customSquadName}
                onChange={(e) => setCustomSquadName(e.target.value)}
                placeholder="e.g. Campus Lions, Code Solvers, or Group 1"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleLeaveTeamNameAsIs}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all border border-slate-700"
              >
                Leave as is
              </button>

              <button
                type="submit"
                disabled={!customSquadName.trim()}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Save Name</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!activePopup) return null;

  const isUrgent = 'priority' in activePopup && activePopup.priority === 'urgent';
  const isClue = activePopup.isClue;
  const isTeamReveal = !isClue && activePopup.type === 'team' && !!activePopup.teamRevealData;
  const isFinishPopup = !isClue && !!activePopup.finishData;
  const isWinnerPopup = !isClue && !!activePopup.winnerData;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full space-y-5 shadow-2xl relative overflow-hidden">
        {/* Top gold accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isWinnerPopup || isFinishPopup
                  ? 'bg-amber-400 text-slate-950 font-black'
                  : isClue
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : isUrgent
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              }`}
            >
              {isWinnerPopup || isFinishPopup ? (
                <Trophy className="w-5 h-5 text-slate-950" />
              ) : isClue ? (
                <Compass className="w-5 h-5 text-amber-400" />
              ) : activePopup.type === 'safety' ? (
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              ) : activePopup.type === 'team' ? (
                <Users className="w-5 h-5 text-indigo-400" />
              ) : (
                <Megaphone className="w-5 h-5 text-amber-400" />
              )}
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-amber-400">
                {isWinnerPopup
                  ? 'OFFICIAL WINNERS REVEALED'
                  : isFinishPopup
                  ? 'CONGRATULATIONS FINISH'
                  : isTeamReveal
                  ? 'TEAM REVEAL'
                  : isClue
                  ? `STAGE ${'stage' in activePopup ? activePopup.stage : 1} CLUE`
                  : activePopup.type.toUpperCase()}
              </span>
              <div className="text-[11px] text-slate-400 font-mono">
                {new Date(activePopup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {allPopups.length > 1 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {allPopups.length} updates
            </span>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-black text-white leading-snug">
            {activePopup.title}
          </h2>
        </div>

        {/* Team Reveal Teammates Cards */}
        {isTeamReveal && activePopup.teamRevealData && (
          <div className="bg-slate-950/90 rounded-2xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-400">Your Squad:</span>
              <span className="text-amber-400 font-black text-sm">{activePopup.teamRevealData.groupName}</span>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">Teammates:</div>
              <div className="flex flex-wrap gap-2">
                {activePopup.teamRevealData.memberNames.map((name, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-semibold text-slate-100 flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {activePopup.teamRevealData.captainName && (
              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
                <span>Naming Leader:</span>
                <span className="text-amber-300 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {activePopup.teamRevealData.captainName}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Finish Placement Card */}
        {isFinishPopup && activePopup.finishData && (
          <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 rounded-2xl p-4 border border-amber-500/40 space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs">
              <Trophy className="w-4 h-4" />
              <span>
                {activePopup.finishData.rank === 1
                  ? '1st Place Finish!'
                  : activePopup.finishData.rank === 2
                  ? '2nd Place Finish!'
                  : activePopup.finishData.rank === 3
                  ? '3rd Place Finish!'
                  : `${activePopup.finishData.rank}th Place Finished!`}
              </span>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed">
              Congratulations <span className="text-white font-bold">{activePopup.finishData.groupName}</span>! All 4 checkpoints verified!
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {activePopup.finishData.memberNames.map((name: string, i: number) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">
                  {name}
                </span>
              ))}
            </div>

            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
              Meet organizers at Campus Grand Stadium North Bleachers to claim your team prize!
            </div>
          </div>
        )}

        {/* Winners Broadcast Podium Card */}
        {isWinnerPopup && activePopup.winnerData && (
          <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 rounded-2xl p-4 border border-amber-500/40 space-y-3.5">
            <div className="flex items-center justify-center gap-2 text-amber-400 font-black text-sm">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Official Hunt Champions</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>

            {/* 1st Place */}
            <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-amber-300 flex items-center gap-1">
                  <span>🏆 1st Place:</span>
                  <span className="text-white font-bold">{activePopup.winnerData.firstPlace.groupName}</span>
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {activePopup.winnerData.firstPlace.prizeEtb.toLocaleString()} ETB
                </span>
              </div>
              <div className="text-[11px] text-slate-300">
                <span className="text-slate-400">Winning Members: </span>
                <span className="font-semibold text-slate-200">
                  {activePopup.winnerData.firstPlace.memberNames.join(', ')}
                </span>
              </div>
            </div>

            {/* 2nd & 3rd Place */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-slate-300">
                  🥈 2nd Place: {activePopup.winnerData.secondPlace.groupName}
                </div>
                <div className="text-slate-400 text-[10px] truncate">
                  {activePopup.winnerData.secondPlace.memberNames.join(', ')}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-600">
                  🥉 3rd Place: {activePopup.winnerData.thirdPlace.groupName}
                </div>
                <div className="text-slate-400 text-[10px] truncate">
                  {activePopup.winnerData.thirdPlace.memberNames.join(', ')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body Message */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line max-h-60 overflow-y-auto font-sans">
          {activePopup.body}
        </div>

        {/* Audio / PDF Attachments if any */}
        {(activePopup.attachedPdfUrl || activePopup.attachedAudioUrl) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {activePopup.attachedPdfUrl && (
              <a
                href={activePopup.attachedPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-amber-400 font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>{activePopup.attachmentName || 'View Attached PDF Document'}</span>
              </a>
            )}

            {activePopup.attachedAudioUrl && (
              <button
                type="button"
                onClick={handlePlayChime}
                disabled={isPlayingAudio}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-amber-400 font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isPlayingAudio ? 'Playing Chime...' : 'Play Audio Clue'}</span>
              </button>
            )}
          </div>
        )}

        {/* Action: Only Cancel button dismisses this pop-up */}
        <div className="pt-2">
          <button
            onClick={handleCancel}
            className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition-all border border-slate-700 hover:border-slate-600 active:scale-98 flex items-center justify-center gap-2"
          >
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
