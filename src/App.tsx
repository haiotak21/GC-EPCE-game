import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LiveGameProvider } from './context/LiveGameContext';
import { StudentHome } from './pages/StudentHome';

// Loaded only when someone actually goes there, so the student download stays
// small on campus wifi.
const AdminArea = lazy(() => import('./AdminArea'));
const LegacyArea = lazy(() => import('./LegacyArea'));

const Loading: React.FC = () => (
  <div className="min-h-screen bg-[#0b101b] flex items-center justify-center text-slate-400 text-sm">
    Loading…
  </div>
);

/**
 * Routing. The spec allows exactly three places to be (§2):
 *   /             the student's whole experience
 *   /admin/login  organizer sign in
 *   /admin        organizer dashboard, tabbed
 *
 * /legacy/* keeps the retired prototype reachable for comparison.
 */
export default function App() {
  const [path, setPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (to: string) => {
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0 });
  };

  if (path.startsWith('/legacy')) {
    return (
      <Suspense fallback={<Loading />}>
        <LegacyArea />
      </Suspense>
    );
  }

  if (path.startsWith('/admin')) {
    return (
      <Suspense fallback={<Loading />}>
        <AdminArea path={path} go={go} />
      </Suspense>
    );
  }

  return (
    <LiveGameProvider>
      <StudentHome />
    </LiveGameProvider>
  );
}
