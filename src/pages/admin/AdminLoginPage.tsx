import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Shield, Key, ArrowRight, Lock, AlertCircle } from 'lucide-react';

export const AdminLoginPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, setCurrentAdmin, setCurrentRole, t, language } = useGame();

  const [email, setEmail] = useState('organizer1@hunt.gc');
  const [password, setPassword] = useState('campus2026');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'creds' | 'mfa'>('creds');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const found = store.admins.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      setError('Unauthorized organizer credentials. Only 3 authorized accounts exist.');
      return;
    }

    if (step === 'creds') {
      setStep('mfa');
    } else {
      if (mfaCode.trim() !== '2026' && mfaCode.trim().length < 4) {
        setError('Invalid organizer security code. Enter "2026" or 4-digit code.');
        return;
      }
      setCurrentAdmin(found);
      setCurrentRole('admin');
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white">{t.admin_login_title}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t.admin_login_notice}
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Organizer Account Presets */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            Quick Select Preset Account:
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {store.admins.map((adm) => (
              <button
                key={adm.id}
                type="button"
                onClick={() => {
                  setEmail(adm.email);
                  setPassword('campus2026');
                }}
                className={`p-2.5 rounded-xl border text-left text-xs transition-colors flex items-center justify-between ${
                  email === adm.email
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-semibold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div>
                  <div className="text-white font-medium">{adm.displayName}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{adm.email}</div>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400">
                  {adm.role.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 pt-2">
          {step === 'creds' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Organizer Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                MFA Authorization Token (Enter 2026)
              </label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="2026"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-center font-mono text-base tracking-widest focus:outline-none focus:border-indigo-400"
                autoFocus
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>{step === 'creds' ? 'Continue to MFA Step' : 'Authorize & Enter Command Center'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
