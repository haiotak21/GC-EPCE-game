import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  History,
  ArrowLeft,
  Send,
  Eye,
  RotateCcw,
  Search,
} from 'lucide-react';

export const AdminNotificationsHistoryPage: React.FC<{
  navigate: (path: string) => void;
}> = ({ navigate }) => {
  const { store, sendNotification } = useGame();

  const [searchTerm, setSearchTerm] = useState('');

  const filtered = store.notifications.filter(
    (n) =>
      n.titleEnglish.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.titleAmharic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.bodyEnglish.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleResend = (n: (typeof store.notifications)[0]) => {
    sendNotification({
      titleAmharic: n.titleAmharic,
      titleEnglish: n.titleEnglish,
      bodyAmharic: n.bodyAmharic,
      bodyEnglish: n.bodyEnglish,
      type: n.type,
      priority: n.priority,
      targetType: n.targetType,
      targetIds: n.targetIds,
    });
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      <button
        onClick={() => navigate('/admin/notifications')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Composer</span>
      </button>

      <div>
        <h1 className="text-2xl font-black text-white">Broadcast History & Audit</h1>
        <p className="text-xs text-slate-400">
          Sent messages table with audience targeting, seen counts, and resend actions.
        </p>
      </div>

      <div className="bg-slate-900/70 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Audience</th>
                <th className="py-3.5 px-4">Seen By</th>
                <th className="py-3.5 px-4">Sent Time</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-white">{item.titleEnglish}</div>
                    <div className="text-[11px] text-slate-400">{item.titleAmharic}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                      {item.type}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-300 capitalize">
                    {item.targetType}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    <span className="text-emerald-400 font-bold">{item.readBy.length}</span> students
                  </td>

                  <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleResend(item)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Resend</span>
                    </button>
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
