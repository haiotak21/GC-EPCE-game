import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Mail, Sparkles, Users, ArrowRight, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

export const TeamRevealPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { myGroup, myTeammates, t, language } = useGame();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Trigger confetti when envelope opens
    if (isOpen) {
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.55 },
          colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ffffff'],
        });
      } catch (e) {
        console.warn('Confetti error:', e);
      }
    }
  }, [isOpen]);

  const wittyLines = [
    '“ከካምፓስ ካፌ ሻይ ጀምሮ እስከ ስታዲየም ድል ድረስ አብረን ነን!”',
    '“ፈተና ያለፈው አዕምሯችን ዛሬ 4ቱን ሚስጥሮች በደቂቃዎች ውስጥ ይፈታል!”',
    '“ለገንዘቡ ሽልማት ሳይሆን ለታሪክ እና ለትውስታ የምንዋጋ የGC ጀግኖች!”',
  ];
  const wittyLine = wittyLines[(myGroup ? myGroup.number : 1) % wittyLines.length];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden pb-24">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-amber-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-md w-full mx-auto relative z-10 text-center space-y-6">
        {!isOpen ? (
          /* Sealed Mystery Envelope State */
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>{t.reveal_title}</span>
            </div>

            <div
              onClick={() => setIsOpen(true)}
              className="cursor-pointer group relative bg-gradient-to-b from-slate-900 to-slate-950 p-8 sm:p-10 rounded-3xl border border-amber-500/40 shadow-2xl hover:border-amber-400 hover:scale-[1.02] transition-all"
            >
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/20 group-hover:rotate-6 transition-transform">
                <Mail className="w-10 h-10" />
              </div>

              <div className="mt-6 space-y-2">
                <div className="text-xl font-black text-white group-hover:text-amber-400 transition-colors">
                  {t.reveal_open_envelope}
                </div>
                <p className="text-xs text-slate-400">
                  {language === 'am'
                    ? 'አዘጋጆች ያጸደቁትን የቡድንዎን መለያ እና አባላት ለማየት ይንኩ'
                    : 'Tap the sealed envelope to unveil your assigned squad number and teammates'}
                </p>
              </div>

              {/* Wax Seal Motif */}
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/40">
                <span>GC SEALED 2026</span>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(true)}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 transition-colors"
            >
              {t.reveal_skip}
            </button>
          </div>
        ) : (
          /* Unsealed Revealed Group State */
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Official Organizer Assignment</span>
            </div>

            {/* Main Group Card */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 border border-amber-500/50 shadow-2xl space-y-6">
              {/* Group Number & Emblem */}
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-amber-400 font-bold font-mono">
                  {t.reveal_group_label}
                </div>
                <div className="text-5xl sm:text-6xl font-black text-white tracking-tight font-mono">
                  {myGroup ? String(myGroup.number).padStart(2, '0') : '01'}
                </div>
                <div className="text-sm font-bold text-amber-300">
                  {myGroup?.teamName || 'የካምፓስ ጀግኖች (Campus Champions)'}
                </div>
              </div>

              {/* Teammates List */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.reveal_teammates} (2–3 Members)</span>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  {myTeammates.length > 0 ? (
                    myTeammates.map((member, i) => (
                      <div
                        key={member.id}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold font-mono flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-semibold text-white">
                            {member.displayName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          #{member.id.replace('p-', '')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 py-2">
                      Abebe Kebede · Bethlehem Tadesse · Chala Bekele
                    </div>
                  )}
                </div>
              </div>

              {/* Witty graduation line */}
              <p className="text-xs text-amber-200/80 italic bg-amber-500/5 p-3 rounded-xl border border-amber-500/20 leading-relaxed">
                {wittyLine}
              </p>

              {/* Primary CTA */}
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all"
              >
                <span>{t.reveal_cta}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
