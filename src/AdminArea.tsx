/**
 * The organizer area, loaded only when someone visits /admin.
 *
 * Splitting this out keeps it out of every student's download — they outnumber
 * organizers roughly ten to one and are on university wifi.
 */

import React, { useEffect, useRef } from 'react';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';

const AdminGate: React.FC<{ onNeedsLogin: () => void; onSignedOut: () => void }> = ({
  onNeedsLogin,
  onSignedOut,
}) => {
  const { ready, signedIn, isAdmin, signOut } = useAdmin();

  // Held in a ref so a parent re-render (which creates a new callback
  // identity) cannot re-fire this effect and cause a redirect loop.
  const needsLoginRef = React.useRef(onNeedsLogin);
  needsLoginRef.current = onNeedsLogin;

  useEffect(() => {
    if (ready && !signedIn) needsLoginRef.current();
  }, [ready, signedIn]);

  if (!ready || (!signedIn && !isAdmin)) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center text-slate-400 text-sm">
        Checking your access…
      </div>
    );
  }

  if (signedIn && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b101b] flex items-center justify-center p-4">
        <div className="max-w-sm w-full p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
          <p className="text-sm text-rose-300">
            You are signed in, but this account is not an organizer for this game.
          </p>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              onSignedOut();
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
          >
            Sign in as someone else
          </button>
        </div>
      </div>
    );
  }

  return <AdminDashboard onSignedOut={onSignedOut} />;
};

export default function AdminArea({
  path,
  go,
}: {
  path: string;
  go: (to: string) => void;
}) {
  return (
    <AdminProvider>
      {path === '/admin/login' ? (
        <AdminLogin onSuccess={() => go('/admin')} />
      ) : (
        <AdminGate onNeedsLogin={() => go('/admin/login')} onSignedOut={() => go('/admin/login')} />
      )}
    </AdminProvider>
  );
}
