import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  Compass,
  QrCode,
  LifeBuoy,
  ChevronRight,
  Sparkles,
  Lock,
  PauseCircle,
  Trophy,
  Users,
  Clock,
  ShieldCheck,
  FileText,
  Volume2,
  Edit3,
  CheckCircle2,
} from 'lucide-react';
import { getActiveClueForGroup, playMysteryAudioClue } from '../lib/store';

export const DashboardPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, currentParticipant, myGroup, myTeammates, updateTeamName } = useGame();

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  // If student is registered but teams have not been aligned yet
  if (!myGroup) {
    const activeWaitingCount = store.participants.filter((p) => p.status === 'active').length;

    return (
      <div className="min-h-screen bg-[#0b101b] text-slate-100 py-12 px-4 sm:px-6 max-w-xl mx-auto space-y-6 pb-28">
        <div className="bg-slate-900/90 rounded-3xl p-8 border border-slate-800 text-center space-y-5 shadow-2xl relative overflow-hidden">
          {/* Subtle gold top line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-mono text-amber-400 font-semibold uppercase tracking-wider">
              Registration Confirmed
            </div>
            <h1 className="text-2xl font-black text-white">
              {currentParticipant?.displayName || 'Classmate'}
            </h1>
            <div className="text-xs text-slate-400 font-mono">
              Participant ID: #{currentParticipant?.id.replace('p-', '') || '2026'}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>Waiting for Organizer to Align Teams</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
              Please wait here. When the organizer taps <span className="text-amber-400 font-bold">Align Teams</span>, you will be aligned to your teammates automatically.
            </p>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 leading-normal max-w-sm mx-auto">
              <span className="text-slate-300 font-semibold">Alignment Scenario:</span> Groups have a maximum of 3 students. If 2 students are left, they form a team of 2. If only 1 student is left, they are added to another team to form a 4-player team.
            </div>

            <div className="pt-1 flex items-center justify-center gap-2 font-mono text-xs text-amber-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{activeWaitingCount} students registered in lobby</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Real-time automatic sync active · Screen will refresh instantly</span>
          </div>
        </div>
      </div>
    );
  }

  // Determine current active stage for this squad
  const myCompletedStages = store.progress
    .filter((p) => p.groupId === myGroup.id)
    .map((p) => p.stage);

  const highestDone = myCompletedStages.length > 0 ? Math.max(...myCompletedStages) : 0;
  const currentStageNum = (highestDone < 4 ? highestDone + 1 : 4) as 1 | 2 | 3 | 4;
  const isFinished = highestDone === 4;

  // Resolve group-specific clue for this squad
  const currentClue = getActiveClueForGroup(store.clues, currentStageNum, myGroup.id);

  // Check finishing order if finished
  const finishedGroupIds = Array.from(
    new Set(store.progress.filter((p) => p.stage === 4).map((p) => p.groupId))
  );
  const finishRank = finishedGroupIds.indexOf(myGroup.id) + 1;
  const finishRankLabel =
    finishRank === 1 ? '1st Place Champions!' : finishRank === 2 ? '2nd Place Runners-Up!' : finishRank === 3 ? '3rd Place Bronze Squad!' : `${finishRank}th Place Finished!`;

  const isCaptain = currentParticipant && myGroup.captainId === currentParticipant.id;

  const handlePlayChime = async () => {
    setIsPlayingAudio(true);
    await playMysteryAudioClue();
    setIsPlayingAudio(false);
  };

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameInput.trim()) {
      updateTeamName(myGroup.id, renameInput.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-6 px-4 sm:px-6 max-w-4xl mx-auto space-y-6 pb-28">
      {/* Paused Alert Banner */}
      {store.gameStatus === 'PAUSED' && (
        <div className="bg-rose-500/15 border border-rose-500/30 rounded-2xl p-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-rose-400 font-bold text-sm">
            <PauseCircle className="w-5 h-5 animate-pulse" />
            <span>Hunt Temporarily Paused</span>
          </div>
          <p className="text-xs text-rose-200/80">
            Organizers have paused progression. Please stay safe in your current area.
          </p>
        </div>
      )}

      {/* Finished State Banner */}
      {isFinished && (
        <div className="bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border-2 border-amber-500/60 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg">
            <Trophy className="w-4 h-4" />
            <span>{finishRankLabel}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Congratulations {myGroup.teamName}!
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Your squad has completed all 4 mystery stages! Your verification time is locked on server records.
          </p>

          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 font-semibold text-xs sm:text-sm max-w-md mx-auto">
            📍 Proceed to the Grand Finish Line at <span className="text-white font-bold">Campus Stadium North Bleachers</span> to meet organizers and claim your reward!
          </div>

          <button
            onClick={() => navigate('/winners')}
            className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md transition-all"
          >
            View Official Winners Podium
          </button>
        </div>
      )}

      {/* Greeting & Squad Header */}
      <div className="bg-slate-900/80 rounded-3xl p-5 sm:p-6 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium">
            Welcome,{' '}
            <span className="text-amber-400 font-semibold">
              {currentParticipant?.displayName || 'Classmate'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="text-xl sm:text-2xl font-black text-white">
              {myGroup.teamName}
            </div>

            {/* Rename button for designated captain */}
            {isCaptain && !isRenaming && (
              <button
                onClick={() => {
                  setRenameInput(myGroup.teamName);
                  setIsRenaming(true);
                }}
                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                title="Customize Squad Name"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>

          {isRenaming && (
            <form onSubmit={handleSaveRename} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                placeholder="New Squad Name"
                autoFocus
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Teammates List */}
        <div className="space-y-1">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Teammates ({myTeammates.length}):</span>
            {myGroup.captainId && (
              <span className="text-[10px] text-amber-400 font-mono">
                Leader: {store.participants.find((p) => p.id === myGroup.captainId)?.displayName?.split(' ')[0] || 'Leader'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {myTeammates.map((m) => (
              <span
                key={m.id}
                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>{m.displayName}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 4-Stage Progression Tracker (Squad Shared Progress) */}
      <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800 space-y-3 shadow-lg">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Squad Shared 4-Stage Progress</span>
          <span className="font-mono text-amber-400 font-bold">
            {highestDone} / 4 Checkpoints Verified
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          {[1, 2, 3, 4].map((s) => {
            const isDone = myCompletedStages.includes(s as 1 | 2 | 3 | 4);
            const isCurrent = s === currentStageNum && !isFinished;

            return (
              <div
                key={s}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  isDone
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm'
                    : isCurrent
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/30'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                }`}
              >
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider">
                  Stage {s}
                </div>
                <div className="text-xs font-bold mt-1">
                  {isDone ? (
                    '✓'
                  ) : isCurrent ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Active
                    </span>
                  ) : (
                    <Lock className="w-3 h-3 mx-auto opacity-50" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Clue Card (Always visible on home screen) */}
      {!isFinished && (
        <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-7 border border-amber-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 font-bold">
              <Compass className="w-3.5 h-3.5" />
              <span>Stage {currentStageNum} · Active Clue</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {currentClue.targetGroupId ? 'Custom Route' : 'Campus Route'}
            </span>
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
            {currentClue.titleEnglish || currentClue.titleAmharic}
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line font-sans">
            {currentClue.bodyEnglish || currentClue.bodyAmharic}
          </p>

          {(currentClue.riddleEnglish || currentClue.riddleAmharic) && (
            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-200/90 italic text-xs leading-relaxed font-sans">
              "{currentClue.riddleEnglish || currentClue.riddleAmharic}"
            </div>
          )}

          {/* Attached PDF or Audio for clue if present */}
          {(currentClue.attachedPdfUrl || currentClue.attachedAudioUrl) && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
              {currentClue.attachedPdfUrl && (
                <a
                  href={currentClue.attachedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs text-amber-400 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{currentClue.attachmentName || 'View Attached PDF Map'}</span>
                </a>
              )}

              {currentClue.attachedAudioUrl && (
                <button
                  type="button"
                  onClick={handlePlayChime}
                  disabled={isPlayingAudio}
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs text-amber-400 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isPlayingAudio ? 'Playing Chime...' : 'Play Audio Clue'}</span>
                </button>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={() => navigate(`/hints/${currentClue.id}`)}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              <span>View Clue Timeline</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-[11px] text-slate-400 font-mono">
              Checkpoint #{currentStageNum}
            </span>
          </div>
        </div>
      )}

      {/* Two Action Buttons: Scan QR and Need Help */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <button
          onClick={() => navigate('/checkpoint')}
          className="p-5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-3 shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
        >
          <QrCode className="w-6 h-6 shrink-0" />
          <span>Scan Checkpoint QR</span>
        </button>

        <button
          onClick={() => navigate('/help')}
          className="p-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-sm sm:text-base border border-slate-700/80 flex items-center justify-center gap-3 active:scale-98 transition-all"
        >
          <LifeBuoy className="w-6 h-6 text-amber-400 shrink-0" />
          <span>Need Help</span>
        </button>
      </div>
    </div>
  );
};
