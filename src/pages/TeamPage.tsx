import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  Users,
  Edit3,
  Shield,
  LifeBuoy,
  Trophy,
  Check,
  X,
  Compass,
} from 'lucide-react';

export const TeamPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, myGroup, myTeammates, updateTeamName, t, language } = useGame();

  const [isEditingName, setIsEditingName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState(myGroup?.teamName || '');
  const [nameSavedNotice, setNameSavedNotice] = useState(false);

  const teamProgressCount = store.progress.filter(
    (p) => myGroup && p.groupId === myGroup.id
  ).length;

  const teamRequests = store.helpRequests.filter(
    (r) => myGroup && r.groupId === myGroup.id
  );
  const hintsUsed = teamRequests.filter((r) => r.category === 'stuck').length;
  const hintsRemaining = Math.max(0, store.settings.maxHelpRequestsPerTeam - hintsUsed);

  const handleSaveTeamName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myGroup) return;
    const ok = updateTeamName(myGroup.id, teamNameInput);
    if (ok) {
      setIsEditingName(false);
      setNameSavedNotice(true);
      setTimeout(() => setNameSavedNotice(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6 pb-28">
      {/* Team Hero Badge */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 border border-amber-500/40 text-center space-y-4 shadow-xl">
        <div className="text-xs uppercase tracking-widest text-amber-400 font-mono font-bold">
          Official Squad Identity
        </div>

        <div className="text-6xl sm:text-7xl font-black text-white font-mono tracking-tight">
          {myGroup ? String(myGroup.number).padStart(2, '0') : '01'}
        </div>

        {/* Team Name with Edit Modal Trigger */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg sm:text-xl font-bold text-amber-300">
            {myGroup?.teamName || 'የካምፓስ አናብስት (Campus Lions)'}
          </span>
          <button
            onClick={() => {
              setTeamNameInput(myGroup?.teamName || '');
              setIsEditingName(true);
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Edit Squad Name"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {nameSavedNotice && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium">
            <Check className="w-3.5 h-3.5" />
            <span>
              {language === 'am' ? 'የቡድን ስም ተቀይሯል!' : 'Squad name updated!'}
            </span>
          </div>
        )}

        {/* Milestone & Quota Badges */}
        <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Stage Progress</div>
              <div className="text-xs font-bold text-white font-mono">{teamProgressCount} / 4 Verified</div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <LifeBuoy className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Hint Quota</div>
              <div className="text-xs font-bold text-white font-mono">{hintsRemaining} Remaining</div>
            </div>
          </div>
        </div>
      </div>

      {/* Teammates Roster */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span>{t.reveal_teammates}</span>
          </div>
          <span className="text-[11px] text-slate-500">
            {language === 'am' ? 'በአዘጋጆች የተመደበ' : 'Organizer Verified'}
          </span>
        </div>

        <div className="space-y-3">
          {myTeammates.map((member, index) => (
            <div
              key={member.id}
              className="bg-slate-900/60 rounded-2xl p-4 sm:p-5 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 font-bold flex items-center justify-center font-mono text-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{member.displayName}</span>
                    {index === 0 && (
                      <span className="px-2 py-0.2 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Lead Contact
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    ID: #{member.id.replace('p-', '')}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Active</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Team Name Modal Dialog */}
      {isEditingName && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {language === 'am' ? 'የቡድኑን ስም ይቀይሩ' : 'Customize Squad Name'}
              </h3>
              <button
                onClick={() => setIsEditingName(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {language === 'am'
                ? 'አስቂኝ ወይም አነቃቂ የGC ቡድን ስም መምረጥ ትችላላችሁ። ይፋዊው የቡድን ቁጥር ግን አይቀየርም።'
                : 'Choose a memorable or humorous team name for your graduation squad. Official group number remains fixed.'}
            </p>

            <form onSubmit={handleSaveTeamName} className="space-y-4">
              <input
                type="text"
                value={teamNameInput}
                onChange={(e) => setTeamNameInput(e.target.value)}
                placeholder="ለምሳሌ፡ የካምፓስ አናብስት"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
                autoFocus
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  {language === 'am' ? 'ይቅር' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold shadow-md shadow-amber-400/20"
                >
                  {language === 'am' ? 'አስቀምጥ' : 'Save Squad Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
