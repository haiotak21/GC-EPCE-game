import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Activity,
  Shield,
  Eye,
  CheckCircle2,
  Clock,
  Search,
  Filter,
} from 'lucide-react';

export const AdminProgressPage: React.FC<{
  navigate: (path: string) => void;
  onSelectGroup: (groupId: string) => void;
}> = ({ navigate, onSelectGroup }) => {
  const { store } = useGame();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'in_progress' | 'finished' | 'stuck'>('all');

  const filteredGroups = store.groups.filter((g) => {
    const stagesDone = store.progress.filter((p) => p.groupId === g.id).length;
    const hasPendingHelp = store.helpRequests.some((r) => r.groupId === g.id && r.status === 'pending');

    const matchesSearch =
      g.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `group ${g.number}`.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterState === 'finished') return stagesDone === 4;
    if (filterState === 'in_progress') return stagesDone > 0 && stagesDone < 4;
    if (filterState === 'stuck') return hasPendingHelp;
    return true;
  });

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      {/* Top Banner with Strict Admin-Only Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 font-mono font-bold mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>CONFIDENTIAL • ADMIN ORGANIZERS ONLY</span>
          </div>
          <h1 className="text-2xl font-black text-white">Live Squad Progression Matrix</h1>
          <p className="text-xs text-slate-400">
            Real-time stage completion timestamps. Hidden from players to prevent unfair scouting.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by squad name or number..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
          {(['all', 'in_progress', 'finished', 'stuck'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterState(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filterState === filter
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Progression Matrix Table */}
      <div className="bg-slate-900/70 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Squad Name & Number</th>
                <th className="py-3.5 px-4 text-center">Stage 1</th>
                <th className="py-3.5 px-4 text-center">Stage 2</th>
                <th className="py-3.5 px-4 text-center">Stage 3</th>
                <th className="py-3.5 px-4 text-center">Stage 4</th>
                <th className="py-3.5 px-4">Latest Check-in</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredGroups.map((group) => {
                const groupProgress = store.progress.filter((p) => p.groupId === group.id);
                const stagesDone = groupProgress.map((p) => p.stage);
                const latest = groupProgress.sort(
                  (a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime()
                )[0];

                const hasPendingHelp = store.helpRequests.some(
                  (r) => r.groupId === group.id && r.status === 'pending'
                );

                return (
                  <tr key={group.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span className="font-mono text-amber-400">Group {group.number}</span>
                        <span>·</span>
                        <span className="text-slate-200">{group.teamName}</span>
                        {hasPendingHelp && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Help Request
                          </span>
                        )}
                      </div>
                    </td>

                    {[1, 2, 3, 4].map((stageNum) => {
                      const entry = groupProgress.find((p) => p.stage === stageNum);
                      return (
                        <td key={stageNum} className="py-3.5 px-4 text-center">
                          {entry ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="w-6 h-6 rounded-md bg-emerald-500 text-slate-950 font-bold flex items-center justify-center font-mono">
                                ✓
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 mt-1">
                                {new Date(entry.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 font-mono">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {latest ? (
                        <span>{new Date(latest.verifiedAt).toLocaleTimeString()}</span>
                      ) : (
                        <span className="text-slate-600">Not started</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          onSelectGroup(group.id);
                          navigate(`/admin/groups/${group.id}`);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
