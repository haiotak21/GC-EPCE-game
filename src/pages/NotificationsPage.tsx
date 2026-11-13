import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  Bell,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Users,
  Megaphone,
  Clock,
} from 'lucide-react';
import { NotificationType } from '../types';

export const NotificationsPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, currentParticipant, markNotificationRead, t, language } = useGame();

  const [activeFilter, setActiveFilter] = useState<'all' | NotificationType>('all');
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);

  const filteredNotifications = store.notifications.filter((n) => {
    if (activeFilter === 'all') return true;
    return n.type === activeFilter;
  });

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'hint':
        return <Lightbulb className="w-4 h-4 text-amber-400" />;
      case 'team':
        return <Users className="w-4 h-4 text-indigo-400" />;
      case 'safety':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'announcement':
      default:
        return <Megaphone className="w-4 h-4 text-emerald-400" />;
    }
  };

  const selectedNotif = store.notifications.find((n) => n.id === selectedNotifId);

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 font-medium">
          <Bell className="w-3.5 h-3.5" />
          <span>Alerts & Organizer Broadcasts</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">
          {language === 'am' ? 'የመልዕክቶች ሳጥን (Inbox)' : 'Notification Inbox'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          {language === 'am'
            ? 'ከአዘጋጆች የሚተላለፉ የቀጥታ ፍንጮች፣ የቡድን ማሳወቂያዎች እና አጠቃላይ መግለጫዎች'
            : 'Live announcements, team alerts, and clue releases from event marshals.'}
        </p>
      </div>

      {/* Segmented Filter Buttons */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none">
        {(['all', 'hint', 'team', 'announcement', 'safety'] as const).map((cat) => {
          const isActive = activeFilter === cat;
          const label =
            cat === 'all'
              ? 'All'
              : cat === 'hint'
              ? 'Hints'
              : cat === 'team'
              ? 'Team'
              : cat === 'announcement'
              ? 'Announcements'
              : 'Safety';

          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif) => {
            const isRead = currentParticipant && notif.readBy.includes(currentParticipant.id);

            return (
              <div
                key={notif.id}
                onClick={() => {
                  setSelectedNotifId(notif.id);
                  markNotificationRead(notif.id);
                }}
                className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer ${
                  !isRead
                    ? 'bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border-amber-500/40 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      {getIcon(notif.type)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          {language === 'am' ? notif.titleAmharic : notif.titleEnglish}
                        </h3>
                        {!isRead && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {language === 'am' ? notif.bodyAmharic : notif.bodyEnglish}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 space-y-2">
            <Bell className="w-8 h-8 mx-auto opacity-40" />
            <div className="text-xs font-semibold">
              {language === 'am' ? 'ምንም አዲስ መልዕክት የለም' : 'No notifications in this category'}
            </div>
          </div>
        )}
      </div>

      {/* Message Detail Drawer Modal */}
      {selectedNotif && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center">
                  {getIcon(selectedNotif.type)}
                </div>
                <span className="text-xs font-mono font-bold uppercase text-amber-400">
                  {selectedNotif.type}
                </span>
              </div>
              <button
                onClick={() => setSelectedNotifId(null)}
                className="text-xs font-bold px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                {language === 'am' ? selectedNotif.titleAmharic : selectedNotif.titleEnglish}
              </h3>
              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                <span>By: {selectedNotif.createdBy}</span>
                <span>·</span>
                <span>{new Date(selectedNotif.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
              {language === 'am' ? selectedNotif.bodyAmharic : selectedNotif.bodyEnglish}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
