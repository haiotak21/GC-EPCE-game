import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Settings,
  Save,
  Trophy,
  Users,
  ShieldCheck,
  LifeBuoy,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const AdminSettingsPage: React.FC = () => {
  const { store, updateSettings, language } = useGame();

  const [settingsForm, setSettingsForm] = useState(store.settings);
  const [saveNotice, setSaveNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(settingsForm);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Event Configuration & Safety Rules</h1>
        <p className="text-xs text-slate-400">
          Configure prize allocations, help quotas, tie-breaking policies, and safety protocols.
        </p>
      </div>

      {saveNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Settings saved and logged to audit trail!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Prize Pool Configuration */}
        <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Prize Pool Amounts (ETB per Team)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                1st Place Reward (ETB)
              </label>
              <input
                type="number"
                value={settingsForm.firstPrizeEtb}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, firstPrizeEtb: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                2nd Place Reward (ETB)
              </label>
              <input
                type="number"
                value={settingsForm.secondPrizeEtb}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, secondPrizeEtb: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                3rd Place Reward (ETB)
              </label>
              <input
                type="number"
                value={settingsForm.thirdPrizeEtb}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, thirdPrizeEtb: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Team & Help Quota Rules */}
        <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Team & Assistance Policies</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Maximum Team Size (Read-only constraint: 3)
              </label>
              <input
                type="number"
                value={settingsForm.maxTeamSize}
                disabled
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-500 font-mono cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Strict algorithm constraint: Teams of 2 to 3 only.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Max Hint Requests per Squad
              </label>
              <input
                type="number"
                value={settingsForm.maxHelpRequestsPerTeam}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    maxHelpRequestsPerTeam: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Tie-Breaking Policy Statement
            </label>
            <input
              type="text"
              value={settingsForm.tieBreakingRule}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, tieBreakingRule: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Campus Safety & Zone Notes
            </label>
            <textarea
              rows={2}
              value={settingsForm.campusSafetyNotes}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, campusSafetyNotes: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white resize-none"
            />
          </div>
        </div>

        {/* 3 Configured Organizer Accounts */}
        <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Authorized Event Organizers (3 Accounts Configured)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {store.admins.map((adm) => (
              <div
                key={adm.id}
                className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800 text-xs space-y-1"
              >
                <div className="font-bold text-white">{adm.displayName}</div>
                <div className="text-[10px] text-slate-500 font-mono">{adm.email}</div>
                <div className="text-[10px] font-mono uppercase text-amber-400 pt-1">
                  Role: {adm.role.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save CTA */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration Changes</span>
          </button>
        </div>
      </form>
    </div>
  );
};
