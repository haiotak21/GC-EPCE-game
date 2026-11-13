import React from 'react';
import { useGame } from '../context/GameContext';
import { Compass, Shield } from 'lucide-react';

interface NavbarProps {
  activePath: string;
  navigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activePath, navigate }) => {
  const { currentRole } = useGame();

  return (
    <header className="sticky top-0 z-40 bg-[#0b101b]/95 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        {/* Left: Minimal Logo Icon */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(currentRole === 'admin' ? '/admin' : '/dashboard')}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors focus:outline-none"
            title="Home"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/10 hover:scale-105 transition-transform">
              <Compass className="w-5 h-5 text-slate-950" />
            </div>
          </button>
        </div>

        {/* Right: Only Admin console button when in admin role */}
        <div className="flex items-center gap-2.5">
          {currentRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                activePath.startsWith('/admin')
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Organizer Console</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
