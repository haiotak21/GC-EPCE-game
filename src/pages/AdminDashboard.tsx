/**
 * The organizer dashboard (§9) — one page, tabbed sections, no sub-routes.
 *
 * This replaces running SQL by hand. Every button calls a database function
 * that re-checks authorization server-side, so the dashboard holds no power
 * of its own.
 */

import React, { useState } from 'react';
import { useAdmin, type GroupWithMembers } from '../context/AdminContext';
import { CluesTab } from '../components/admin/CluesTab';
import { HelpDeskTab } from '../components/admin/HelpDeskTab';
import { WinnersTab } from '../components/admin/WinnersTab';
import { NotifyTab } from '../components/admin/NotifyTab';
import { ActivityTab } from '../components/admin/ActivityTab';
import { SettingsTab } from '../components/admin/SettingsTab';
import { Watermark } from '../components/Watermark';
import { DangerZone } from '../components/admin/DangerZone';
import type { GameStatus } from '../lib/database.types';
import {
  Shield,
  Users,
  Shuffle,
  Play,
  Pause,
  LogOut,
  CheckCircle2,
  Lock,
  Clock,
  AlertTriangle,
  RefreshCw,
  UserPlus,
} from 'lucide-react';

type Tab =
  | 'overview' | 'participants' | 'teams' | 'clues'
  | 'progress' | 'help' | 'notify' | 'winners' | 'settings' | 'activity';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'participants', label: 'Participants' },
  { id: 'teams', label: 'Teams' },
  { id: 'clues', label: 'Clues' },
  { id: 'progress', label: 'Progress' },
  { id: 'help', label: 'Help Desk' },
  { id: 'notify', label: 'Messages' },
  { id: 'winners', label: 'Winners' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
];

/** Times are stored UTC and shown in Addis Ababa (§19). */
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Addis_Ababa',
  hour: '2-digit',
  minute: '2-digit',
});
const localTime = (iso: string) => timeFmt.format(new Date(iso));

