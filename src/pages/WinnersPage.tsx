import React, { useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Trophy, Sparkles, Lock, Users, Heart, Award } from 'lucide-react';
import confetti from 'canvas-confetti';

export const WinnersPage: React.FC<{ navigate: (path: string) => void }> = () => {
  const { store, t, language } = useGame();

  const isRevealed = store.gameStatus === 'WINNERS_REVEALED';

  useEffect(() => {
    if (isRevealed) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
        });
      } catch (e) {
        console.warn('Confetti error:', e);
      }
    }
  }, [isRevealed]);

  const winners = store.result.winners.map((w) => {
    const group = store.groups.find((g) => g.id === w.groupId) || {
      id: w.groupId,
      number: w.rank,
      teamName: `Squad ${w.rank}`,
      customNameSet: false,
      publishedAt: '',
      gameId: 'game-2026',
      memberIds: [] as string[],
    };
    const members = store.participants.filter((p) => group.memberIds.includes(p.id));
    return {
      rank: w.rank,
      prizeEtb: w.prizeEtb,
      group,
      members,
    };
  });

  // Reorder for 3-tier podium: 2nd place on left, 1st place in center (tallest), 3rd place on right
  const first = winners.find((w) => w.rank === 1);
  const second = winners.find((w) => w.rank === 2);
  const third = winners.find((w) => w.rank === 3);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-10 px-4 sm:px-6 max-w-4xl mx-auto space-y-8 pb-28">
      {/* Top Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 font-bold">
          <Trophy className="w-4 h-4" />
          <span>Graduating Class Hall of Fame</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          {t.win_title}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          {language === 'am'
            ? 'በፈጣን ጊዜ እና በታማኝነት 4ቱን የካምፓስ ደረጃዎች ያጠናቀቁ ምርጥ 3 ቡድኖች'
            : 'The 3 fastest verified teams who conquered all 4 mystery stages together.'}
        </p>
      </div>

      {!isRevealed ? (
        /* Locked Podium Silhouette State */
        <div className="bg-slate-900/60 rounded-3xl p-8 sm:p-12 border border-slate-800 text-center space-y-6 max-w-md mx-auto shadow-2xl">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-950 border border-slate-800 text-slate-500 flex items-center justify-center">
            <Lock className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">{t.win_pending_title}</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.win_pending_desc}
            </p>
          </div>

          {/* Locked Podium Silhouette Graphics */}
          <div className="flex items-end justify-center gap-3 pt-6 border-t border-slate-800">
            <div className="w-20 h-24 bg-slate-800/40 rounded-t-xl border border-slate-700/40 flex items-center justify-center text-xs font-mono text-slate-600">
              2nd
            </div>
            <div className="w-24 h-32 bg-slate-800/60 rounded-t-xl border border-slate-700/60 flex items-center justify-center text-sm font-mono font-bold text-slate-500">
              1st
            </div>
            <div className="w-20 h-20 bg-slate-800/40 rounded-t-xl border border-slate-700/40 flex items-center justify-center text-xs font-mono text-slate-600">
              3rd
            </div>
          </div>
        </div>
      ) : (
        /* Published 3-Tier Podium Screen */
        <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
          {/* 3-Tier Podium Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4">
            {/* 2nd Place Card (Runner-up) */}
            {second && (
              <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-400/40 flex flex-col justify-between space-y-4 order-2 md:order-1 relative overflow-hidden">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-400/10 text-slate-300 border border-slate-400/30">
                      2nd Place / 2ኛ ደረጃ
                    </span>
                    <span className="text-2xl font-black text-slate-200 font-mono">
                      {second.prizeEtb.toLocaleString()} ETB
                    </span>
                  </div>

                  <div className="space-y-1 pt-2">
                    <div className="text-2xl font-black text-white">
                      Group {String(second.group.number).padStart(2, '0')}
                    </div>
                    <div className="text-xs font-semibold text-amber-300">
                      {second.group.teamName}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase font-mono">
                      Teammates:
                    </div>
                    {second.members.map((m) => (
                      <div key={m.id} className="text-xs text-slate-200">
                        • {m.displayName}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 1st Place Card (Champion Center) */}
            {first && (
              <div className="bg-gradient-to-b from-amber-500/20 via-slate-900 to-slate-950 rounded-3xl p-7 border-2 border-amber-400 shadow-2xl shadow-amber-500/20 flex flex-col justify-between space-y-5 order-1 md:order-2 md:-translate-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <Award className="w-8 h-8 text-amber-400" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-400 text-slate-950 shadow-md">
                      👑 1st Place / 1ኛ ደረጃ
                    </span>
                  </div>

                  <div className="text-3xl sm:text-4xl font-black text-amber-400 font-mono">
                    {first.prizeEtb.toLocaleString()} ETB
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="text-2xl sm:text-3xl font-black text-white">
                      Group {String(first.group.number).padStart(2, '0')}
                    </div>
                    <div className="text-sm font-bold text-amber-300">
                      {first.group.teamName}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 space-y-1.5">
                    <div className="text-[10px] text-amber-300/80 font-semibold uppercase font-mono">
                      Champion Teammates:
                    </div>
                    {first.members.map((m) => (
                      <div key={m.id} className="text-xs font-medium text-white flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>{m.displayName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3rd Place Card */}
            {third && (
              <div className="bg-slate-900/80 rounded-3xl p-6 border border-amber-700/40 flex flex-col justify-between space-y-4 order-3 relative overflow-hidden">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-700/10 text-amber-300 border border-amber-700/30">
                      3rd Place / 3ኛ ደረጃ
                    </span>
                    <span className="text-2xl font-black text-amber-200 font-mono">
                      {third.prizeEtb.toLocaleString()} ETB
                    </span>
                  </div>

                  <div className="space-y-1 pt-2">
                    <div className="text-2xl font-black text-white">
                      Group {String(third.group.number).padStart(2, '0')}
                    </div>
                    <div className="text-xs font-semibold text-amber-300">
                      {third.group.teamName}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase font-mono">
                      Teammates:
                    </div>
                    {third.members.map((m) => (
                      <div key={m.id} className="text-xs text-slate-200">
                        • {m.displayName}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Organizers Congratulation Message */}
          <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 rounded-3xl p-6 sm:p-8 border border-amber-500/30 text-center space-y-3">
            <Heart className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">
              {language === 'am' ? 'የአዘጋጆች የደስታ መግለጫ' : 'Organizers’ Commendation'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
              {language === 'am'
                ? store.result.congratulationAmharic
                : store.result.congratulationEnglish}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
