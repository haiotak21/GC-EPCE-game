import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { UserCheck, Shield, Key, ArrowRight, AlertCircle } from 'lucide-react';

export const RegisterPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, registerStudent, recoverSession, t, language } = useGame();

  const [fullName, setFullName] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Recovery modal
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const isRegOpen = store.gameStatus === 'REGISTRATION_OPEN' || store.gameStatus === 'DRAFT';

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const clean = fullName.trim();
    if (!clean) {
      setError(language === 'am' ? 'እባክዎ ሙሉ ስምዎን ያስገቡ' : 'Please enter your full name');
      return;
    }
    if (clean.length < 3) {
      setError(language === 'am' ? 'ስም በጣም አጭር ነው' : 'Name is too short (min 3 chars)');
      return;
    }
    if (!consent) {
      setError(
        language === 'am'
          ? 'እባክዎ የውድድሩን ህጎች እና ደህንነት መመሪያዎችን ያረጋግጡ'
          : 'Please accept the fair play and campus rules'
      );
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      registerStudent(clean);
      setIsLoading(false);
      navigate('/waiting');
    }, 400);
  };

  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (!recoveryCodeInput.trim()) {
      setRecoveryError(language === 'am' ? 'ኮዱን ያስገቡ' : 'Enter your recovery code');
      return;
    }
    const ok = recoverSession(recoveryCodeInput.trim());
    if (ok) {
      navigate('/waiting');
    } else {
      setRecoveryError(
        language === 'am'
          ? 'የተሳሳተ የመልሶ ማግኛ ኮድ ነው። እባክዎ ያረጋግጡ።'
          : 'Invalid recovery code. Please check your spelling.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-10 px-4 sm:px-6 flex items-center justify-center pb-24">
      <div className="max-w-md w-full space-y-8 bg-slate-900/80 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white">{t.reg_title}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {language === 'am'
              ? 'ለ2026 የምረቃ ክፍል ተማሪዎች ብቻ የተዘጋጀ። ስምዎን በማስገባት ብቻ ይመዝገቡ።'
              : 'For 2026 graduating classmates only. Name-only registration with private session.'}
          </p>
        </div>

        {/* Registration form */}
        {!showRecoveryInput ? (
          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t.reg_name_label}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.reg_name_placeholder}
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
                autoFocus
              />
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.reg_privacy}</span>
              </div>
            </div>

            {/* Consent checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-slate-300 group-hover:text-white transition-colors leading-snug">
                {t.reg_consent}
              </span>
            </label>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isLoading || !isRegOpen}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                isRegOpen
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/20 active:scale-98'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : isRegOpen ? (
                <>
                  <span>{t.reg_submit}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <span>{t.reg_closed_notice}</span>
              )}
            </button>

            {/* Session Recovery toggle */}
            <div className="pt-4 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => setShowRecoveryInput(true)}
                className="text-xs text-slate-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5" />
                <span>
                  {language === 'am' ? 'ቀደም ሲል ተመዝግበዋል? በኮድ ይግቡ' : 'Already registered? Restore session with code'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          /* Session Recovery input */
          <form onSubmit={handleRecover} className="space-y-5">
            {recoveryError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recoveryError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {language === 'am' ? 'የመልሶ ማግኛ ኮድ (Recovery Code)' : 'Session Recovery Code'}
              </label>
              <input
                type="text"
                value={recoveryCodeInput}
                onChange={(e) => setRecoveryCodeInput(e.target.value)}
                placeholder="REC-XXXX-XX"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm font-mono uppercase focus:outline-none focus:border-amber-400"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                {language === 'am'
                  ? 'በምዝገባ ወቅት የተሰጣችሁን ባለ 8-ፊደል ኮድ ያስገቡ።'
                  : 'Enter the recovery code shown on your waiting screen.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRecoveryInput(false)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                {language === 'am' ? 'ተመለስ' : 'Back'}
              </button>
              <button
                type="submit"
                className="w-2/3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold shadow-md shadow-amber-400/20"
              >
                {language === 'am' ? 'መለያዬን ክፈት' : 'Restore Session'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
