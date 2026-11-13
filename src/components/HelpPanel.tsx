/**
 * Need Help (§7).
 *
 * The allowance is per team, not per person, and the database enforces it
 * under a lock — so three teammates pressing Send at the same moment cannot
 * spend three of the team's two requests.
 */

import React, { useState } from 'react';
import { X, LifeBuoy, Send, CheckCircle2, Clock } from 'lucide-react';
import { useLiveGame } from '../context/LiveGameContext';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
});

export const HelpPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { helpRequests, game, requestHelp } = useLiveGame();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const limit = game?.help_request_limit ?? 2;
  const used = helpRequests.filter((r) => !r.is_exempt).length;
  const remaining = Math.max(0, limit - used);

  const send = async () => {
    if (busy || !message.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestHelp(message.trim());
      if (result.ok) {
        setMessage('');
      } else {
        setError(
          result.code === 'LIMIT_REACHED'
            ? 'Your team has used all its help requests. Find an organizer if it is urgent.'
            : result.code === 'NO_GROUP'
              ? 'You need a team before you can ask for help.'
              : 'Could not send. Please try again.'
        );
      }
    } catch {
      setError('Connection problem. Check your internet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-md z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600" />

          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                  <LifeBuoy className="w-4.5 h-4.5 text-sky-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Need help?</h2>
                  <p className="text-[11px] text-slate-400">
                    {remaining} of {limit} requests left for your team
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {remaining > 0 ? (
              <div className="space-y-2">
                <label htmlFor="help-message" className="block text-xs font-semibold text-slate-300">
                  What are you stuck on?
                </label>
                <textarea
                  id="help-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. We cannot find the tree described in clue 2"
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-sky-400 resize-none"
                />
                <button
                  type="button"
                  disabled={busy || !message.trim()}
                  onClick={() => void send()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{busy ? 'Sending…' : 'Send to organizers'}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  This uses one of your team's requests. Only your team sees the reply.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                Your team has used all {limit} help requests. If this is a safety problem, find an
                organizer in person — they can always help.
              </div>
            )}

            {helpRequests.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Your requests
                </div>
                {helpRequests.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-300 leading-relaxed flex-1">{r.message}</p>
                      <span className="text-[9px] text-slate-600 font-mono shrink-0">
                        {timeFmt.format(new Date(r.created_at))}
                      </span>
                    </div>

                    {r.admin_reply ? (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Organizer reply
                        </div>
                        <p className="text-xs text-emerald-200 leading-relaxed">{r.admin_reply}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                        <Clock className="w-3 h-3" />
                        Waiting for a reply…
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
