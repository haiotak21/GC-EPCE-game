import React from 'react';
import { useGame } from '../context/GameContext';
import {
  CheckCircle2,
  Lock,
  ChevronRight,
  Headphones,
  FileText,
  KeyRound,
  Sparkles,
} from 'lucide-react';

export const HintsTimelinePage: React.FC<{
  navigate: (path: string) => void;
  onSelectClue: (clueId: string) => void;
}> = ({ navigate, onSelectClue }) => {
  const { store, myGroup, t, language } = useGame();

  const myCompletedStages = store.progress
    .filter((p) => myGroup && p.groupId === myGroup.id)
    .map((p) => p.stage);

  const highestDone = myCompletedStages.length > 0 ? Math.max(...myCompletedStages) : 0;
  const currentStageNum = (highestDone < 4 ? highestDone + 1 : 4) as 1 | 2 | 3 | 4;

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Campus Journey Timeline</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">{t.hints_title}</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          {language === 'am'
            ? 'አራት ተከታታይ ደረጃዎች። ያለፉትን ይመልከቱ፣ አሁን ያለዎትን ይፍቱ፣ ወደፊት ያሉትን ይጠብቁ።'
            : 'Four sequential campus stages. Review completed hints and solve the active mystery.'}
        </p>
      </div>

      {/* 4 Connected Stages Timeline */}
      <div className="space-y-4 relative before:absolute before:left-5 before:top-6 before:bottom-6 before:w-0.5 before:bg-slate-800">
        {store.clues.map((clue) => {
          const isDone = myCompletedStages.includes(clue.stage);
          const isCurrent = clue.stage === currentStageNum && highestDone < 4;
          const isLocked = clue.stage > currentStageNum && !isDone;

          return (
            <div
              key={clue.id}
              className={`relative pl-12 transition-all ${
                isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              }`}
              onClick={() => {
                if (!isLocked) {
                  onSelectClue(clue.id);
                  navigate(`/hints/${clue.id}`);
                }
              }}
            >
              {/* Step indicator node */}
              <div
                className={`absolute left-0 top-3.5 w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-bold text-sm shadow-md transition-all ${
                  isDone
                    ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20'
                    : isCurrent
                    ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/25 animate-pulse'
                    : 'bg-slate-900 border border-slate-700 text-slate-500'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-slate-950" />
                ) : isLocked ? (
                  <Lock className="w-4 h-4 text-slate-500" />
                ) : (
                  clue.stage
                )}
              </div>

              {/* Card Container */}
              <div
                className={`rounded-2xl p-5 border transition-all ${
                  isDone
                    ? 'bg-slate-900/40 border-emerald-500/30 hover:border-emerald-500/50'
                    : isCurrent
                    ? 'bg-gradient-to-br from-slate-900 to-slate-950 border-amber-500/50 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                        isDone
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : isCurrent
                          ? 'bg-amber-400/20 text-amber-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      Stage {clue.stage}
                    </span>

                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      {clue.mediaType === 'audio' ? (
                        <>
                          <Headphones className="w-3.5 h-3.5 text-amber-400" />
                          <span>Audio Clue</span>
                        </>
                      ) : clue.mediaType === 'riddle' ? (
                        <>
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          <span>Cipher Riddle</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span>Campus Clue</span>
                        </>
                      )}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {isDone
                      ? t.hint_stage_completed
                      : isCurrent
                      ? t.hint_stage_current
                      : t.hint_stage_locked}
                  </span>
                </div>

                <div className="mt-2.5 space-y-1">
                  <h3
                    className={`text-base font-bold ${
                      isLocked ? 'text-slate-500 blur-xs select-none' : 'text-white'
                    }`}
                  >
                    {isLocked
                      ? '••••••••••••••••••••••••••••••••'
                      : language === 'am'
                      ? clue.titleAmharic
                      : clue.titleEnglish}
                  </h3>

                  <p
                    className={`text-xs leading-relaxed ${
                      isLocked ? 'text-slate-600 blur-xs select-none' : 'text-slate-300 line-clamp-2'
                    }`}
                  >
                    {isLocked
                      ? 'This stage clue remains locked and redacted until earlier checkpoints are verified.'
                      : language === 'am'
                      ? clue.bodyAmharic
                      : clue.bodyEnglish}
                  </p>
                </div>

                {!isLocked && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-amber-400 font-medium flex items-center gap-1 group">
                      <span>{t.hint_view}</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <span className="text-slate-400 text-[11px] font-mono">
                      Checkpoint #{clue.stage}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
