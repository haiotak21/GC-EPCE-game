/**
 * The vote that happens once all three places are taken (§ organizers, 2026-11-14).
 *
 * Five minutes after third place, every team still playing is asked whether to
 * carry on or stop. The majority decides, and the database applies it — this
 * screen only collects the answer.
 *
 * Teams that already finished are never asked: the database decides who is
 * eligible, so a finished team cannot vote on behalf of the ones still out
 * there.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Flag, Play, Users, CheckCircle2 } from 'lucide-react';
import { rpc } from '../lib/supabase';

interface VoteState {
  open: boolean;
  decision: 'continue' | 'abort' | null;
  my_vote: 'continue' | 'abort' | null;
  continue_votes: number;
  abort_votes: number;
  teams_voting: number;
  opens_at?: string;
}

export const PostPodiumVote: React.FC<{ refreshKey: unknown }> = ({ refreshKey }) => {
  const [state, setState] = useState<VoteState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = (await rpc('post_podium_state' as never, {} as never)) as unknown as VoteState;
      setState(result);
    } catch {
      // The migration may not be applied yet; stay silent rather than alarm
      // a student mid-hunt.
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // The vote opens on a timer the server owns, so poll while we wait for it.
  useEffect(() => {
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  if (!state?.open || state.decision) return null;

  const vote = async (choice: 'continue' | 'abort') => {
    if (busy) return;
    setBusy(true);
    try {
      await rpc('cast_game_vote' as never, { p_choice: choice } as never);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const voted = state.my_vote !== null;

  return (
    <div className="bg-slate-900/90 border border-indigo-500/40 rounded-3xl overflow-hidden shadow-xl">
      <div className="h-1 bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600" />

      <div className="p-5 space-y-4">
        <div className="text-center space-y-1">
          <Users className="w-8 h-8 text-indigo-400 mx-auto" />
          <h2 className="text-lg font-black text-white">All three places have been won</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your team can still finish the hunt. Should the game carry on, or stop here? The
            majority of teams still playing decides.
          </p>
        </div>

        {voted ? (
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Your team voted to {state.my_vote === 'continue' ? 'keep playing' : 'stop'}
            </div>
            <p className="text-[11px] text-slate-500">
              Waiting for the other teams. You can change your mind below.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void vote('continue')}
            className={`py-3.5 rounded-xl font-black text-xs flex flex-col items-center gap-1 transition-colors disabled:opacity-50 ${
              state.my_vote === 'continue'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Keep playing</span>
            <span className="text-[10px] font-normal opacity-70">{state.continue_votes} team(s)</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void vote('abort')}
            className={`py-3.5 rounded-xl font-black text-xs flex flex-col items-center gap-1 transition-colors disabled:opacity-50 ${
              state.my_vote === 'abort'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>Stop the hunt</span>
            <span className="text-[10px] font-normal opacity-70">{state.abort_votes} team(s)</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          {state.continue_votes + state.abort_votes} of {state.teams_voting} teams still playing have
          voted.
        </p>
      </div>
    </div>
  );
};
