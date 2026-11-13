import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  ArrowLeft,
  Users,
  Shield,
  LifeBuoy,
  MoveRight,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react';

export const AdminGroupDetailPage: React.FC<{
  groupId: string;
  navigate: (path: string) => void;
}> = ({ groupId, navigate }) => {
  const { store, reassignMember, updateTeamName, language } = useGame();

  const group = store.groups.find((g) => g.id === groupId) || store.groups[0];
  const members = group ? store.participants.filter((p) => group.memberIds.includes(p.id)) : [];

  const [selectedMemberToMove, setSelectedMemberToMove] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [moveReason, setMoveReason] = useState<string>('');
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  if (!group) {
    return (
      <div className="p-8 text-center text-slate-400">
        Squad not found. <button onClick={() => navigate('/admin/groups')} className="text-amber-400 underline">Return</button>
      </div>
    );
  }

  const stagesDone = store.progress
    .filter((p) => p.groupId === group.id)
    .map((p) => p.stage);

  const groupHelpRequests = store.helpRequests.filter((r) => r.groupId === group.id);

  const handleExecuteMove = () => {
    if (!selectedMemberToMove || !targetGroupId || !moveReason.trim()) return;

    reassignMember(selectedMemberToMove, targetGroupId, moveReason.trim());
    setMoveNotice('Member successfully moved with audit log.');
    setSelectedMemberToMove(null);
    setMoveReason('');
    setTimeout(() => setMoveNotice(null), 3000);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Top Navigation */}
      <button
        onClick={() => navigate('/admin/groups')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Groups Studio</span>
      </button>

      {/* Main Squad Header */}
      <div className="bg-slate-900/80 rounded-3xl p-6 sm:p-7 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase text-amber-400">
              Official Group {String(group.number).padStart(2, '0')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{group.teamName}</h1>
            <div className="text-xs text-slate-400 font-mono mt-1">
              Published: {new Date(group.publishedAt).toLocaleDateString()} at {new Date(group.publishedAt).toLocaleTimeString()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/notifications')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Targeted Alert</span>
            </button>
          </div>
        </div>

        {/* 4 Stage Verification Stamps */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[10px] uppercase font-mono font-bold text-slate-400">
            Checkpoint Verification Stamps:
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((s) => {
              const isVerified = stagesDone.includes(s as 1 | 2 | 3 | 4);
              const progressEntry = store.progress.find((p) => p.groupId === group.id && p.stage === s);

              return (
                <div
                  key={s}
                  className={`p-3 rounded-xl border text-center ${
                    isVerified
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-600'
                  }`}
                >
                  <div className="text-[10px] font-mono font-bold">Stage {s}</div>
                  <div className="text-xs font-bold mt-0.5">
                    {isVerified ? '✓ Verified' : 'Pending'}
                  </div>
                  {progressEntry && (
                    <div className="text-[9px] text-slate-500 font-mono mt-1">
                      {new Date(progressEntry.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {moveNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{moveNotice}</span>
        </div>
      )}

      {/* Roster & Member Transfer Controls */}
      <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Assigned Squad Roster ({members.length}/3)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Max 3 Members</span>
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-bold text-white">{m.displayName}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  ID: #{m.id} · Registered: {new Date(m.registeredAt).toLocaleTimeString()}
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedMemberToMove(m.id);
                  setTargetGroupId(store.groups.find((g) => g.id !== group.id)?.id || '');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <MoveRight className="w-3.5 h-3.5 text-amber-400" />
                <span>Move Member</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Reassignment Modal */}
      {selectedMemberToMove && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Reassign Squad Member</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Moving a teammate requires an audited reason to preserve fair play and prevent unauthorized tampering during active competition.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Destination Squad
                </label>
                <select
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                >
                  {store.groups
                    .filter((g) => g.id !== group.id && g.memberIds.length < 3)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        Group {g.number} - {g.teamName} ({g.memberIds.length}/3 members)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Move (Audit Log)
                </label>
                <input
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="e.g. Requested partner swap, accessibility alignment"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedMemberToMove(null)}
                className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!moveReason.trim()}
                onClick={handleExecuteMove}
                className="w-2/3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-xs font-bold"
              >
                Execute Audited Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
