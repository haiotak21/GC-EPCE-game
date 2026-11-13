/**
 * Start the event over.
 *
 * Built for rehearsals, but it lives in the same dashboard an organizer uses
 * during the real hunt — so it is deliberately awkward to trigger: collapsed
 * by default, and it will not run until the word RESET is typed. A plain
 * "are you sure?" is too easy to click through when you are tired and
 * half-watching something else.
 */

import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { describeError, isMissingFunction } from '../../lib/supabase';
import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

const CONFIRM_WORD = 'RESET';

export const DangerZone: React.FC = () => {
  const { participants, groups, resetGame } = useAdmin();

  const [open, setOpen] = useState(false);
  const [includeClues, setIncludeClues] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const run = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await resetGame(includeClues);
      setNotice(result);
      if (result.ok) {
        setTyped('');
        setIncludeClues(false);
        setOpen(false);
      }
    } catch (err) {
      // Without this the button simply did nothing on failure, which is
      // indistinguishable from "reset is broken".
      setNotice({
        ok: false,
        message: isMissingFunction(err)
          ? 'The database does not have reset_game yet — run migration 0012 in the Supabase SQL editor.'
          : `Reset failed: ${describeError(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-rose-300">
          <AlertTriangle className="w-4 h-4" />
          Start the event over
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-rose-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-rose-400" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              This permanently deletes:
            </p>
            <ul className="text-xs text-rose-300 space-y-0.5 list-disc list-inside">
              <li>
                all <strong>{participants.length}</strong> registered student(s)
              </li>
              <li>
                all <strong>{groups.length}</strong> team(s) and their progress
              </li>
              <li>every message, help request and result</li>
            </ul>
            <p className="text-xs text-emerald-300 leading-relaxed pt-1">
              Kept: your clues, your checkpoint codes, and the three organizer accounts. Registration
              reopens so students can join again.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeClues}
              onChange={(e) => setIncludeClues(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also delete the clues and checkpoint codes
              <span className="block text-[11px] text-slate-500">
                Only if you want to rewrite everything. Any printed QR signs stop working.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <label htmlFor="reset-confirm" className="block text-xs font-semibold text-slate-300">
              Type <span className="font-mono text-rose-300">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              id="reset-confirm"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono tracking-widest text-center focus:outline-none focus:border-rose-400"
            />
          </div>

          <button
            type="button"
            disabled={!armed || busy}
            onClick={() => void run()}
            className="w-full py-3 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-xs flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {busy ? 'Resetting…' : 'Delete everything and start over'}
          </button>

          <p className="text-[10px] text-slate-500 leading-relaxed">
            Recorded in the Activity log with your name. Students already signed in keep their
            browser session but will be asked for their name again, since their registration is
            gone.
          </p>
        </div>
      )}

      {notice && (
        <div
          className={`mx-4 mb-4 p-3 rounded-xl text-xs border ${
            notice.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
};
