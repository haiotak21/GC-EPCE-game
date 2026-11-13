import React from 'react';
import { useGame } from '../context/GameContext';
import {
  Users,
  ShieldCheck,
  QrCode,
  HelpCircle,
  Trophy,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const RulesPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, t, language } = useGame();

  const rulesList = [
    {
      icon: Users,
      titleAmharic: 'የቡድን አወቃቀር እና ምደባ',
      titleEnglish: 'Team Composition & Assignment',
      descAmharic: 'እያንዳንዱ ቡድን ከ2 እስከ 3 አባላትን ያካተተ ነው። ውድድሩ ፍትሃዊ እንዲሆን ቡድኖች በአዘጋጆች በዘፈቀደ (Randomly) ይመደባሉ። ማንም ሰው ብቻውን አይወዳደርም።',
      descEnglish: 'Each squad consists of strictly 2 to 3 members. Organizers perform server-side random shuffling to guarantee fair grouping. No solo play permitted.',
    },
    {
      icon: Trophy,
      titleAmharic: 'የሽልማት ክፍፍል ፖሊሲ',
      titleEnglish: 'Prize Distribution Policy',
      descAmharic: 'የተገለጹት 3,000 / 2,000 / 1,000 የኢትዮጵያ ብር ሽልማቶች ለቡድኑ በሙሉ እንጂ ለአንድ ሰው ብቻ አይደሉም። ሽልማቱ በቡድኑ አባላት እኩል ይከፋፈላል።',
      descEnglish: 'The published rewards (3,000 ETB / 2,000 ETB / 1,000 ETB) are awarded per winning team and distributed evenly among verified teammates.',
    },
    {
      icon: QrCode,
      titleAmharic: 'የፍተሻ ጣቢያዎች ማረጋገጫ (QR & Short Code)',
      titleEnglish: 'Checkpoint Proof & Anti-Cheat',
      descAmharic: 'እያንዳንዱ ደረጃ ሲጠናቀቅ በቦታው የሚገኘው የQR ምልክት በስልክ ካሜራ መቃኘት አለበት። ካሜራ ባይሰራ አጭር ኮድ (Short Code) መጠቀም ይቻላል። ደረጃዎችን መዝለል አይፈቀድም።',
      descEnglish: 'Upon deciphering each clue, teams verify arrival via physical QR scan or manual 4-character short code. Stages must be verified strictly in sequential order.',
    },
    {
      icon: HelpCircle,
      titleAmharic: 'የእርዳታ ጥያቄ ኮታ (Help Requests)',
      titleEnglish: 'Hint Quota & Assistance',
      descAmharic: `እያንዳንዱ ቡድን እስከ ${store.settings.maxHelpRequestsPerTeam} የፍንጭ እርዳታ ጥያቄዎች ብቻ በአዘጋጆች ይመለስለታል። ነገር ግን የካምፓስ ደህንነት ወይም የተደራሽነት ችግር ካለ ያለኮታ በማንኛውም ጊዜ መላክ ይቻላል።`,
      descEnglish: `Each team has a budget of ${store.settings.maxHelpRequestsPerTeam} clue assistance requests. However, physical safety and accessibility emergencies bypass the quota at any time.`,
    },
    {
      icon: ShieldCheck,
      titleAmharic: 'የካምፓስ ደህንነት እና ስነ-ምግባር',
      titleEnglish: 'Campus Safety & Etiquette',
      descAmharic: 'የተከለከሉ ወይም የተዘጉ የሰራተኞች ህንጻዎች ውስጥ መግባት፣ በኮሪደሮች መሮጥ ወይም ሌሎች ክፍሎችን መረበሽ በጥብቅ የተከለከለ ነው። ደንብ የጣሰ ቡድን ከውድድር ይሰረዛል።',
      descEnglish: 'Never enter restricted staff offices, climb safety fences, or run recklessly through crowded halls. Any safety violation leads to immediate team disqualification.',
    },
    {
      icon: AlertTriangle,
      titleAmharic: 'የአሸናፊነት አወሳሰን እና እኩል ውጤት (Tie-Breaking)',
      titleEnglish: 'Winner Verification & Tie-Breaking',
      descAmharic: store.settings.tieBreakingRule,
      descEnglish: 'Final winners are determined by the earliest verified server timestamp at the Stage 4 checkpoint, confirmed by the 3 event marshals.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-10 px-4 sm:px-6 max-w-5xl mx-auto space-y-10 pb-24">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Fair Play & Campus Guidelines</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          {t.rules_title}
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl mx-auto">
          {language === 'am'
            ? 'ውድድሩ በደስታ፣ በፍትሃዊነት እና በሰላም እንዲጠናቀቅ ሁሉም ተሳታፊዎች የሚከተሉትን ህጎች ማክበር አለባቸው።'
            : 'To ensure a fair, thrilling, and safe celebration for all classmates, all participants must observe the following official rules.'}
        </p>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rulesList.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-4 hover:border-slate-700/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {language === 'am' ? item.titleAmharic : item.titleEnglish}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {language === 'am' ? item.descAmharic : item.descEnglish}
              </p>
            </div>
          );
        })}
      </div>

      {/* Registration Call to action */}
      <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 rounded-2xl p-6 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <div className="text-base font-bold text-white">
            {language === 'am' ? 'ህጎቹን ተረድተዋል? አሁኑኑ ይመዝገቡ!' : 'Ready to participate? Complete your registration!'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {language === 'am'
              ? 'ስምዎን በማስገባት ብቻ በሰከንዶች ውስጥ የውድድሩ አባል ይሁኑ።'
              : 'Sign up in seconds with your name alone. No phone or passwords required.'}
          </div>
        </div>

        <button
          onClick={() => navigate('/register')}
          className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-amber-400/20 whitespace-nowrap"
        >
          <span>{t.register_cta}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
