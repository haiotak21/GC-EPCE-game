/**
 * Help desk (§13).
 *
 * A reply goes only to the team that asked — the database writes delivery rows
 * for that team alone, so no other team can read it even if they try.
 */

import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { LifeBuoy, Send, CheckCircle2, Clock, Sparkles } from 'lucide-react';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
});

/** §13 "Use Prepared Hint" — one tap instead of typing under pressure. */
const CANNED = [
  'Read the clue again carefully — the answer is in the wording.',
  'You are looking in the right area. Check the north side.',
  'Ask a staff member at that building to point you to the sign.',
  'Look lower — the sign is at eye level, not above the door.',
];

export const HelpDeskTab: React.FC = () => {
  const { helpRequests, groups, participants, admins, answerHelp, grantHelpRequest, game } =
    useAdmin();
  const [granting, setGranting] = useState<string | null>(null);
  const [grantReason, setGrantReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const groupOf = new Map(groups.map((g) => [g.id, g]));
  const nameOf = new Map(participants.map((p) => [p.id, p.full_name]));
  // So each organizer can see who among them already replied (§18).
  const adminName = new Map(admins.map((a) => [a.id, a.display_name]));

  const rows = helpRequests.filter((r) => (filter === 'pending' ? r.status === 'pending' : true));
  const pendingCount = helpRequests.filter((r) => r.status === 'pending').length;

  const send = async (id: string) => {
    const text = (replies[id] ?? '').trim();
    if (!text) return;
    setBusy(id);
    try {
      await answerHelp(id, text);
      setReplies((r) => ({ ...r, [id]: '' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-sky-400" />
          Help requests
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
              {pendingCount} waiting
            </span>
          )}
        </h3>

        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${
                filter === f ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            notice.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* §7: an organizer can grant a team one more request, with a reason. */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="text-[11px] text-slate-400">
          Every team gets {game?.help_request_limit ?? 2} request(s). Grant an extra to a team that
          needs one:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGranting(g.id);
                setGrantReason('');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                granting === g.id
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Group {String(g.group_number).padStart(2, '0')}
              {g.bonus_help_requests > 0 && (
                <span className="ml-1 text-emerald-400">+{g.bonus_help_requests}</span>
              )}
            </button>
          ))}
        </div>

        {granting && (
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              placeholder="Reason, e.g. their clue sign was damaged"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
            />
            <button
              type="button"
              disabled={!grantReason.trim()}
              onClick={async () => {
                setNotice(await grantHelpRequest(granting, grantReason));
                setGranting(null);
                setGrantReason('');
              }}
              className="px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-[11px] font-bold"
            >
              Grant
            </button>
            <button
              type="button"
              onClick={() => setGranting(null)}
              className="px-3 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
          <p className="text-sm text-slate-500">
            {filter === 'pending' ? 'No teams are waiting for help.' : 'No help requests yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const group = groupOf.get(r.group_id);
            const answered = r.status === 'answered';
            return (
              <div
                key={r.id}
                className={`p-4 rounded-2xl border space-y-3 ${
                  answered
                    ? 'bg-slate-900/60 border-slate-800'
                    : 'bg-slate-900/90 border-amber-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">
                      Group {String(group?.group_number ?? '?').padStart(2, '0')}
                      {group?.group_name && (
                        <span className="ml-2 text-xs text-amber-300 font-semibold">
                          {group.group_name}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Asked by {nameOf.get(r.requested_by) ?? 'a teammate'} · on clue{' '}
                      {r.stage_number} · {timeFmt.format(new Date(r.created_at))}
                      {r.is_exempt && <span className="text-sky-400"> · free (exempt)</span>}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                      answered
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {answered ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {answered ? 'Answered' : 'Waiting'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <p className="text-sm text-slate-200 leading-relaxed">{r.message}</p>
                </div>

                {answered ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                      Replied by {adminName.get(r.answered_by ?? '') ?? 'an organizer'}
                      {r.answered_at && (
                        <span className="text-emerald-500/70 normal-case font-normal">
                          {' '}
                          at {timeFmt.format(new Date(r.answered_at))}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-200 leading-relaxed">{r.admin_reply}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {CANNED.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setReplies((rs) => ({ ...rs, [r.id]: c }))}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          {c.slice(0, 32)}…
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={2}
                      value={replies[r.id] ?? ''}
                      onChange={(e) => setReplies((rs) => ({ ...rs, [r.id]: e.target.value }))}
                      placeholder="Write a reply — only this team will see it…"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-sky-400 resize-none"
                    />

                    <button
                      type="button"
                      disabled={busy === r.id || !(replies[r.id] ?? '').trim()}
                      onClick={() => void send(r.id)}
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {busy === r.id ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
