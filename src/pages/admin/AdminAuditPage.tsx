import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  ClipboardList,
  Search,
  Download,
  Shield,
  Filter,
} from 'lucide-react';

export const AdminAuditPage: React.FC = () => {
  const { store } = useGame();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'TEAMS_PUBLISHED' | 'STATUS_TRANSITION' | 'CLUE_RELEASED' | 'MEMBER_REASSIGNED' | 'WINNERS_REVEALED'>('all');

  const filtered = store.auditLogs.filter((log) => {
    const matchesSearch =
      log.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.adminEmail.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedFilter !== 'all' && log.event !== selectedFilter) return false;
    return true;
  });

  const exportAuditCSV = () => {
    const headers = ['Timestamp', 'Admin Actor', 'Event', 'Target', 'Before Summary', 'After Summary'];
    const rows = store.auditLogs.map((log) => [
      log.timestamp,
      `"${log.adminEmail}"`,
      `"${log.event}"`,
      `"${log.target}"`,
      `"${log.beforeSummary || ''}"`,
      `"${log.afterSummary || ''}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_trail_gc_hunt_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Organizer Audit Log</h1>
          <p className="text-xs text-slate-400">
            Append-only record of all high-stakes organizer actions, member transfers, and stage unlocks.
          </p>
        </div>

        <button
          onClick={exportAuditCSV}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter Chips & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audit actions, actors, or targets..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
          {(['all', 'STATUS_TRANSITION', 'TEAMS_PUBLISHED', 'CLUE_RELEASED', 'WINNERS_REVEALED'] as const).map(
            (flt) => (
              <button
                key={flt}
                onClick={() => setSelectedFilter(flt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedFilter === flt
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {flt === 'all' ? 'All Actions' : flt.replace(/_/g, ' ')}
              </button>
            )
          )}
        </div>
      </div>

      {/* Audit Timeline Feed */}
      <div className="bg-slate-900/70 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Action & Event</th>
                <th className="py-3.5 px-4">Admin Actor</th>
                <th className="py-3.5 px-4">Target Entity</th>
                <th className="py-3.5 px-4">Audit Details</th>
                <th className="py-3.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-amber-400 text-xs">{log.event}</span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-300">
                    {log.adminEmail}
                  </td>

                  <td className="py-3.5 px-4 text-white font-sans font-medium text-xs">
                    {log.target}
                  </td>

                  <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">
                    {log.afterSummary || log.beforeSummary || '—'}
                  </td>

                  <td className="py-3.5 px-4 text-right text-slate-400 text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
