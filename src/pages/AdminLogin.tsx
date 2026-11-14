/**
 * Organizer sign-in (§8).
 *
 * Knowing the /admin URL grants nothing — this form is the only way in, and
 * even a correct password is refused unless the account is linked as an
 * organizer in the database.
 */

import React, { useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { Shield, ArrowRight, AlertCircle } from 'lucide-react';
import { Watermark } from '../components/Watermark';

export const AdminLogin: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { signIn, authError } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (await signIn(email, password)) onSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white">Organizer sign in</h1>
          <p className="text-xs text-slate-400">
            Only the three authorized organizer accounts can enter.
          </p>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-300 mb-1">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-xs font-semibold text-slate-300 mb-1"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
          >
            <span>{busy ? 'Signing in…' : 'Sign in'}</span>
            {!busy && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <Watermark />
      </div>
    </div>
  );
};
