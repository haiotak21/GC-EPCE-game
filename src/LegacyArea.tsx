/**
 * The retired localStorage prototype, reachable only at /legacy.
 *
 * Kept temporarily for visual comparison while the live app settles. It shares
 * no state or database with the real app. Loaded lazily, so students never
 * download it.
 */

import React, { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { PersonaBar } from './components/PersonaBar';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { AdminSidebar } from './components/AdminSidebar';
import { NotificationPopUpModal } from './components/NotificationPopUpModal';
import { StudentNamePromptModal } from './components/StudentNamePromptModal';
import { RulesPage } from './pages/RulesPage';
import { RegisterPage } from './pages/RegisterPage';
import { WaitingPage } from './pages/WaitingPage';
import { TeamRevealPage } from './pages/TeamRevealPage';
import { DashboardPage } from './pages/DashboardPage';
import { TeamPage } from './pages/TeamPage';
import { HintsTimelinePage } from './pages/HintsTimelinePage';
import { ClueDetailPage } from './pages/ClueDetailPage';
import { CheckpointPage } from './pages/CheckpointPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { HelpRequestPage } from './pages/HelpRequestPage';
import { WinnersPage } from './pages/WinnersPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminCommandCenterPage } from './pages/admin/AdminCommandCenterPage';
import { AdminParticipantsPage } from './pages/admin/AdminParticipantsPage';
import { AdminGroupsStudioPage } from './pages/admin/AdminGroupsStudioPage';
import { AdminGroupDetailPage } from './pages/admin/AdminGroupDetailPage';
import { AdminHintsPage } from './pages/admin/AdminHintsPage';
import { AdminCheckpointsPage } from './pages/admin/AdminCheckpointsPage';
import { AdminProgressPage } from './pages/admin/AdminProgressPage';
import { AdminHelpDeskPage } from './pages/admin/AdminHelpDeskPage';
import { AdminWinnersConsolePage } from './pages/admin/AdminWinnersConsolePage';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage';
import { AdminNotificationsHistoryPage } from './pages/admin/AdminNotificationsHistoryPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { Menu, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentRole, currentParticipant } = useGame();

  // Internal route state with URL sync
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname) {
      return window.location.pathname === '/' ? '/' : window.location.pathname;
    }
    return '/';
  });

  const [selectedClueId, setSelectedClueId] = useState<string>('clue-1');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('grp-1');
  const [isAdminMobileSidebarOpen, setIsAdminMobileSidebarOpen] = useState(false);

  // Sync back/forward browser history
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAdminRoute = currentPath.startsWith('/admin') && currentPath !== '/admin/login';

  const renderContent = () => {
    // Admin Routes
    if (currentPath === '/admin/login') {
      return <AdminLoginPage navigate={navigate} />;
    }
    if (currentPath === '/admin') {
      return <AdminCommandCenterPage navigate={navigate} />;
    }
    if (currentPath === '/admin/participants') {
      return <AdminParticipantsPage />;
    }
    if (currentPath === '/admin/groups') {
      return (
        <AdminGroupsStudioPage
          navigate={navigate}
          onSelectGroup={(id) => setSelectedGroupId(id)}
        />
      );
    }
    if (currentPath.startsWith('/admin/groups/')) {
      const gId = currentPath.replace('/admin/groups/', '') || selectedGroupId;
      return <AdminGroupDetailPage groupId={gId} navigate={navigate} />;
    }
    if (currentPath === '/admin/hints') {
      return <AdminHintsPage />;
    }
    if (currentPath === '/admin/checkpoints') {
      return <AdminCheckpointsPage />;
    }
    if (currentPath === '/admin/progress') {
      return (
        <AdminProgressPage
          navigate={navigate}
          onSelectGroup={(id) => setSelectedGroupId(id)}
        />
      );
    }
    if (currentPath === '/admin/help') {
      return <AdminHelpDeskPage />;
    }
    if (currentPath === '/admin/winners') {
      return <AdminWinnersConsolePage navigate={navigate} />;
    }
    if (currentPath === '/admin/notifications') {
      return <AdminNotificationsPage navigate={navigate} />;
    }
    if (currentPath === '/admin/notifications/history') {
      return <AdminNotificationsHistoryPage navigate={navigate} />;
    }
    if (currentPath === '/admin/settings') {
      return <AdminSettingsPage />;
    }
    if (currentPath === '/admin/audit') {
      return <AdminAuditPage />;
    }

    // Student & Public Routes
    if (currentPath === '/rules') {
      return <RulesPage navigate={navigate} />;
    }
    if (currentPath === '/register') {
      return <RegisterPage navigate={navigate} />;
    }
    if (currentPath === '/waiting') {
      return <WaitingPage navigate={navigate} />;
    }
    if (currentPath === '/team-reveal') {
      return <TeamRevealPage navigate={navigate} />;
    }
    if (currentPath === '/dashboard') {
      return <DashboardPage navigate={navigate} />;
    }
    if (currentPath === '/team') {
      return <TeamPage navigate={navigate} />;
    }
    if (currentPath === '/hints') {
      return (
        <HintsTimelinePage
          navigate={navigate}
          onSelectClue={(cId) => setSelectedClueId(cId)}
        />
      );
    }
    if (currentPath.startsWith('/hints/')) {
      const cId = currentPath.replace('/hints/', '') || selectedClueId;
      return <ClueDetailPage clueId={cId} navigate={navigate} />;
    }
    if (currentPath === '/checkpoint') {
      return <CheckpointPage navigate={navigate} />;
    }
    if (currentPath === '/notifications') {
      return <NotificationsPage navigate={navigate} />;
    }
    if (currentPath === '/help') {
      return <HelpRequestPage navigate={navigate} />;
    }
    if (currentPath === '/winners') {
      return <WinnersPage navigate={navigate} />;
    }

    // Default: Home Dashboard
    return <DashboardPage navigate={navigate} />;
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Top Demo & Persona Bar */}
      <PersonaBar activePath={currentPath} navigate={navigate} />

      {/* Main Top Bar */}
      <Navbar activePath={currentPath} navigate={navigate} />

      {/* Global Notification & Clue Pop-Up Modal (dismisses only on Cancel) */}
      <NotificationPopUpModal />

      {/* Immediate Student Name Entry Prompt for new arrivals */}
      {currentRole === 'student' && !currentParticipant && !isAdminRoute && (
        <StudentNamePromptModal
          isOpen={true}
          onSuccess={() => navigate('/dashboard')}
        />
      )}

      {/* Main App Layout */}
      {isAdminRoute ? (
        <div className="flex flex-1">
          {/* Mobile Admin Sidebar Toggle */}
          <div className="md:hidden fixed top-16 left-4 z-40">
            <button
              onClick={() => setIsAdminMobileSidebarOpen(!isAdminMobileSidebarOpen)}
              className="p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 shadow-lg"
              title="Toggle Organizer Menu"
            >
              {isAdminMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          <AdminSidebar
            activePath={currentPath}
            navigate={navigate}
            isMobileOpen={isAdminMobileSidebarOpen}
            onCloseMobile={() => setIsAdminMobileSidebarOpen(false)}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto overflow-x-hidden">
            {renderContent()}
          </main>
        </div>
      ) : (
        <main className="flex-1">
          {renderContent()}
          {/* Mobile Bottom Navigation (only on student/public flows) */}
          <BottomNav activePath={currentPath} navigate={navigate} />
        </main>
      )}
    </div>
  );
};

/**
 * Routing. The spec allows exactly three places to be (§2):
 *   /             the student's whole experience
 *   /admin/login  organizer sign in
 *   /admin        organizer dashboard, tabbed
 *
 * /legacy/* keeps the old localStorage prototype reachable for comparison
 * while the remaining screens are migrated. It shares no state with the live
 * app and gets deleted once migration finishes.
 */

export default function LegacyArea() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
