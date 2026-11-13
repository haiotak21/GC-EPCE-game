/**
 * Shared activity log (§18).
 *
 * Every organizer sees every organizer's actions, by name and time. That is
 * what keeps three people running one game honest — nobody can quietly change
 * a result, reassign a team or reveal winners without the others seeing it.
 */

import React from 'react';
import { useAdmin } from '../../context/AdminContext';
import { History, Shield } from 'lucide-react';

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Plain English for each logged action. */
const DESCRIBE: Record<string, string> = {
  PUBLISH_TEAMS: 'Published the teams',
  RESET_TEAMS: 'Cleared all teams to redraw',
  ASSIGN_LATE_PARTICIPANTS: 'Placed students who registered late',
  SET_GAME_STATUS: 'Changed the game status',
  SEND_NOTIFICATION: 'Sent a message',
  ANSWER_HELP_REQUEST: 'Replied to a help request',
  UPSERT_HINT: 'Edited a clue',
  PUBLISH_HINT: 'Published a clue',
  UNPUBLISH_HINT: 'Hid a clue',
  ISSUE_CHECKPOINT_CODE: 'Generated a checkpoint code',
  PROVISION_CHECKPOINTS: 'Generated checkpoint codes',
  SET_WINNER_SELECTION: 'Chose the winners (still private)',
  REVEAL_WINNERS: 'Revealed the winners',
};

const TONE: Record<string, string> = {
  REVEAL_WINNERS: 'text-amber-300',
  RESET_TEAMS: 'text-rose-300',
  PUBLISH_TEAMS: 'text-emerald-300',
  SET_GAME_STATUS: 'text-sky-300',
};

export const ActivityTab: React.FC = () => {
  const { auditLogs, admins } = useAdmin();
  const nameOf = new Map(admins.map((a) => [a.id, a.display_name]));

  const detailOf = (action: string, detail: unknown): string => {
    const d = (detail ?? {}) as Record<string, unknown>;
    switch (action) {
      case 'SET_GAME_STATUS':
        return `${d.from} → ${d.to}`;
      case 'PUBLISH_TEAMS':
        return `${d.groups} team(s)`;
      case 'SEND_NOTIFICATION':
        return `${d.audience} · ${d.recipients} recipient(s)`;
      case 'UPSERT_HINT':
      case 'PUBLISH_HINT':
      case 'UNPUBLISH_HINT':
      case 'ISSUE_CHECKPOINT_CODE':
        return `clue ${d.stage}${d.group_number ? ` · Group ${d.group_number}` : ' · all teams'}`;
      case 'ASSIGN_LATE_PARTICIPANTS':
        return `${d.placed} placed${d.still_pending ? `, ${d.still_pending} pending` : ''}`;
      case 'RESET_TEAMS':
        return `${d.groups_removed} team(s) removed`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-amber-400" />
        <h3 className="font-bold text-white text-sm">Activity log</h3>
      </div>

      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2">
        <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Every organizer action is recorded here and visible to all three of you. Nothing can be
          changed or deleted — it is written by the database itself, not by this page.
        </p>
      </div>

      {auditLogs.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing has happened yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
          {auditLogs.map((l) => (
            <div
              key={l.id}
              className="p-3 bg-slate-950/40 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <div className={`text-xs font-bold ${TONE[l.action] ?? 'text-slate-200'}`}>
                  {DESCRIBE[l.action] ?? l.action}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {nameOf.get(l.admin_id ?? '') ?? 'System'}
                  {detailOf(l.action, l.detail) && (
                    <span className="text-slate-600"> · {detailOf(l.action, l.detail)}</span>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-600 font-mono shrink-0">
                {stamp.format(new Date(l.created_at))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
