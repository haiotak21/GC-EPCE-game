/**
 * The student's entire experience, on one page (§2, §22).
 *
 * It is a single page that changes shape as the game moves:
 *   not registered  -> name popup
 *   registered      -> waiting for the organizer
 *   teams published -> team reveal, then the team card
 *
 * Everything arrives over Realtime, so nobody is ever told to refresh.
 */

import React, { useEffect, useState } from 'react';
import { useLiveGame } from '../context/LiveGameContext';
import { ClueCard } from '../components/ClueCard';
import { CheckpointScanner } from '../components/CheckpointScanner';
import { HelpPanel } from '../components/HelpPanel';
import { NotificationPopup, NotificationsPanel } from '../components/Notifications';
import { WinnersPodium } from '../components/WinnersPodium';
import { PostPodiumVote } from '../components/PostPodiumVote';
import { Watermark } from '../components/Watermark';
import {
  Compass,
  Users,
  ArrowRight,
  ShieldCheck,
  Copy,
  Check,
  AlertTriangle,
  Bell,
  LifeBuoy,
  Pencil,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Registration popup (§3.1)
// -----------------------------------------------------------------------------

const RegistrationPopup: React.FC = () => {
  const { register, recoverSession, game } = useLiveGame();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');

  /** §3.1 — gets a student back in on a new phone, or after clearing data. */
  const recover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !recoveryInput.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (!(await recoverSession(recoveryInput.trim()))) {
        setError('That code was not recognised. Check it and try again.');
      }
    } catch {
      setError('Connection problem. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const registrationClosed = game ? !game.registration_open || game.status !== 'REGISTRATION' : false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return; // §3.1 "Prevent repeated registrations caused by double-clicking"

    const clean = name.trim();
    if (clean.length < 2) {
      setError('Please enter your full name.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await register(clean);
      if (!result.ok) {
        setError(
          result.code === 'REGISTRATION_CLOSED'
            ? 'Registration has closed. Please speak to an organizer.'
            : result.code === 'NAME_TOO_SHORT'
              ? 'Please enter your full name.'
              : 'Could not register. Please try again.'
        );
      }
    } catch {
      setError('Connection problem. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Compass className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black text-white">🎉 Welcome to EPCE GC 2019!</h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Enter your name to join the campus challenge.
          </p>
        </div>

        {registrationClosed ? (
          /* The organizer has closed the list so teams can be drawn (§3.1). */
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-center">
            <div className="text-sm font-bold text-amber-300">Registration is closed</div>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              The organizers have closed sign-ups so they can put the teams together. No new players
              can join now.
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              If you already registered on another phone, use your recovery code below. Otherwise
              please find an organizer.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="full-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  id="full-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Abebe Kebede"
                  autoFocus
                  autoComplete="name"
                  disabled={busy}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                <span>{busy ? 'Joining…' : 'Join Challenge'}</span>
                {!busy && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </>
        )}

        {/* §3.1 recovery — always reachable, including once registration shuts. */}
        <div className="pt-1 border-t border-slate-800 space-y-3">
          {showRecovery ? (
            <form onSubmit={recover} className="space-y-2">
              <label htmlFor="recovery-code" className="block text-xs font-semibold text-slate-300">
                Your recovery code
              </label>
              <div className="flex gap-2">
                <input
                  id="recovery-code"
                  type="text"
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="e.g. VD6QDHTX"
                  autoFocus
                  autoCapitalize="characters"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono uppercase text-center tracking-wider focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={busy || !recoveryInput.trim()}
                  className="px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs"
                >
                  Restore
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowRecovery(false)}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Back
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowRecovery(true)}
              className="w-full text-[11px] text-slate-400 hover:text-amber-300 transition-colors"
            >
              Already registered on another phone? Use your recovery code
            </button>
          )}

          <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>No email or phone needed</span>
          </div>

          <Watermark />
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Recovery code, shown once after registering (§3.1)
// -----------------------------------------------------------------------------

const RecoveryCodeCard: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
      <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
        Save this code
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        If you lose this page or switch phones, this code gets you back in. It is shown only once.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-mono text-lg tracking-widest text-center">
          {code}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Team reveal (§3.3)
// -----------------------------------------------------------------------------

const TeamRevealOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { myGroup, teammates } = useLiveGame();
  if (!myGroup) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl p-7 max-w-md w-full space-y-5 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        <div className="space-y-1">
          <div className="text-xs font-mono uppercase tracking-wider font-bold text-amber-400">
            🎉 Your team is ready!
          </div>
          <h2 className="text-4xl font-black text-white tracking-tight">
            GROUP {String(myGroup.group_number).padStart(2, '0')}
          </h2>
          {myGroup.group_name && (
            <div className="text-sm text-amber-300 font-semibold">{myGroup.group_name}</div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Your teammates
          </div>
          <ul className="space-y-1.5">
            {teammates.map((t) => (
              <li key={t.id} className="text-sm text-white font-medium">
                {t.full_name}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20"
        >
          Meet My Team
        </button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// The page
// -----------------------------------------------------------------------------

/** Lets the team name itself (§3.3). */
const TeamNameEditor: React.FC<{ current: string | null; onClose: () => void }> = ({
  current,
  onClose,
}) => {
  const { renameGroup } = useLiveGame();
  const [name, setName] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      const result = await renameGroup(name.trim());
      if (result.ok) {
        onClose();
      } else if (result.code === 'VERSION_CONFLICT') {
        // §3.3 — a teammate renamed first; show theirs rather than overwriting.
        setError(
          `A teammate just named your team "${result.current_name}". Close and reopen to change it.`
        );
      } else {
        setError('Could not save that name.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[55] flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <h2 className="text-lg font-black text-white">Name your team</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your group number never changes — this is just a nickname everyone on the team will see.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            {error}
          </div>
        )}

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Detectives"
          maxLength={40}
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || name.trim().length < 2}
            className="py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-xs font-black"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};


/**
 * Shown when an organizer opens the student page in the browser they signed
 * into the dashboard with.
 *
 * Registering here would attach their player record to the organizer account,
 * and the database shows organizers everything — so that student would see
 * every team's clues and messages. It happened in testing to all three
 * organizers at once, and nothing on screen hinted at it.
 */
const OrganizerSessionNotice: React.FC = () => {
  const { switchToStudentSession } = useLiveGame();
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-indigo-500/40 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          </div>
          <h2 className="text-lg font-black text-white">You are signed in as an organizer</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            This browser is signed into the organizer dashboard. If you join the hunt here, your
            player account is tied to the organizer account — and organizers can see every team, so
            you would get other teams' clues and messages.
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await switchToStudentSession();
              } finally {
                setBusy(false);
              }
            }}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-60 text-slate-950 font-black text-sm"
          >
            {busy ? 'Switching…' : 'Sign out and play as a student'}
          </button>

          <a
            href="/admin"
            className="block w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs text-center"
          >
            Go to the organizer dashboard
          </a>
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed text-center">
          Best of all: keep one browser for the dashboard and a different one (or a private window)
          for playing.
        </p>

        <Watermark />
      </div>
    </div>
  );
};

export const StudentHome: React.FC = () => {
  const {
    ready,
    fatalError,
    isOrganizerSession,
    game,
    me,
    myGroup,
    teammates,
    hints,
    completedStage,
    recoveryCode,
    unreadCount,
  } = useLiveGame();

  const [revealSeen, setRevealSeen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'scan' | 'help' | 'messages' | 'rename'>('none');

  // Show the reveal overlay the first time a group appears for this student.
  useEffect(() => {
    if (!myGroup) setRevealSeen(false);
  }, [myGroup]);

  if (fatalError) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
          <div className="flex items-center gap-2 text-rose-300 font-bold">
            <AlertTriangle className="w-5 h-5" />
            <span>Cannot reach the game</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{fatalError}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Connecting…</span>
        </div>
      </div>
    );
  }

  // An organizer in the wrong browser is warned before anything else: joining
  // here is what produced the cross-team leak in testing.
  if (isOrganizerSession) return <OrganizerSessionNotice />;

  if (!me) return <RegistrationPopup />;

  const showReveal = myGroup && !revealSeen;

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-8 px-4 sm:px-6 max-w-xl mx-auto space-y-5 pb-24">
      {showReveal && <TeamRevealOverlay onClose={() => setRevealSeen(true)} />}

      {/* Popups for anything new, suppressed while the reveal is showing. */}
      {!showReveal && panel === 'none' && <NotificationPopup />}

      {panel === 'scan' && <CheckpointScanner onClose={() => setPanel('none')} />}
      {panel === 'help' && <HelpPanel onClose={() => setPanel('none')} />}
      {panel === 'messages' && <NotificationsPanel onClose={() => setPanel('none')} />}
      {panel === 'rename' && myGroup && (
        <TeamNameEditor current={myGroup.group_name} onClose={() => setPanel('none')} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-white truncate">Welcome, {me.full_name}! 👋</h1>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
            {game?.title ?? 'EPCE GC 2019'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPanel('messages')}
          className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 shrink-0"
          aria-label={`Messages${unreadCount ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {recoveryCode && <RecoveryCodeCard code={recoveryCode} />}

      {!myGroup ? (
        /* §3.2 waiting state */
        <div className="bg-slate-900/90 rounded-3xl p-7 border border-slate-800 text-center space-y-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Users className="w-7 h-7 text-amber-400" />
          </div>

          <div className="space-y-1">
            <div className="text-emerald-400 text-sm font-bold">🎉 Registration successful!</div>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-400 pt-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Waiting for the organizers to assign your team</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Your group number and teammates will appear here automatically. You do not need to
            refresh this page.
          </p>
        </div>
      ) : (
        <>
          {/* Results, announced automatically as teams finish */}
          <WinnersPodium />

          {/* Carry on or stop? Opens 5 minutes after third place. */}
          <PostPodiumVote refreshKey={completedStage} />

          {/* The clue, and the way to verify it (§5, §6) */}
          <ClueCard
            hints={hints}
            completedStage={completedStage}
            gameStatus={game?.status}
            onScan={() => setPanel('scan')}
          />

          {/* §7 Need Help */}
          <button
            type="button"
            onClick={() => setPanel('help')}
            className="w-full py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-sky-500/40 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LifeBuoy className="w-4 h-4 text-sky-400" />
            Need help?
          </button>

          {/* §3.3 team card */}
          <div className="bg-slate-900/90 rounded-3xl p-5 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Your squad
                </div>
                <h2 className="text-lg font-black text-white">
                  GROUP {String(myGroup.group_number).padStart(2, '0')}
                </h2>
                {myGroup.group_name && (
                  <div className="text-sm text-amber-300 font-semibold truncate">
                    {myGroup.group_name}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPanel('rename')}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                aria-label="Name your team"
                title="Name your team"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {teammates.map((t) => (
                <li key={t.id} className="text-xs text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {t.full_name}
                  {t.id === me.id && <span className="text-[10px] text-slate-600">(you)</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="flex items-center justify-center gap-2 text-[11px] text-slate-600">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>Live — updates appear automatically</span>
      </div>

      <Watermark />
    </div>
  );
};
