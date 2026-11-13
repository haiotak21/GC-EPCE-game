import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Users,
  Shuffle,
  Activity,
  LifeBuoy,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Send,
  Sparkles,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { GameStatus } from '../../types';

export const AdminCommandCenterPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const { store, updateGameStatus, currentAdmin, alignTeamsDirectly, language } = useGame();

  const [confirmStatusModal, setConfirmStatusModal] = useState<GameStatus | null>(null);
  const [alignedNotice, setAlignedNotice] = useState(false);

  const activeParticipants = store.participants.filter((p) => p.status === 'active');
  const assignedCount = activeParticipants.filter((p) => p.assignedGroupId).length;
  const unassignedCount = activeParticipants.length - assignedCount;
  const pendingHelpCount = store.helpRequests.filter((r) => r.status === 'pending').length;

  const handleStateChange = (targetState: GameStatus) => {
    updateGameStatus(targetState, `Triggered by ${currentAdmin?.displayName}`);
    setConfirmStatusModal(null);
  };

  const handleAlignTeams = () => {
    alignTeamsDirectly();
    setAlignedNotice(true);
    setTimeout(() => setAlignedNotice(false), 4000);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner & Organizer Greeting */}
      <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 font-mono">
            <span>Organizer Console</span>
            <span>·</span>
            <span className="text-amber-400 font-bold uppercase">{store.gameStatus}</span>
          </div>
          <h1 className="text-2xl font-black text-white">Live Event Command Center</h1>
          <p className="text-xs text-slate-400">
            Real-time status management, fair team publishing, and live progress control for 3 event marshals.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAlignTeams}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
          >
            <Shuffle className="w-4 h-4" />
            <span>Align Teams</span>
          </button>
          <button
            onClick={() => navigate('/admin/groups')}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Studio</span>
          </button>
          <button
            onClick={() => navigate('/admin/notifications')}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>
      </div>

      {alignedNotice && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              All students successfully aligned! Distributed into squads of max 3 (remainder 2 as team of 2; remainder 1 merged into a 4-player team). Status updated to TEAMS_PUBLISHED.
            </span>
          </div>
        </div>
      )}

      {/* High-Stakes Lifecycle Game Status Control Bar */}
      <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Game Lifecycle State Transitions
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <button
            onClick={() => setConfirmStatusModal('REGISTRATION_OPEN')}
            disabled={store.gameStatus === 'REGISTRATION_OPEN'}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'REGISTRATION_OPEN'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-400/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            1. Open Reg
          </button>

          <button
            onClick={() => setConfirmStatusModal('REGISTRATION_CLOSED')}
            disabled={store.gameStatus === 'REGISTRATION_CLOSED'}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'REGISTRATION_CLOSED'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            2. Close Reg
          </button>

          <button
            onClick={() => setConfirmStatusModal('IN_PROGRESS')}
            disabled={store.gameStatus === 'IN_PROGRESS'}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'IN_PROGRESS'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-400/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            3. Start Hunt
          </button>

          <button
            onClick={() => setConfirmStatusModal(store.gameStatus === 'PAUSED' ? 'IN_PROGRESS' : 'PAUSED')}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'PAUSED'
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 ring-1 ring-rose-400/30 animate-pulse'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {store.gameStatus === 'PAUSED' ? 'Resume Hunt' : 'Pause Hunt'}
          </button>

          <button
            onClick={() => setConfirmStatusModal('FINISHED')}
            disabled={store.gameStatus === 'FINISHED'}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'FINISHED'
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-400/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            4. Finish Hunt
          </button>

          <button
            onClick={() => navigate('/admin/winners')}
            className={`p-2.5 rounded-xl text-xs font-semibold border transition-all ${
              store.gameStatus === 'WINNERS_REVEALED'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            5. Crown Winners
          </button>
        </div>
      </div>

      {/* 6 Key Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Registered</div>
          <div className="text-2xl font-black text-white font-mono">{activeParticipants.length}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Assigned</div>
          <div className="text-2xl font-black text-amber-400 font-mono">{assignedCount}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Squads</div>
          <div className="text-2xl font-black text-white font-mono">{store.groups.length}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Unassigned</div>
          <div className={`text-2xl font-black font-mono ${unassignedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {unassignedCount}
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Pending Help</div>
          <div className={`text-2xl font-black font-mono ${pendingHelpCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {pendingHelpCount}
          </div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Verifications</div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{store.progress.length}</div>
        </div>
      </div>

      {/* Urgent Issues Warning Area */}
      {unassignedCount > 0 && store.gameStatus === 'REGISTRATION_CLOSED' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Registration closed with {unassignedCount} unassigned student(s). Open Random Assignment Studio to shuffle into 2-3 squads.
            </span>
          </div>
          <button
            onClick={() => navigate('/admin/groups')}
            className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold shrink-0"
          >
            Go to Studio
          </button>
        </div>
      )}

      {/* Progress & Live Activity Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Team Progress Matrix Preview */}
        <div className="bg-slate-900/60 rounded-3xl p-5 sm:p-6 border border-slate-800 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Live Squad Progress Snapshot</span>
            </div>
            <button
              onClick={() => navigate('/admin/progress')}
              className="text-xs text-amber-400 hover:underline font-medium"
            >
              Full Matrix →
            </button>
          </div>

          <div className="space-y-2">
            {store.groups.map((group) => {
              const stagesDone = store.progress
                .filter((p) => p.groupId === group.id)
                .map((p) => p.stage);

              return (
                <div
                  key={group.id}
                  className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs text-white">Group {group.number}</span>
                    <span className="text-[11px] text-slate-400 ml-2">{group.teamName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    {[1, 2, 3, 4].map((s) => (
                      <span
                        key={s}
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-bold ${
                          stagesDone.includes(s as 1 | 2 | 3 | 4)
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Audit / Activity Stream */}
        <div className="bg-slate-900/60 rounded-3xl p-5 sm:p-6 border border-slate-800 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Recent Activity Feed
            </div>
            <button
              onClick={() => navigate('/admin/audit')}
              className="text-xs text-amber-400 hover:underline font-medium"
            >
              Full Log →
            </button>
          </div>

          <div className="space-y-2.5">
            {store.auditLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span className="text-amber-400 font-semibold">{log.event}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-white font-medium truncate">{log.target}</div>
                {log.afterSummary && (
                  <div className="text-[11px] text-slate-400 truncate">{log.afterSummary}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* State Confirmation Modal */}
      {confirmStatusModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Confirm State Transition</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Transition game lifecycle state from{' '}
              <span className="font-mono text-amber-400 font-bold">{store.gameStatus}</span> to{' '}
              <span className="font-mono text-emerald-400 font-bold">{confirmStatusModal}</span>? All connected student devices will receive real-time updates.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmStatusModal(null)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStateChange(confirmStatusModal)}
                className="w-2/3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold shadow-md shadow-amber-400/20"
              >
                Confirm Transition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