const Stat: React.FC<{ label: string; value: React.ReactNode; accent?: string }> = ({
  label,
  value,
  accent = 'text-white',
}) => (
  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-black mt-1 ${accent}`}>{value}</div>
  </div>
);

// -----------------------------------------------------------------------------


/**
 * Live feed of every checkpoint reached (§ organizers: "every reach point has
 * to display for all 3 of them"). The Progress grid shows the same facts, but
 * only if you happen to be looking at it — this is the running commentary.
 */
const LiveFeed: React.FC = () => {
  const { groups, checkpoints } = useAdmin();

  const stageOf = new Map(checkpoints.map((c) => [c.id, c.stage_number]));
  void stageOf;

  const events = groups
    .flatMap((g) =>
      Object.entries(g.stageTimes).map(([stage, at]) => ({
        key: `${g.id}-${stage}`,
        team: g.group_name?.trim() || `Group ${String(g.group_number).padStart(2, '0')}`,
        stage: Number(stage),
        at,
      }))
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  if (events.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
        <h3 className="font-bold text-white text-sm mb-1">Live activity</h3>
        <p className="text-xs text-slate-500">No checkpoints reached yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
      <h3 className="font-bold text-white text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Live activity
      </h3>
      <p className="text-[11px] text-slate-500">
        Every checkpoint reached, newest first. All three organizers see this.
      </p>
      <ul className="space-y-1 pt-1">
        {events.map((e) => (
          <li
            key={e.key}
            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/50 text-xs"
          >
            <span className="text-slate-200 truncate">
              <span className="font-semibold text-white">{e.team}</span>
              {e.stage === 4 ? ' finished the hunt' : ` reached checkpoint ${e.stage}`}
            </span>
            <span className="text-[10px] text-slate-600 font-mono shrink-0">
              {localTime(e.at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const OverviewTab: React.FC = () => {
  const { game, participants, groups, unassigned, helpRequests, setGameStatus } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);

  const pendingHelp = helpRequests.filter((h) => h.status === 'pending').length;
  const finished = groups.filter((g) => g.completedStage === 4).length;

  const act = async (label: string, status: GameStatus) => {
    setBusy(label);
    try {
      await setGameStatus(status);
    } finally {
      setBusy(null);
    }
  };

  const controls: Array<{ label: string; status: GameStatus; icon: React.ReactNode; tone: string }> =
    [
      {
        label: 'Open registration',
        status: 'REGISTRATION',
        icon: <Users className="w-4 h-4" />,
        tone: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
      },
      {
        label: 'Close registration',
        status: 'WAITING',
        icon: <Lock className="w-4 h-4" />,
        tone: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
      },
      {
        label: 'Start game',
        status: 'ACTIVE',
        icon: <Play className="w-4 h-4" />,
        tone: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold',
      },
      {
        label: 'Pause',
        status: 'PAUSED',
        icon: <Pause className="w-4 h-4" />,
        tone: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold',
      },
      {
        label: 'Finish game',
        status: 'FINISHED',
        icon: <CheckCircle2 className="w-4 h-4" />,
        tone: 'bg-slate-800 hover:bg-slate-700 text-slate-200',
      },
    ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Registered" value={participants.filter((p) => p.status === 'active').length} />
        <Stat label="Teams" value={groups.length} />
        <Stat
          label="Unassigned"
          value={unassigned.length}
          accent={unassigned.length ? 'text-amber-400' : 'text-white'}
        />
        <Stat
          label="Pending help"
          value={pendingHelp}
          accent={pendingHelp ? 'text-rose-400' : 'text-white'}
        />
      </div>

      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Game status
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              {game?.status ?? '—'}
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {finished > 0 && `${finished} team(s) finished all 4 stages`}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {controls.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={busy !== null || game?.status === c.status}
              onClick={() => act(c.label, c.status)}
              className={`px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors disabled:opacity-40 ${c.tone}`}
            >
              {c.icon}
              <span>{busy === c.label ? 'Working…' : c.label}</span>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Pausing stops checkpoint verification for everyone without losing any progress. Resume by
          pressing Start game again. Finishing is also reversible — press Start game to reopen.
        </p>
      </div>

      <LiveFeed />

      <DangerZone />
    </div>
  );
};

// -----------------------------------------------------------------------------

const ParticipantsTab: React.FC = () => {
  const { participants, groups, removeParticipant, reinstateParticipant, moveParticipant } =
    useAdmin();
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'remove' | 'move' | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const groupOf = new Map<string, number>();
  for (const g of groups) for (const m of g.members) groupOf.set(m.id, g.group_number);

  const rows = participants.filter((p) =>
    p.full_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const close = () => {
    setActing(null);
    setMode(null);
    setReason('');
    setTarget('');
  };

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const result = await fn();
      setNotice(result);
      if (result.ok) close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
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

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="w-full sm:max-w-xs px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
      />

      <div className="space-y-2">
        {rows.map((p) => {
          const removed = p.status === 'removed';
          const open = acting === p.id;
          return (
            <div
              key={p.id}
              className={`p-3 rounded-xl border ${
                removed ? 'bg-slate-950/30 border-slate-800/60' : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${removed ? 'text-slate-500 line-through' : 'text-white'}`}>
                    {p.full_name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {localTime(p.registered_at)} ·{' '}
                    {removed ? (
                      <span className="text-rose-400">removed</span>
                    ) : groupOf.has(p.id) ? (
                      <span className="text-amber-300">
                        Group {String(groupOf.get(p.id)).padStart(2, '0')}
                      </span>
                    ) : (
                      'unassigned'
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0">
                  {removed ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => reinstateParticipant(p.id))}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold"
                    >
                      Reinstate
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setActing(p.id);
                          setMode('move');
                          setTarget('');
                          setReason('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActing(p.id);
                          setMode('remove');
                          setReason('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 text-[11px] font-bold"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              {open && mode === 'move' && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  >
                    <option value="">— take them out of their team —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Group {String(g.group_number).padStart(2, '0')}
                        {g.group_name ? ` · ${g.group_name}` : ''} ({g.members.length} members)
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
                      disabled={busy}
                      onClick={() => void run(() => moveParticipant(p.id, target || null, reason))}
                      className="px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-[11px] font-bold"
                    >
                      {busy ? 'Moving…' : 'Move'}
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {open && mode === 'remove' && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <p className="text-[11px] text-rose-300">
                    Removes them from the game and their team. Reversible — they can be reinstated.
                  </p>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason, e.g. registered twice"
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void run(() => removeParticipant(p.id, reason))}
                      className="px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white text-[11px] font-bold"
                    >
                      {busy ? 'Removing…' : 'Remove'}
                    </button>
                    <button
                      type="button"
                      onClick={close}
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

        {rows.length === 0 && (
          <p className="text-center text-slate-500 text-xs py-8">No students yet.</p>
        )}
      </div>
    </div>
  );
};

const TeamsTab: React.FC = () => {
  const {
    game,
    groups,
    unassigned,
    participants,
    preview,
    previewTeams,
    clearPreview,
    publishTeams,
    assignLateParticipants,
    resetTeams,
    setGameStatus,
  } = useAdmin();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const nameOf = new Map(participants.map((p) => [p.id, p.full_name]));
  const drawn = groups.length > 0;

  // Teams may only be drawn once registration is closed, so the roster cannot
  // change underneath the draw. Closing registration is therefore step one of
  // this tab, not something to go hunting for on another screen.
  const registrationOpen = game?.registration_open ?? false;

  const run = async (fn: () => Promise<{ ok: boolean; message: string } | void>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result) setNotice(result);
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

      {/* The action panel is always visible — the draw is not a one-time event. */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-white">{drawn ? 'Manage teams' : 'Assign teams'}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-md">
              {drawn
                ? `${groups.length} team(s) published. ${
                    unassigned.length
                      ? `${unassigned.length} student(s) registered later and still need a team.`
                      : 'Everyone has a team.'
                  }`
                : `Randomly splits the ${unassigned.length} registered student(s) into teams of 2. If the number is odd, one team gets 3 so nobody is left alone. Nobody is told until you press Publish.`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black text-white">{unassigned.length}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">unassigned</div>
          </div>
        </div>

        {/* Step 1: close registration. Shown only while it is still open. */}
        {!drawn && registrationOpen && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-300">
                  Close registration before assigning teams
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed mt-1">
                  Teams can only be drawn once the list of students is final. Closing registration
                  stops anyone new joining, and every student waiting is told immediately.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => run(async () => void (await setGameStatus('WAITING')))}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Close registration ({unassigned.length} registered)</span>
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!drawn && (
            <button
              type="button"
              onClick={() => run(previewTeams)}
              disabled={busy || registrationOpen || unassigned.length < 2}
              title={
                registrationOpen ? 'Close registration first' : undefined
              }
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center gap-2"
            >
              <Shuffle className="w-4 h-4" />
              <span>{preview ? 'Shuffle again' : 'Assign teams'}</span>
            </button>
          )}

          {/* Lets an organizer undo an early close. */}
          {!drawn && !registrationOpen && (
            <button
              type="button"
              onClick={() => run(async () => void (await setGameStatus('REGISTRATION')))}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>Reopen registration</span>
            </button>
          )}

          {!drawn && preview && (
            <>
              <button
                type="button"
                onClick={() => run(publishTeams)}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Publish teams</span>
              </button>
              <button
                type="button"
                onClick={clearPreview}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Discard
              </button>
            </>
          )}

          {/* §9.2 late registrations */}
          {drawn && (
            <button
              type="button"
              onClick={() => run(assignLateParticipants)}
              disabled={busy || unassigned.length === 0}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Assign {unassigned.length || ''} late student(s)</span>
            </button>
          )}

          {drawn &&
            (confirmReset ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmReset(false);
                    await run(resetTeams);
                  }}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white font-bold text-xs"
                >
                  Yes, clear all teams
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-2"
              >
                <Shuffle className="w-4 h-4" />
                <span>Redo the draw</span>
              </button>
            ))}
        </div>

        {!drawn && !registrationOpen && unassigned.length < 2 && (
          <p className="text-[11px] text-amber-400">
            At least 2 students must register before teams can be made.
          </p>
        )}

        {confirmReset && (
          <p className="text-[11px] text-rose-300 leading-relaxed">
            This deletes every team so you can draw again. It is refused if any team has already
            verified a checkpoint, so you cannot wipe out real progress by accident.
          </p>
        )}

        {preview && (
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              Preview — not yet visible to students
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {preview.groups.map((g) => (
                <div
                  key={g.group_number}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800"
                >
                  <div className="text-xs font-black text-white">
                    Group {String(g.group_number).padStart(2, '0')}
                    <span className="ml-2 text-[10px] text-slate-500 font-normal">
                      {g.participant_ids.length} members
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {g.participant_ids.map((id) => (
                      <li key={id} className="text-xs text-slate-300">
                        {nameOf.get(id) ?? id}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {preview.pending_participant_ids.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                <strong>Needs your decision:</strong>{' '}
                {preview.pending_participant_ids.map((id) => nameOf.get(id) ?? id).join(', ')} — one
                student was left over and cannot form a team alone.
              </div>
            )}
          </div>
        )}
      </div>

      {drawn && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

const GroupCard: React.FC<{ group: GroupWithMembers }> = ({ group }) => (
  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
    <div className="flex items-baseline justify-between">
      <div className="font-black text-white">
        Group {String(group.group_number).padStart(2, '0')}
      </div>
      <div className="text-[10px] font-mono text-amber-400">{group.completedStage}/4</div>
    </div>
    {group.group_name && (
      <div className="text-xs text-amber-300 font-semibold">{group.group_name}</div>
    )}
    <ul className="space-y-0.5">
      {group.members.map((m) => (
        <li key={m.id} className="text-xs text-slate-300">
          {m.full_name}
        </li>
      ))}
    </ul>
  </div>
);

// -----------------------------------------------------------------------------

const ProgressTab: React.FC = () => {
  const { groups, undoVerification } = useAdmin();
  const [undoing, setUndoing] = useState<{ groupId: string; stage: number } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No teams yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Visible to organizers only. Times shown in Addis Ababa time. Tap a green tick to undo a
        checkpoint verified by mistake.
      </p>

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

      {undoing && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
          <p className="text-xs text-rose-200 leading-relaxed">
            Undo checkpoint {undoing.stage} for this team? Later checkpoints are undone too, because
            progress has to stay an unbroken run — otherwise they could never scan again. If this
            cost them a placing, that is removed as well.
          </p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded in the activity log)"
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  setNotice(await undoVerification(undoing.groupId, undoing.stage, reason));
                  setUndoing(null);
                  setReason('');
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white text-[11px] font-bold"
            >
              {busy ? 'Undoing…' : 'Undo it'}
            </button>
            <button
              type="button"
              onClick={() => {
                setUndoing(null);
                setReason('');
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-bold">Team</th>
              {[1, 2, 3, 4].map((s) => (
                <th key={s} className="px-3 py-3 font-bold text-center">
                  Clue {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {groups.map((g) => (
              <tr key={g.id} className="bg-slate-950/40">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">
                    Group {String(g.group_number).padStart(2, '0')}
                  </div>
                  {g.group_name && (
                    <div className="text-[10px] text-slate-500">{g.group_name}</div>
                  )}
                </td>
                {[1, 2, 3, 4].map((stage) => {
                  const done = g.stageTimes[stage];
                  const isNext = g.completedStage + 1 === stage;
                  return (
                    <td key={stage} className="px-3 py-3 text-center">
                      {done ? (
                        <button
                          type="button"
                          onClick={() => setUndoing({ groupId: g.id, stage })}
                          title="Undo this verification"
                          className="flex flex-col items-center mx-auto hover:opacity-70 transition-opacity"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                            {localTime(done)}
                          </span>
                        </button>
                      ) : isNext ? (
                        <Clock className="w-4 h-4 text-amber-400 mx-auto" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-700 mx-auto" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------

export const AdminDashboard: React.FC<{ onSignedOut: () => void }> = ({ onSignedOut }) => {
  const { ready, isAdmin, me, game, helpRequests, signOut, refresh } = useAdmin();
  const pendingHelp = helpRequests.filter((h) => h.status === 'pending').length;
  const [tab, setTab] = useState<Tab>('overview');

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center p-4">
        <div className="max-w-sm w-full p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
          <p className="text-sm text-rose-300">You are not signed in as an organizer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-black text-white truncate">
                {game?.title ?? 'EPCE GC 2019'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {me?.display_name} · {me?.role.replace('_', ' ')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void refresh()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                onSignedOut();
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
              {t.id === 'help' && pendingHelp > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black align-middle">
                  {pendingHelp}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'participants' && <ParticipantsTab />}
        {tab === 'teams' && <TeamsTab />}
        {tab === 'clues' && <CluesTab />}
        {tab === 'progress' && <ProgressTab />}
        {tab === 'help' && <HelpDeskTab />}
        {tab === 'notify' && <NotifyTab />}
        {tab === 'winners' && <WinnersTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'activity' && <ActivityTab />}

        <Watermark />
      </main>
    </div>
  );
};
