/**
 * Winners (§14) — a record of what happened, not a decision to make.
 *
 * Placings are awarded automatically the moment a team verifies checkpoint 4,
 * and announced to everyone immediately. The old "choose three teams and press
 * Reveal" flow is gone: it contradicted that, and its buttons silently failed
 * because the results were already public.
 *
 * What remains is a correction tool, for the cases that do need a human: a
 * disqualified team, or a checkpoint undone on the Progress tab.
 */

import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Trophy, AlertTriangle, Clock, Pencil } from 'lucide-react';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PLACE: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const WinnersTab: React.FC = () => {
  const { groups, winners, game, correctWinner } = useAdmin();

  const [editing, setEditing] = useState<number | null>(null);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const byPosition = new Map(winners.map((w) => [w.position, w]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const label = (groupId?: string) => {
    const g = groupId ? groupById.get(groupId) : undefined;
    if (!g) return null;
    return {
      name: g.group_name?.trim() || `Group ${String(g.group_number).padStart(2, '0')}`,
      number: `Group ${String(g.group_number).padStart(2, '0')}`,
      finishedAt: g.stageTimes[4],
      members: g.members.map((m) => m.full_name).join(', '),
    };
  };

  const prizeFor = (position: number) =>
    position === 1
      ? game?.first_prize_etb
      : position === 2
        ? game?.second_prize_etb
        : game?.third_prize_etb;

  const save = async (position: number, groupId: string | null) => {
    setBusy(true);
    try {
      setNotice(await correctWinner(position, groupId, reason));
      setEditing(null);
      setReason('');
      setPick('');
    } finally {
      setBusy(false);
    }
  };

  const stillRacing = groups.filter((g) => g.completedStage < 4).length;

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`p-3.5 rounded-xl text-xs border ${
            notice.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-2">
        <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Places are awarded automatically as teams finish, and announced to everyone the moment
          they happen. There is nothing to press — this page shows what the system decided, and lets
          you correct it if something went wrong.
        </p>
      </div>

      {/* The podium */}
      <div className="space-y-2">
        {([1, 2, 3] as const).map((position) => {
          const w = byPosition.get(position);
          const info = label(w?.group_id);
          const isEditing = editing === position;

          return (
            <div
              key={position}
              className={`p-4 rounded-2xl border ${
                info
                  ? 'bg-slate-900/80 border-amber-500/30'
                  : 'bg-slate-900/40 border-slate-800 border-dashed'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="text-2xl shrink-0">{MEDALS[position]}</div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {PLACE[position]} ·{' '}
                      {Number(prizeFor(position) ?? 0).toLocaleString()} ETB
                    </div>

                    {info ? (
                      <>
                        <div className="text-base font-black text-white truncate">{info.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {info.name !== info.number && `${info.number} · `}
                          {info.members}
                        </div>
                        {info.finishedAt && (
                          <div className="text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            finished {stamp.format(new Date(info.finishedAt))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-slate-500">
                        Not won yet
                        {stillRacing > 0 && ` — ${stillRacing} team(s) still playing`}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditing(isEditing ? null : position);
                    setPick(w?.group_id ?? '');
                    setReason('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>

              {isEditing && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Only for genuine mistakes — a disqualified team, or a checkpoint you undid.
                      Students see the change immediately.
                    </span>
                  </div>

                  <select
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  >
                    <option value="">— leave this place empty —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Group {String(g.group_number).padStart(2, '0')}
                        {g.group_name ? ` · ${g.group_name}` : ''} ({g.completedStage}/4)
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (recorded in the activity log)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void save(position, pick || null)}
                      className="px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-[11px] font-bold"
                    >
                      {busy ? 'Saving…' : 'Apply correction'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Everyone else who finished */}
      {groups.some((g) => g.completedStage === 4 && !winners.some((w) => w.group_id === g.id)) && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <h3 className="font-bold text-white text-sm">Also finished</h3>
          <p className="text-[11px] text-slate-500 mb-1">Completed all four, outside the top three.</p>
          {groups
            .filter((g) => g.completedStage === 4 && !winners.some((w) => w.group_id === g.id))
            .sort((a, b) => (a.stageTimes[4] ?? '').localeCompare(b.stageTimes[4] ?? ''))
            .map((g) => (
              <div key={g.id} className="text-xs text-slate-300 flex items-center justify-between">
                <span>{g.group_name?.trim() || `Group ${String(g.group_number).padStart(2, '0')}`}</span>
                {g.stageTimes[4] && (
                  <span className="text-[10px] text-slate-600 font-mono">
                    {stamp.format(new Date(g.stageTimes[4]))}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}

      {/* The end-of-game vote */}
      {game?.podium_filled_at && (
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
          <h3 className="font-bold text-white text-sm">End-of-game vote</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            All three places were taken at {stamp.format(new Date(game.podium_filled_at))}. Five
            minutes later, the teams still playing were asked whether to carry on.
          </p>
          <div className="text-xs pt-1">
            {game.post_podium_decision === 'abort' ? (
              <span className="text-rose-300">They voted to stop the hunt.</span>
            ) : game.post_podium_decision === 'continue' ? (
              <span className="text-emerald-300">They voted to keep playing.</span>
            ) : (
              <span className="text-slate-400">Voting is still open.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
