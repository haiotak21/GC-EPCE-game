import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  LifeBuoy,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Check,
} from 'lucide-react';

export const AdminHelpDeskPage: React.FC = () => {
  const { store, replyToHelpRequest, resolveHelpRequest, currentAdmin, language } = useGame();

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    store.helpRequests.length > 0 ? store.helpRequests[0].id : null
  );
  const [replyInput, setReplyInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'answered'>('all');

  const selectedRequest = store.helpRequests.find((r) => r.id === selectedRequestId);

  const cannedHints = [
    'Look closely at the north brick pillar, not the main doorway.',
    'Check the shaded tree branches in the central lawn area.',
    'No need to enter closed buildings; the clue is outside on the corridor sign.',
    'If your camera cannot scan, type the manual short code directly into the app.',
  ];

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestId || !replyInput.trim()) return;

    replyToHelpRequest(selectedRequestId, replyInput.trim());
    setReplyInput('');
  };

  const filteredRequests = store.helpRequests.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Organizer Help Desk</h1>
        <p className="text-xs text-slate-400">
          Review incoming assistance tickets, dispatch targeted guidance, and handle safety alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Tickets List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Incoming Tickets ({filteredRequests.length})</span>
            <div className="flex gap-1">
              {(['all', 'pending'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                    statusFilter === f
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredRequests.map((req) => {
              const isSelected = selectedRequestId === req.id;
              const isSafety = req.category === 'safety';

              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400 text-white shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.2 rounded-full ${
                        isSafety
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-slate-800 text-amber-300'
                      }`}
                    >
                      {req.category}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="font-bold text-xs mt-1.5 text-white">
                    Group {req.groupId.replace('grp-', '')} · {req.participantName}
                  </div>

                  <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                    {req.message}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Conversation & Reply Panel */}
        <div className="md:col-span-2">
          {selectedRequest ? (
            <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Group {selectedRequest.groupId.replace('grp-', '')}</span>
                    <span className="text-xs text-amber-400 font-normal">
                      ({selectedRequest.participantName})
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Category: {selectedRequest.category} · Stage {selectedRequest.stage}
                  </div>
                </div>

                <button
                  onClick={() => resolveHelpRequest(selectedRequest.id)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark Resolved</span>
                </button>
              </div>

              {/* Message thread */}
              <div className="space-y-3 min-h-[160px] max-h-72 overflow-y-auto p-1">
                {/* Team's initial question */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-500 font-mono">
                    Participant Message · {new Date(selectedRequest.createdAt).toLocaleTimeString()}
                  </div>
                  <div className="leading-relaxed">{selectedRequest.message}</div>
                </div>

                {/* Organizer replies */}
                {selectedRequest.replies.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-100 ml-4 space-y-1"
                  >
                    <div className="text-[10px] text-indigo-300 font-mono font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{rep.senderName}</span>
                      <span>·</span>
                      <span>{new Date(rep.sentAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="leading-relaxed">{rep.body}</div>
                  </div>
                ))}
              </div>

              {/* Canned Quick Responses */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 uppercase">
                  Quick Canned Hints:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cannedHints.map((hint, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReplyInput(hint)}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white border border-slate-800 transition-colors truncate max-w-xs"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="space-y-3 pt-2">
                <textarea
                  rows={2}
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder="Type official marshal reply (delivered privately to this squad)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-400 resize-none"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!replyInput.trim()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Private Response</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800 text-slate-500">
              Select an assistance ticket to view thread
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
