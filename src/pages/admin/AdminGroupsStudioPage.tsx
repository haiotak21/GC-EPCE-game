import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Shuffle,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Lock,
  RotateCcw,
} from 'lucide-react';

export const AdminGroupsStudioPage: React.FC<{
  navigate: (path: string) => void;
  onSelectGroup: (groupId: string) => void;
}> = ({ navigate, onSelectGroup }) => {
  const {
    store,
    previewShuffle,
    confirmPublishTeams,
    alignTeamsDirectly,
    cancelPreviewShuffle,
    language,
  } = useGame();

  const [showPublishModal, setShowPublishModal] = useState(false);
  const [alignedNotice, setAlignedNotice] = useState(false);
  const [exceptions, setExceptions] = useState<string[]>([]);

  const eligibleUnassigned = store.participants.filter(
    (p) => p.status === 'active' && !p.assignedGroupId
  );

  const handleGeneratePreview = () => {
    const res = previewShuffle();
    setExceptions(res.pendingExceptions);
  };

  const handleConfirmPublish = () => {
    confirmPublishTeams();
    setShowPublishModal(false);
  };

  const handleAlignTeamsDirectly = () => {
    alignTeamsDirectly();
    setAlignedNotice(true);
    setTimeout(() => setAlignedNotice(false), 4000);
  };

  const isPreviewing = store.previewGroups !== null;
  const isPublished = store.groups.length > 0;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Random Assignment Studio</h1>
          <p className="text-xs text-slate-400">
            Fair algorithm allocates classmates into squads of max 3 (remainder 2 → team of 2; remainder 1 → team of 4).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAlignTeamsDirectly}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
          >
            <Shuffle className="w-4 h-4" />
            <span>Align Teams</span>
          </button>

          {!isPreviewing ? (
            <button
              onClick={handleGeneratePreview}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition-all"
            >
              <span>Preview Shuffle First</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleGeneratePreview}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Shuffle Again</span>
              </button>

              <button
                onClick={cancelPreviewShuffle}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs"
              >
                Discard
              </button>

              <button
                onClick={() => setShowPublishModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Publish</span>
              </button>
            </>
          )}
        </div>
      </div>

      {alignedNotice && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>
            Teams aligned successfully! Students distributed into squads of max 3 (remainder 2 as team of 2, remainder 1 as 4-player team). Status set to TEAMS_PUBLISHED.
          </span>
        </div>
      )}

      {/* Constraints Notice Banner */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-white">Fairness Algorithm Rule:</span> Groups have max 3 students. If 2 students left → team of 2. If 1 student left → aligned into another team to make 4 players.
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>Active: {store.participants.filter((p) => p.status === 'active').length}</span>
          <span>·</span>
          <span>Published Squads: {store.groups.length}</span>
        </div>
      </div>

      {/* Pending Exception Warning (if n=1) */}
      {exceptions.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-300">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>
            1 entrant remains without a partner. Per fairness spec, n=1 is not published as a solo squad until an additional registrant joins.
          </span>
        </div>
      )}

      {/* Groups Grid: Showing Preview OR Published Squads */}
      {isPreviewing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Private Shuffle Preview (Not Yet Published)</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {store.previewGroups?.length} Generated Squads
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.previewGroups?.map((pg) => (
              <div
                key={pg.number}
                className="bg-slate-900/90 rounded-2xl p-5 border border-amber-500/40 space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Preview Group {pg.number}
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    {pg.memberIds.length} Members
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {pg.memberIds.map((mId, i) => {
                    const p = store.participants.find((part) => part.id === mId);
                    return (
                      <div
                        key={mId}
                        className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 text-xs text-slate-200 flex items-center justify-between"
                      >
                        <span className="font-semibold">{p?.displayName || mId}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{mId.replace('p-', '')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isPublished ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Official Published Squads ({store.groups.length})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.groups.map((group) => {
              const members = store.participants.filter((p) => group.memberIds.includes(p.id));
              const stagesDone = store.progress.filter((p) => p.groupId === group.id).length;

              return (
                <div
                  key={group.id}
                  className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-colors space-y-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-black text-white font-mono">
                        Group {String(group.number).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-amber-400 font-medium truncate max-w-[180px]">
                        {group.teamName}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onSelectGroup(group.id);
                        navigate(`/admin/groups/${group.id}`);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                      title="Inspect & Edit Roster"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-xs text-slate-200 flex items-center justify-between"
                      >
                        <span className="font-medium">{m.displayName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{m.id.replace('p-', '')}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{members.length} Classmates</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {stagesDone}/4 Checkpoints
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800 text-slate-500 space-y-3">
          <Shuffle className="w-10 h-10 mx-auto opacity-30" />
          <div className="text-sm font-semibold text-slate-300">No teams generated yet</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click "Generate Shuffle Preview" above to let the algorithm create fair 2–3 person squads.
          </p>
        </div>
      )}

      {/* Confirm & Publish Modal Dialog */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Publish Official Assignments?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Publishing will immediately reveal group numbers and teammate names on all student waiting rooms with celebration confetti. This cannot be quietly undone.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                className="w-2/3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20"
              >
                Confirm & Publish Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
