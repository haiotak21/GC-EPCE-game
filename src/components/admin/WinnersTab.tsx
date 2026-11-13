/**
 * Winner selection and reveal (§14).
 *
 * The selection is saved privately first and stays invisible to students until
 * Reveal is pressed — enforced by RLS, not by hiding it in the UI.
 */

import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Trophy, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';

const PRIZES: Record<1 | 2 | 3, number> = { 1: 3000, 2: 2000, 3: 1000 };
const MEDALS: Record<1 | 2 | 3, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const WinnersTab: React.FC = () => {
  const { groups, winners, game, setWinners, revealWinners } = useAdmin();

  const revealed = winners.some((w) => w.revealed_at);
  const [picks, setPicks] = useState<Record<1 | 2 | 3, string>>(() => ({
    1: winners.find((w) => w.position === 1)?.group_id ?? '',
    2: winners.find((w) => w.position === 2)?.group_id ?? '',
    3: winners.find((w) => w.position === 3)?.group_id ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);

  // §14 "Admin should be able to inspect checkpoint completion times before
  // selecting winners" — finishers first, earliest last-stage time wins.
  const ranked = groups
    .slice()
    .sort((a, b) => {
      if (b.completedStage !== a.completedStage) return b.completedStage - a.completedStage;
      const at = a.stageTimes[a.completedStage] ?? '9999';
      const bt = b.stageTimes[b.completedStage] ?? '9999';
      return at.localeCompare(bt);
    });

  const chosen = Object.values(picks).filter(Boolean);
  const duplicate = new Set(chosen).size !== chosen.length;
  const complete = chosen.length === 3;

  const labelFor = (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return '—';
    return `Group ${String(g.group_number).padStart(2, '0')}${g.group_name ? ` · ${g.group_name}` : ''}`;
  };

  const save = async () => {
    setBusy(true);
    try {
      setNotice(
        await setWinners(
          ([1, 2, 3] as const).map((pos) => ({
            group_id: picks[pos],
            position: pos,
            prize_amount: PRIZES[pos],
          }))
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    setBusy(true);
    setConfirmReveal(false);
    try {
      setNotice(await revealWinners());
    } finally {
      setBusy(false);
    }
  };

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

      {revealed && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-2">
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <strong>Winners have been revealed.</strong> Every student can now see the results.
          </div>
        </div>
      )}

      {/* Standings, to inform the choice */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
        <h3 className="font-bold text-white text-sm">Standings</h3>
        <p className="text-[11px] text-slate-500">
          Ordered by stages completed, then by who finished first. Times in Addis Ababa.
        </p>
        <div className="space-y-1 pt-1">
          {ranked.map((g, i) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-slate-600 w-5">#{i + 1}</span>
                <span className="text-xs text-white font-medium truncate">
                  Group {String(g.group_number).padStart(2, '0')}
                  {g.group_name && (
                    <span className="ml-1.5 text-amber-300">{g.group_name}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-amber-400">{g.completedStage}/4</span>
                {g.completedStage === 4 && (
                  <span className="text-[9px] font-mono text-emerald-400">
                    {timeFmt.format(new Date(g.stageTimes[4]))}
                  </span>
                )}
              </div>
            </div>
          ))}
          {ranked.length === 0 && <p className="text-xs text-slate-500">No teams yet.</p>}
        </div>
      </div>

      {/* The three podium slots */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <h3 className="font-bold text-white text-sm">Choose the winners</h3>

        {([1, 2, 3] as const).map((pos) => (
          <div key={pos}>
            <label
              htmlFor={`winner-${pos}`}
              className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1"
            >
              {MEDALS[pos]} {pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd'} place ·{' '}
              {PRIZES[pos].toLocaleString()} ETB
            </label>
            <select
              id={`winner-${pos}`}
              value={picks[pos]}
              disabled={revealed}
              onChange={(e) => setPicks((p) => ({ ...p, [pos]: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50"
            >
              <option value="">— choose a team —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {labelFor(g.id)} ({g.completedStage}/4)
                </option>
              ))}
            </select>
          </div>
        ))}

        {duplicate && (
          <p className="text-[11px] text-rose-400">
            A team cannot take two places — choose three different teams.
          </p>
        )}

        {!revealed && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !complete || duplicate}
              onClick={() => void save()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs"
            >
              {busy ? 'Saving…' : 'Save selection (private)'}
            </button>

            {confirmReveal ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reveal()}
                  className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs"
                >
                  Yes — reveal to everyone
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReveal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || winners.length === 0}
                onClick={() => setConfirmReveal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Reveal winners
              </button>
            )}
          </div>
        )}

        {confirmReveal && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Every student's phone will show the results at once. This cannot be hidden again.
            </span>
          </div>
        )}

        {winners.length > 0 && !revealed && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Selection saved and still private.
          </div>
        )}
      </div>

      {game?.status !== 'FINISHED' && game?.status !== 'WINNERS_REVEALED' && (
        <p className="text-[11px] text-slate-500">
          Tip: finish the game on the Overview tab before revealing, so no team can still be
          scanning checkpoints.
        </p>
      )}
    </div>
  );
};
