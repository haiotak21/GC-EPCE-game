import React from 'react';
import { useGame } from '../context/GameContext';
import { Home, Lightbulb, Users2, Bell } from 'lucide-react';

interface BottomNavProps {
  activePath: string;
  navigate: (path: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activePath, navigate }) => {
  const { store, currentParticipant, t } = useGame();

  const unreadCount = store.notifications.filter(
    (n) => !currentParticipant || !n.readBy.includes(currentParticipant.id)
  ).length;

  const items = [
    { id: 'home', label: t.nav_home, path: '/dashboard', icon: Home },
    { id: 'hints', label: t.nav_hints, path: '/hints', icon: Lightbulb },
    { id: 'team', label: t.nav_team, path: '/team', icon: Users2 },
    { id: 'alerts', label: t.nav_alerts, path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b101b]/95 backdrop-blur-lg border-t border-slate-800 pb-safe">
      <div className="grid grid-cols-4 items-center h-16 max-w-md mx-auto px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activePath === item.path ||
            (item.id === 'home' && activePath === '/') ||
            (item.id === 'hints' && activePath.startsWith('/hints'));

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center h-full relative focus:outline-none py-1 group"
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? 'text-amber-400 scale-110' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-2 right-1/4 translate-x-1 w-4 h-4 bg-amber-500 text-slate-950 font-bold text-[9px] rounded-full flex items-center justify-center font-mono ring-2 ring-[#0b101b]">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap ${
                  isActive ? 'text-amber-400 font-semibold' : 'text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
