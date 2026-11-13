import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  CheckCircle2,
  Copy,
  Key,
  Users,
  Compass,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const WaitingPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, currentParticipant, myGroup, t, language } = useGame();
  const [copied, setCopied] = useState(false);

  // Auto transition to team-reveal if assigned and teams are published
  useEffect(() => {
    if (
      (store.gameStatus === 'TEAMS_PUBLISHED' || store.gameStatus === 'IN_PROGRESS') &&
      myGroup
    ) {
      const timer = setTimeout(() => {
        navigate('/team-reveal');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [store.gameStatus, myGroup, navigate]);

  const copyCode = () => {
    if (currentParticipant?.recoveryCode) {
      navigator.clipboard.writeText(currentParticipant.recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const stepsNext = [
    {
      icon: Users,
      titleAmharic: 'የዘፈቀደ ቡድን ምደባ',
      titleEnglish: 'Random Squad Assignment',
      descAmharic: 'አዘጋጆች ምዝገባውን በመዝጋት እርስዎን ከ2 አዳዲስ ተማሪዎች ጋር ይመድቡዎታል።',
      descEnglish: 'Organizers close registration and group you with 2 fellow graduating classmates.',
    },
    {
      icon: Sparkles,
      titleAmharic: 'የቀጥታ ይፋ ማድረጊያ አኒሜሽን',
      titleEnglish: 'Live Reveal Animation',
      descAmharic: 'ቡድኖች ሲለቀቁ ሚስጥራዊው ፖስታ በስክሪኑ ላይ ተከፍቶ አባላትን ያሳያል።',
      descEnglish: 'The sealed envelope will animate open on screen, revealing your squad number and names.',
    },
    {
      icon: Compass,
      titleAmharic: 'የመጀመሪያው ፍንጭ ይለቀቃል',
      titleEnglish: 'Stage 1 Mystery Unlocks',
      descAmharic: 'ውድድሩ ሲጀመር የመጀመሪያው የካምፓስ እንቆቅልሽ በዳሽቦርዱ ላይ ይከፈታል።',
      descEnglish: 'As the hunt begins, the first campus riddle appears on your timeline to solve.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-10 px-4 sm:px-6 max-w-2xl mx-auto space-y-8 pb-24">
      {/* Top Banner Card */}
      <div className="bg-slate-900/90 rounded-3xl p-6 sm:p-8 border border-slate-800 text-center space-y-4 shadow-xl relative overflow-hidden">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white">{t.wait_title}</h1>
          <p className="text-sm text-amber-400 font-semibold">
            {currentParticipant ? currentParticipant.displayName : 'Student Participant'}
          </p>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
          {t.wait_desc}
        </p>

        {/* Participant ID badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-full border border-slate-800 text-xs text-slate-400 font-mono">
          <span>{t.wait_participant_no}:</span>
          <span className="text-amber-400 font-bold">
            {currentParticipant ? currentParticipant.id : 'P-2026'}
          </span>
        </div>
      </div>

      {/* Recovery Code Card */}
      {currentParticipant?.recoveryCode && (
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 rounded-2xl p-5 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <Key className="w-4 h-4" />
              <span>{t.wait_recovery_title}</span>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copied! / ተቀድቷል' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center font-mono text-base sm:text-lg font-bold tracking-widest text-amber-300">
            {currentParticipant.recoveryCode}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed text-center">
            {t.wait_recovery_desc}
          </p>
        </div>
      )}

      {/* Status or Direct Reveal Trigger */}
      {myGroup ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-center space-y-3">
          <div className="text-sm font-bold text-emerald-400">
            {language === 'am' ? 'ቡድንዎ ተዘጋጅቷል! ይፋ ማድረጊያውን ይመልከቱ' : 'Your squad is published! Watch the reveal animation'}
          </div>
          <button
            onClick={() => navigate('/team-reveal')}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <span>{language === 'am' ? 'ወደ ቡድን ይፋ ማድረጊያ ሂድ' : 'Open Team Reveal'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-semibold">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span>{t.wait_status_card}</span>
          </div>
          <p className="text-xs text-slate-400">
            {language === 'am'
              ? 'አዘጋጆች ዝርዝሩን እያስተካከሉ ነው። ገጹን ማደስ አያስፈልግዎትም፤ በራሱ ይከፈታል!'
              : 'Organizers are shuffling teams. No need to refresh; this page will automatically advance!'}
          </p>
        </div>
      )}

      {/* What Happens Next Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          {language === 'am' ? 'ቀጣይ ምን ይከናወናል?' : 'What Happens Next?'}
        </h2>
        <div className="space-y-3">
          {stepsNext.map((st, i) => {
            const Icon = st.icon;
            return (
              <div
                key={i}
                className="bg-slate-900/40 rounded-xl p-4 border border-slate-800/80 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">
                    {language === 'am' ? st.titleAmharic : st.titleEnglish}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {language === 'am' ? st.descAmharic : st.descEnglish}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
