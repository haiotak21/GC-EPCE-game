/**
 * The results, as every student sees them (§14).
 *
 * Shows each winning team's chosen name — "Power Smoke" rather than "Group 03"
 * — because that is the name the team made for itself and the one everyone
 * will remember. The group number stays alongside it, since that never
 * changes and is what organizers call out at the ceremony.
 *
 * Teams become visible to other students only once the reveal has happened:
 * before that, RLS hides every winner row.
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy } from 'lucide-react';
import { useLiveGame } from '../context/LiveGameContext';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PLACE: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

const TONE: Record<number, string> = {
  1: 'from-amber-400/20 to-amber-600/10 border-amber-400/50',
  2: 'from-slate-300/15 to-slate-500/10 border-slate-400/40',
  3: 'from-orange-500/15 to-orange-700/10 border-orange-500/40',
};

export const WinnersPodium: React.FC = () => {
  const { winners, myGroup } = useLiveGame();

  const revealed = winners.filter((w) => w.revealed_at).sort((a, b) => a.position - b.position);

  useEffect(() => {
    if (revealed.length === 0) return;
    try {
      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
      });
    } catch {
      // Confetti is decoration; never let it break the results.
    }
  }, [revealed.length]);

  if (revealed.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-amber-500/40 rounded-3xl overflow-hidden shadow-xl">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

      <div className="p-5 sm:p-6 space-y-4">
        <div className="text-center space-y-1">
          <Trophy className="w-9 h-9 text-amber-400 mx-auto" />
          <h2 className="text-xl font-black text-white">Winners announced!</h2>
          <p className="text-xs text-slate-400">Congratulations to every team that took part.</p>
        </div>

        <div className="space-y-2">
          {revealed.map((w) => {
            const isMine = myGroup?.id === w.group_id;
            // The team's own name if they chose one, with the number alongside.
            const name = w.group_name?.trim();
            const number = `Group ${String(w.group_number ?? 0).padStart(2, '0')}`;

            return (
              <div
                key={w.id}
                className={`p-4 rounded-2xl bg-gradient-to-r border ${TONE[w.position]} ${
                  isMine ? 'ring-2 ring-amber-400' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl shrink-0">{MEDALS[w.position]}</div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {PLACE[w.position]}
                    </div>
                    <div className="text-lg font-black text-white truncate">
                      {name || number}
                      {isMine && (
                        <span className="ml-2 text-[10px] text-amber-300 font-bold">YOUR TEAM</span>
                      )}
                    </div>
                    {name && <div className="text-[11px] text-slate-400">{number}</div>}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-amber-300">
                      {Number(w.prize_amount).toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500 font-bold">ETB</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
          Please come to the finish line for the prize ceremony.
        </p>
      </div>
    </div>
  );
};
