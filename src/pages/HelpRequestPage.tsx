import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  LifeBuoy,
  Send,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { HelpCategory } from '../types';

export const HelpRequestPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, myGroup, currentParticipant, submitHelpRequest, t, language } = useGame();

  const [category, setCategory] = useState<HelpCategory>('stuck');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const teamRequests = store.helpRequests.filter(
    (r) => myGroup && r.groupId === myGroup.id
  );
  const hintsUsed = teamRequests.filter((r) => r.category === 'stuck').length;
  const hintsRemaining = Math.max(0, store.settings.maxHelpRequestsPerTeam - hintsUsed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const res = submitHelpRequest(category, message);
    setFeedback(res);
    if (res.success) {
      setMessage('');
    }
  };

  const categories: { id: HelpCategory; label: string; desc: string }[] = [
    {
      id: 'stuck',
      label: t.help_cat_stuck,
      desc: language === 'am' ? 'ከፍንጭ ኮታ ይቀነሳል' : 'Deducts 1 hint from quota',
    },
    {
      id: 'qr_issue',
      label: t.help_cat_qr,
      desc: language === 'am' ? 'የኮድ ወይም የካሜራ ብልሽት' : 'Sign or camera malfunction',
    },
    {
      id: 'accessibility',
      label: t.help_cat_accessibility,
      desc: language === 'am' ? 'የመንገድ ወይም የአካል ተደራሽነት' : 'Physical or route barrier',
    },
    {
      id: 'safety',
      label: t.help_cat_safety,
      desc: language === 'am' ? 'አስቸኳይ · ያለኮታ ገደብ' : 'Urgent · Zero quota cost',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-6 px-4 sm:px-6 max-w-2xl mx-auto space-y-4 pb-28">
      {/* Back button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors p-1 rounded-lg"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      {/* Top Header Card */}
      <div className="bg-slate-900/90 rounded-3xl p-6 sm:p-7 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{t.help_title}</h1>
              <div className="text-xs text-amber-400 font-medium">
                {myGroup ? `${myGroup.teamName} (Group ${myGroup.number})` : 'Individual Help'}
              </div>
            </div>
          </div>

          {/* Hint Quota Counter */}
          <div className="text-right">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              {t.help_remaining}
            </div>
            <div className="text-2xl font-black font-mono text-amber-400">
              {hintsRemaining} <span className="text-xs font-normal text-slate-400">/ {store.settings.maxHelpRequestsPerTeam}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {language === 'am'
            ? 'አዘጋጆች ጥያቄዎትን በቀጥታ ተመልክተው ለቡድንዎ ብቻ የግል መልስ ይልካሉ። አስቸኳይ የደህንነት ጥያቄዎች ያለኮታ ይስተናገዳሉ።'
            : 'Organizers monitor incoming requests in real-time. Replies are delivered privately to your squad thread.'}
        </p>
      </div>

      {/* Submission Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Help Request Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-lg">
        {/* Category Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {t.help_category}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {categories.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold">{cat.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{cat.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {t.help_msg_label}
          </label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.help_msg_placeholder}
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-amber-400 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={!message.trim()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
        >
          <Send className="w-4 h-4" />
          <span>{t.help_send}</span>
        </button>
      </form>

      {/* Shared Team Conversation Thread */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          {t.help_thread_title}
        </h2>

        {teamRequests.length > 0 ? (
          teamRequests.map((req) => (
            <div
              key={req.id}
              className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400 uppercase font-mono text-[10px]">
                  {req.category}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    req.status === 'answered'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {req.status === 'answered' ? 'Answered by Marshals' : 'Waiting for Organizer'}
                </span>
              </div>

              {/* Participant's Message */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 text-xs text-slate-200">
                <div className="text-[10px] text-slate-500 font-mono mb-1">
                  {req.participantName} · {new Date(req.createdAt).toLocaleTimeString()}
                </div>
                <div>{req.message}</div>
              </div>

              {/* Organizer Replies */}
              {req.replies.map((reply) => (
                <div
                  key={reply.id}
                  className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl text-xs text-amber-100 ml-4 space-y-1"
                >
                  <div className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{reply.senderName}</span>
                    <span>·</span>
                    <span className="font-mono">{new Date(reply.sentAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="leading-relaxed">{reply.body}</div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="text-center py-8 bg-slate-900/30 rounded-2xl border border-slate-800/60 text-slate-500 text-xs">
            {language === 'am' ? 'እስካሁን የተላከ የእርዳታ ጥያቄ የለም' : 'No previous assistance requests from your squad'}
          </div>
        )}
      </div>
    </div>
  );
};
