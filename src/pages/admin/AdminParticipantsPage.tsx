import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Users,
  Search,
  Download,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';

export const AdminParticipantsPage: React.FC = () => {
  const { store, removeParticipant, reinstateParticipant, language } = useGame();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'assigned' | 'unassigned' | 'removed'>('all');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [showRemoveModal, setShowRemoveModal] = useState<string | null>(null);

  const filtered = store.participants.filter((p) => {
    const matchesSearch =
      p.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.recoveryCode.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return p.status === 'active';
    if (statusFilter === 'removed') return p.status === 'removed';
    if (statusFilter === 'assigned') return p.status === 'active' && !!p.assignedGroupId;
    if (statusFilter === 'unassigned') return p.status === 'active' && !p.assignedGroupId;
    return true;
  });

  // Check for duplicate names for organizer review
  const nameCounts = new Map<string, number>();
  store.participants.forEach((p) => {
    const n = p.displayName.trim().toLowerCase();
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  });

  const exportCSV = () => {
    const headers = ['ID', 'Full Name', 'Status', 'Group', 'Recovery Code', 'Registered At'];
    const rows = store.participants.map((p) => [
      p.id,
      `"${p.displayName}"`,
      p.status,
      p.assignedGroupId || 'Unassigned',
      p.recoveryCode,
      p.registeredAt,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `participants_gc_hunt_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmRemove = () => {
    if (!showRemoveModal) return;
    removeParticipant(showRemoveModal, removeReason || 'Suspicious duplicate / disqualified');
    setShowRemoveModal(null);
    setRemoveReason('');
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Participant Registry</h1>
          <p className="text-xs text-slate-400">
            Audit, verify identity, manage duplicates, and export official roster.
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Summary totals chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Total Registered</div>
          <div className="text-xl font-black text-white font-mono">{store.participants.length}</div>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Assigned to Squads</div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {store.participants.filter((p) => p.assignedGroupId && p.status === 'active').length}
          </div>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Pending Assignment</div>
          <div className="text-xl font-black text-amber-400 font-mono">
            {store.participants.filter((p) => !p.assignedGroupId && p.status === 'active').length}
          </div>
        </div>
        <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Invalidated / Removed</div>
          <div className="text-xl font-black text-rose-400 font-mono">
            {store.participants.filter((p) => p.status === 'removed').length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, ID, or recovery code..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
          {(['all', 'assigned', 'unassigned', 'removed'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === filter
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Participant Name</th>
                <th className="py-3 px-4">ID & Session</th>
                <th className="py-3 px-4">Assigned Group</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((p) => {
                const isDuplicate = (nameCounts.get(p.displayName.trim().toLowerCase()) || 0) > 1;
                const assignedGroup = p.assignedGroupId
                  ? store.groups.find((g) => g.id === p.assignedGroupId)
                  : null;

                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{p.displayName}</span>
                        {isDuplicate && (
                          <span
                            title="Multiple accounts share this name. Verify participant session."
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>Same Name</span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      <div>#{p.id}</div>
                      <div className="text-[10px] text-slate-500">{p.recoveryCode}</div>
                    </td>

                    <td className="py-3 px-4">
                      {assignedGroup ? (
                        <span className="font-mono font-bold text-amber-400">
                          Group {assignedGroup.number}
                        </span>
                      ) : (
                        <span className="text-slate-500">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          p.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(p.registeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {p.status === 'active' ? (
                        <button
                          onClick={() => setShowRemoveModal(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Invalidate / Disqualify"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => reinstateParticipant(p.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Reinstate Participant"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remove / Invalidate Confirmation Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Invalidate Participant</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to disqualify or remove this participant? They will be detached from any assigned squads and flagged in the audit log.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for Removal (Required for Audit)
              </label>
              <input
                type="text"
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="e.g. Duplicate account, requested exit, violation"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRemoveModal(null)}
                className="w-1/3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="w-2/3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold"
              >
                Confirm Invalidation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
