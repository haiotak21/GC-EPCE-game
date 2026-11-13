/**
 * Notification composer (§10).
 *
 * Recipients are resolved on the server from the audience you choose — the
 * browser never sends a list of who should receive it. That is what stops a
 * message meant for one team reaching another.
 */

import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Megaphone, Send, Users, User, Globe, Check } from 'lucide-react';
import type { NotificationAudience, NotificationType } from '../../lib/database.types';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
});

export const NotifyTab: React.FC = () => {
  const { groups, participants, admins, auditLogs, sendNotification } = useAdmin();

  const [audience, setAudience] = useState<NotificationAudience>('everyone');
  const [targets, setTargets] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotificationType>('announcement');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const adminName = new Map(admins.map((a) => [a.id, a.display_name]));
  const sentLog = auditLogs.filter((l) => l.action === 'SEND_NOTIFICATION');

  const toggle = (id: string) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (audience === 'everyone' || targets.length > 0);

  const send = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await sendNotification({
        title: title.trim(),
        message: message.trim(),
        type,
        audience,
        targetIds: audience === 'everyone' ? undefined : targets,
      });
      setNotice(result);
      if (result.ok) {
        setTitle('');
        setMessage('');
        setTargets([]);
      }
    } finally {
      setBusy(false);
    }
  };

  const AUDIENCES: Array<{ id: NotificationAudience; label: string; icon: React.ReactNode }> = [
    { id: 'everyone', label: 'Everyone', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'groups', label: 'Selected teams', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'participants', label: 'Selected students', icon: <User className="w-3.5 h-3.5" /> },
  ];

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

      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-400" />
          Send a message
        </h3>

        {/* Who gets it */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Send to
          </div>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setAudience(a.id);
                  setTargets([]);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                  audience === a.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {audience === 'groups' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Which teams ({targets.length} selected)
              </div>
              <button
                type="button"
                onClick={() =>
                  setTargets(targets.length === groups.length ? [] : groups.map((g) => g.id))
                }
                className="text-[10px] text-amber-400 hover:text-amber-300 font-bold"
              >
                {targets.length === groups.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    targets.includes(g.id)
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {targets.includes(g.id) && <Check className="w-3 h-3" />}
                  Group {String(g.group_number).padStart(2, '0')}
                  {g.group_name && <span className="opacity-70">· {g.group_name}</span>}
                </button>
              ))}
              {groups.length === 0 && (
                <p className="text-[11px] text-amber-400">No teams yet — run the draw first.</p>
              )}
            </div>
          </div>
        )}

        {audience === 'participants' && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Which students ({targets.length} selected)
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800">
              {participants
                .filter((p) => p.status === 'active')
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                      targets.includes(p.id)
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-slate-950/40 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {targets.includes(p.id) ? (
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    {p.full_name}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* The message */}
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title — e.g. Water station at the quad"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
          />
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message…"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 resize-none"
          />

          <div className="flex flex-wrap gap-2">
            {(['announcement', 'hint', 'game_status'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold capitalize ${
                  type === t ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Preview (§10 "Preview button") */}
        {(title || message) && (
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              How students will see it
            </div>
            <div className="text-sm font-bold text-white">{title || '(no title)'}</div>
            <p className="text-xs text-slate-300 whitespace-pre-line mt-1">{message}</p>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !canSend}
          onClick={() => void send()}
          className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>

      {/* Shared history, so every organizer sees what the others sent */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
        <h3 className="font-bold text-white text-sm">Recently sent</h3>
        <p className="text-[11px] text-slate-500">
          Every organizer sees this, including messages the others sent.
        </p>
        {sentLog.length === 0 ? (
          <p className="text-xs text-slate-500 pt-1">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-1 pt-1">
            {sentLog.slice(0, 15).map((l) => (
              <li
                key={l.id}
                className="text-xs text-slate-300 flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/50"
              >
                <span className="truncate">
                  <span className="text-amber-400 font-mono text-[10px]">
                    {(l.detail as { audience?: string })?.audience ?? 'everyone'}
                  </span>{' '}
                  · {(l.detail as { recipients?: number })?.recipients ?? 0} recipient(s) ·{' '}
                  {adminName.get(l.admin_id ?? '') ?? 'an organizer'}
                </span>
                <span className="text-[10px] text-slate-600 font-mono shrink-0">
                  {timeFmt.format(new Date(l.created_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
