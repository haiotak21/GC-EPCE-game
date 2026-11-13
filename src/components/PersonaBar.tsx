import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Shield, Users, Globe, RefreshCw, ChevronDown, CheckCircle2 } from 'lucide-react';
import { GameStatus } from '../types';

export const PersonaBar: React.FC<{ activePath: string; navigate: (path: string) => void }> = ({
  activePath,
  navigate,
}) => {
  const {
    store,
    language,
    setLanguage,
    currentRole,
    setCurrentRole,
    currentParticipant,
    setCurrentParticipant,
    currentAdmin,
    setCurrentAdmin,
    updateGameStatus,
    resetAllData,
  } = useGame();

  const [isOpen, setIsOpen] = useState(false);

  const statuses: GameStatus[] = [
    'DRAFT',
    'REGISTRATION_OPEN',
    'REGISTRATION_CLOSED',
    'TEAMS_PUBLISHED',
    'IN_PROGRESS',
    'PAUSED',
    'FINISHED',
    'WINNERS_REVEALED',
  ];

  return (
    <div className="bg-[#0f172a] border-b border-slate-800 text-xs text-slate-300">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Quick Persona Switcher */}
        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="hidden sm:inline">Role:</span>
          </span>

          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700/60">
            <button
              onClick={() => {
                setCurrentRole('student');
                if (activePath.startsWith('/admin') && activePath !== '/admin/login') {
                  navigate('/dashboard');
                }
              }}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                currentRole === 'student'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Student</span>
            </button>
            <button
              onClick={() => {
                setCurrentRole('admin');
                if (!activePath.startsWith('/admin')) {
                  navigate('/admin');
                }
              }}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                currentRole === 'admin'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Organizer</span>
            </button>
          </div>

          {/* Current Persona Dropdown */}
          {currentRole === 'student' ? (
            <select
              aria-label="Active Student Persona"
              value={currentParticipant?.id || ''}
              onChange={(e) => {
                const found = store.participants.find((p) => p.id === e.target.value);
                if (found) setCurrentParticipant(found);
              }}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500 max-w-[150px] sm:max-w-[200px] truncate"
            >
              {store.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} {p.assignedGroupId ? `(G${p.assignedGroupId.replace('grp-', '')})` : '(Unassigned)'}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Active Admin Persona"
              value={currentAdmin?.email || ''}
              onChange={(e) => {
                const found = store.admins.find((a) => a.email === e.target.value);
                if (found) setCurrentAdmin(found);
              }}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 max-w-[160px] sm:max-w-[220px] truncate"
            >
              {store.admins.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.displayName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Quick Game State & Lang Toggle */}
        <div className="flex items-center gap-2">
          {/* Quick status dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 px-2 py-1 rounded text-xs text-amber-300 hover:border-amber-500/50 transition-colors"
            >
              <span className="font-mono text-[11px] uppercase">{store.gameStatus}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Switch Game Lifecycle State
                </div>
                {statuses.map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      updateGameStatus(st);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 flex items-center justify-between ${
                      store.gameStatus === st ? 'text-amber-300 font-semibold bg-slate-800/60' : 'text-slate-300'
                    }`}
                  >
                    <span>{st}</span>
                    {store.gameStatus === st && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset Demo Data Button */}
          <button
            onClick={() => {
              if (window.confirm('Reset all demo state to fresh default?')) {
                resetAllData();
              }
            }}
            className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
            title="Reset Game Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
