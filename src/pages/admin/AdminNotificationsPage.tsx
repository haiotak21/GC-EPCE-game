import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Send,
  Users,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { NotificationType } from '../../types';

export const AdminNotificationsPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const { store, sendNotification } = useGame();

  const [targetType, setTargetType] = useState<'all' | 'groups'>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(store.groups[0]?.id || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<NotificationType>('hint');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('urgent');

  const [sentNotice, setSentNotice] = useState(false);

  const calculateRecipientCount = () => {
    if (targetType === 'all') return store.participants.filter((p) => p.status === 'active').length;
    if (targetType === 'groups') {
      const g = store.groups.find((grp) => grp.id === selectedGroupId);
      return g ? g.memberIds.length : 0;
    }
    return 1;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle) return;

    sendNotification({
      titleAmharic: cleanTitle,
      titleEnglish: cleanTitle,
      bodyAmharic: cleanBody,
      bodyEnglish: cleanBody,
      type,
      priority,
      targetType,
      targetIds: targetType === 'groups' ? [selectedGroupId] : undefined,
    });

    setSentNotice(true);
    setTitle('');
    setBody('');
    setTimeout(() => setSentNotice(false), 3000);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Hint & Announcement Broadcaster</h1>
          <p className="text-xs text-slate-400">
            Write clues or alerts in Amharic or English. Pop-ups display immediately on students' screens.
          </p>
        </div>

        <button
          onClick={() => navigate('/admin/notifications/history')}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors"
        >
          View Broadcast History →
        </button>
      </div>

      {sentNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Notice broadcasted! Students will see it in a pop-up modal on their screen.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Composer Form */}
        <form
          onSubmit={handleSend}
          className="lg:col-span-2 bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl"
        >
          {/* Target Audience Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Audience
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetType('all')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                  targetType === 'all'
                    ? 'bg-amber-400 text-slate-950 font-bold border-amber-400'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Send for All Users
              </button>
              <button
                type="button"
                onClick={() => setTargetType('groups')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                  targetType === 'groups'
                    ? 'bg-amber-400 text-slate-950 font-bold border-amber-400'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                One Specific Squad
              </button>
            </div>
          </div>

          {targetType === 'groups' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Destination Squad
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                {store.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Group {g.number} · {g.teamName} ({g.memberIds.length} members)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NotificationType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="hint">Hint / Clue Notice</option>
                <option value="announcement">Announcement</option>
                <option value="team">Team Alert</option>
                <option value="safety">Safety / Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Display</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="urgent">Pop-up Modal (Dismisses only on Cancel)</option>
                <option value="normal">Standard Modal</option>
              </select>
            </div>
          </div>

          {/* Unified Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Title (Type in Amharic or English)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. የደረጃ 1 ፍንጭ  or  Stage 1 Clue Hint"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400 placeholder-slate-500 font-sans"
            />
          </div>

          {/* Unified Body Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Message / Hint Content (Type in Amharic or English)
            </label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message or hint here (e.g. ወደ ጥንቱ ቤተ-መጻሕፍት ሰሜናዊ አቅጣጫ ተመልከቱ)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400 resize-none font-sans placeholder-slate-500"
            />
          </div>

          {/* Footer CTA */}
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              Recipients: <span className="text-amber-400 font-bold">{calculateRecipientCount()} students</span>
            </span>

            <button
              type="submit"
              disabled={!title.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{targetType === 'all' ? 'Send for All Users' : 'Send to Squad'}</span>
            </button>
          </div>
        </form>

        {/* Right Col: Phone-Style Mobile Popup Preview */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span>Live Student Phone Preview</span>
          </div>

          <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-4 shadow-xl">
            {/* Simulated Phone Top Bar */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pb-2 border-b border-slate-900">
              <span>9:41 AM</span>
              <span>4G LTE</span>
            </div>

            {/* Notification Banner on Phone */}
            <div
              className={`p-4 rounded-2xl border space-y-1.5 shadow-lg ${
                priority === 'urgent'
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-slate-900 border-amber-500/40 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-mono">
                <span className="font-bold uppercase">{type}</span>
                <span>Just now</span>
              </div>

              <div className="text-xs font-bold text-white">
                {title || 'የመልዕክት ርዕስ (Notification Title)'}
              </div>

              <div className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">
                {body || 'የመልዕክቱ ዝርዝር እዚህ ጋር በተማሪዎች ስክሪን ላይ በፖፕ አፕ ይታያል... (Preview text in Amharic or English)'}
              </div>
            </div>

            <div className="text-[10px] text-slate-500 text-center font-mono">
              In-app toast & inbox persistence
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
