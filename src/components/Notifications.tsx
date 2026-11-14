/**
 * Notifications (§4): a popup for anything new, and a history list.
 *
 * Duplicate suppression (§4 "Avoid duplicate popup displays when a realtime
 * event is delivered twice") falls out of using the database as the source of
 * truth: a popup is shown only while its recipient row has `read_at` null, and
 * dismissing it writes the timestamp. A repeated realtime event re-reads the
 * same row and finds it already read, so nothing pops twice — and this holds
 * across tabs and devices, which a local "seen" list would not.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Bell,
  Megaphone,
  Users,
  Compass,
  LifeBuoy,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { useLiveGame } from '../context/LiveGameContext';
import type { NotificationType } from '../lib/database.types';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
});

const ICONS: Record<NotificationType, React.ReactNode> = {
  announcement: <Megaphone className="w-4 h-4 text-amber-400" />,
  team_assignment: <Users className="w-4 h-4 text-indigo-400" />,
  hint: <Compass className="w-4 h-4 text-amber-400" />,
  help_reply: <LifeBuoy className="w-4 h-4 text-sky-400" />,
  game_status: <AlertTriangle className="w-4 h-4 text-rose-400" />,
  winners: <Trophy className="w-4 h-4 text-amber-400" />,
};

/**
 * Pops the oldest unread notification. Team reveals are excluded — the home
 * page already shows a dedicated reveal overlay for those, and two popups
 * stacked on top of each other reads as a bug.
 */
export const NotificationPopup: React.FC = () => {
  const { notifications, markRead, markAllRead } = useLiveGame();
  const [busy, setBusy] = useState(false);

  const pending = notifications
    .filter((n) => !n.read_at && n.type !== 'team_assignment')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const current = pending[0];

  // Announcements about other teams close themselves, so a popup can never
  // block someone who is mid-scan. The team's own result has no timer.
  const autoSeconds = Number(
    (current?.payload as { auto_dismiss_seconds?: number } | null)?.auto_dismiss_seconds ?? 0
  );
  const [remaining, setRemaining] = useState(autoSeconds);

  const dismiss = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await markRead(current.id);
    } finally {
      setBusy(false);
    }
  }, [current, busy, markRead]);

  // Restart the countdown whenever a different message comes to the front.
  useEffect(() => {
    setRemaining(autoSeconds);
  }, [current?.id, autoSeconds]);

  useEffect(() => {
    if (!current || autoSeconds <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          void dismiss();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [current?.id, autoSeconds, dismiss, current]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              {ICONS[current.type]}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-amber-400">
                🔔 New notification
              </div>
              <h2 className="text-base font-black text-white">{current.title}</h2>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 max-h-60 overflow-y-auto">
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              {current.message}
            </p>
          </div>

          {pending.length > 1 && (
            <p className="text-[10px] text-slate-500 text-center">
              {pending.length - 1} more after this
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-black text-sm"
            >
              {busy ? '…' : autoSeconds > 0 ? `Cancel${remaining > 0 ? ` (${remaining})` : ''}` : 'Got it'}
            </button>

            {/* Without this, a backlog means tapping "Got it" once per message. */}
            {pending.length > 1 && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await markAllRead();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold"
              >
                Dismiss all {pending.length} messages
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


/** One message, opened full-size from the history list. Closeable. */
const MessageReader: React.FC<{
  notification: { id: string; title: string; message: string; type: NotificationType; created_at: string };
  onClose: () => void;
}> = ({ notification, onClose }) => (
  <div
    className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="message-reader-title"
  >
    <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              {ICONS[notification.type]}
            </div>
            <div className="min-w-0">
              <h2 id="message-reader-title" className="text-base font-black text-white">
                {notification.title}
              </h2>
              <div className="text-[10px] text-slate-500 font-mono">
                {timeFmt.format(new Date(notification.created_at))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
            aria-label="Close message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 max-h-72 overflow-y-auto">
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            {notification.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm"
        >
          Close
        </button>
      </div>
    </div>
  </div>
);

/** Full history (§4 "Allow users to open older messages"). */
export const NotificationsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { notifications, markRead, markAllRead } = useLiveGame();
  const unread = notifications.filter((n) => !n.read_at).length;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = notifications.find((n) => n.id === openId) ?? null;

  return (
    <>
      {open && <MessageReader notification={open} onClose={() => setOpenId(null)} />}

    <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-md z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bell className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-black text-white">Messages</h2>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No messages yet.</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpenId(n.id);
                      if (!n.read_at) void markRead(n.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                      n.read_at
                        ? 'bg-slate-950/50 border-slate-800'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5">{ICONS[n.type]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3
                            className={`text-sm font-bold ${n.read_at ? 'text-slate-300' : 'text-white'}`}
                          >
                            {n.title}
                          </h3>
                          <span className="text-[9px] text-slate-600 font-mono shrink-0">
                            {timeFmt.format(new Date(n.created_at))}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed mt-1 whitespace-pre-line">
                          {n.message}
                        </p>
                        {!n.read_at && (
                          <span className="inline-block mt-1.5 text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                            New · tap to open
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
