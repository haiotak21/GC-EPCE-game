/**
 * The team's current clue, plus the stage tracker (§5).
 *
 * Note what is NOT here: any check for whether a clue should be hidden. The
 * database only ever sends clues this team has earned, so a locked clue is not
 * hidden in the UI — it never arrives. Guessing a URL, reading the page source
 * or editing the JavaScript gains nothing.
 */

import React, { useState } from 'react';
import { Compass, Lock, CheckCircle2, Volume2, ExternalLink, QrCode } from 'lucide-react';
import type { Hint } from '../lib/database.types';

export const StageTracker: React.FC<{ completedStage: number }> = ({ completedStage }) => (
  <div className="flex items-center gap-1.5">
    {[1, 2, 3, 4].map((stage) => {
      const done = stage <= completedStage;
      const current = stage === completedStage + 1;
      return (
        <React.Fragment key={stage}>
          <div
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              done ? 'bg-emerald-400' : current ? 'bg-amber-400' : 'bg-slate-800'
            }`}
            title={done ? `Stage ${stage} complete` : current ? `Stage ${stage} in progress` : `Stage ${stage} locked`}
          />
        </React.Fragment>
      );
    })}
  </div>
);

export const ClueCard: React.FC<{
  hints: Hint[];
  completedStage: number;
  gameStatus: string | undefined;
  onScan: () => void;
}> = ({ hints, completedStage, gameStatus, onScan }) => {
  const [showMedia, setShowMedia] = useState(false);

  // The highest-numbered clue the database let through is the current one.
  const published = hints.filter((h) => h.published_at);
  const current = published.length
    ? published.reduce((a, b) => (a.hint_number > b.hint_number ? a : b))
    : null;

  const finished = completedStage >= 4;

  if (finished) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-3xl p-6 text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-xl font-black text-white">All four stages complete!</h2>
        <p className="text-xs text-emerald-200 leading-relaxed">
          Head to the finish line and find an organizer. Results will appear here.
        </p>
      </div>
    );
  }

  if (gameStatus === 'PAUSED') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/40 rounded-3xl p-6 text-center space-y-2">
        <h2 className="text-lg font-black text-white">Game paused</h2>
        <p className="text-xs text-amber-200 leading-relaxed">
          The organizers have paused the hunt. Your progress is safe — stay where you are.
        </p>
      </div>
    );
  }

  if (gameStatus !== 'ACTIVE') {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-600 mx-auto" />
        <h2 className="text-base font-black text-white">The hunt has not started</h2>
        <p className="text-xs text-slate-400">Your first clue appears here the moment it does.</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 text-center space-y-2">
        <Compass className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
        <h2 className="text-base font-black text-white">Waiting for your next clue</h2>
        <p className="text-xs text-slate-400">
          The organizers are releasing it. It will appear here automatically.
        </p>
      </div>
    );
  }

  const isAudio = current.media_url?.match(/\.(mp3|m4a|ogg|wav)$/i);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

      <div className="p-5 sm:p-6 space-y-4">
        <div className="space-y-3">
          <StageTracker completedStage={completedStage} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              Clue {current.hint_number} of 4
            </span>
            <span className="text-[10px] text-slate-500">
              {completedStage} of 4 checkpoints done
            </span>
          </div>
        </div>

        <h2 className="text-xl font-black text-white leading-tight">{current.title}</h2>

        {current.description && (
          <p className="text-xs text-slate-400 leading-relaxed">{current.description}</p>
        )}

        {current.content && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              {current.content}
            </p>
          </div>
        )}

        {current.media_url && (
          <div className="space-y-2">
            {isAudio ? (
              <audio controls src={current.media_url} className="w-full">
                <track kind="captions" />
              </audio>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowMedia((s) => !s)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  {showMedia ? 'Hide image' : 'Show image'}
                </button>
                {showMedia && (
                  <img
                    src={current.media_url}
                    alt={`Clue ${current.hint_number}`}
                    className="w-full rounded-xl border border-slate-800"
                  />
                )}
              </>
            )}
          </div>
        )}

        {current.external_link && (
          <a
            href={current.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open link
          </a>
        )}

        <button
          type="button"
          onClick={onScan}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
        >
          <QrCode className="w-4 h-4" />
          I found it — verify checkpoint
        </button>
      </div>
    </div>
  );
};
