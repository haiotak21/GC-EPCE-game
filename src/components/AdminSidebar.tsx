import React from 'react';
import { useGame } from '../context/GameContext';
import {
  LayoutDashboard,
  Users,
  Shuffle,
  Lightbulb,
  QrCode,
  Activity,
  LifeBuoy,
  Trophy,
  Send,
  History,
  Settings,
  ClipboardList,
  LogOut,
  ChevronRight,
} from 'lucide-react';

interface AdminSidebarProps {
  activePath: string;
  navigate: (path: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activePath,
  navigate,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { store, currentAdmin, setCurrentRole, t } = useGame();

  const navItems = [
    { label: t.admin_cmd_center, path: '/admin', icon: LayoutDashboard },
    {
      label: t.admin_participants,
      path: '/admin/participants',
      icon: Users,
      badge: store.participants.length,
    },
    {
      label: t.admin_groups,
      path: '/admin/groups',
      icon: Shuffle,
      badge: store.groups.length,
    },
    { label: t.admin_hints, path: '/admin/hints', icon: Lightbulb },
    { label: t.admin_checkpoints, path: '/admin/checkpoints', icon: QrCode },
    { label: t.admin_progress, path: '/admin/progress', icon: Activity },
    {
      label: t.admin_help_desk,
      path: '/admin/help',
      icon: LifeBuoy,
      badge: store.helpRequests.filter((r) => r.status === 'pending').length,
      badgeColor: 'bg-rose-500 text-white',
    },
    { label: t.admin_winners_console, path: '/admin/winners', icon: Trophy },
    { label: 'Composer', path: '/admin/notifications', icon: Send },
    { label: 'Broadcast History', path: '/admin/notifications/history', icon: History },
    { label: t.admin_settings, path: '/admin/settings', icon: Settings },
    { label: t.admin_audit, path: '/admin/audit', icon: ClipboardList },
  ];

  const handleNav = (path: string) => {
    navigate(path);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 md:top-14 z-50 md:z-20 h-screen md:h-[calc(100vh-3.5rem)] w-64 bg-[#080d17] border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6">
          {/* Admin Identity Card */}
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-400">
              Authorized Organizer
            </div>
            <div className="text-sm font-bold text-white truncate mt-0.5">
              {currentAdmin?.displayName || 'Lead Organizer'}
            </div>
            <div className="text-xs text-slate-400 truncate font-mono mt-0.5">
              {currentAdmin?.email || 'organizer@hunt.gc'}
            </div>
          </div>

          {/* Navigation links */}
          <div className="space-y-1">
            <div className="px-2 pb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Management
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePath === item.path;

              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                          item.badgeColor || 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Exit admin mode */}
        <div className="p-4 border-t border-slate-800/80 bg-[#080d17]">
          <button
            onClick={() => {
              setCurrentRole('student');
              handleNav('/dashboard');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-lg transition-colors border border-slate-800"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit to Student View</span>
          </button>
        </div>
      </aside>
    </>
  );
};
