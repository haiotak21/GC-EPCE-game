import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Trophy,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Users,
  Clock,
  ArrowRight,
} from 'lucide-react';

export const AdminWinnersConsolePage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const { store, publishWinners, language } = useGame();

  const [firstGroupId, setFirstGroupId] = useState<string>(
    store.result.winners.find((w) => w.rank === 1)?.groupId || (store.groups[0]?.id || '')
  );
  const [secondGroupId, setSecondGroupId] = useState<string>(
    store.result.winners.find((w) => w.rank === 2)?.groupId || (store.groups[1]?.id || '')
  );
  const [thirdGroupId, setThirdGroupId] = useState<string>(
    store.result.winners.find((w) => w.rank === 3)?.groupId || (store.groups[2]?.id || '')
  );

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState('');

  // Check unique selection validation invariant
  const selectedIds = [firstGroupId, secondGroupId, thirdGroupId].filter(Boolean);
  const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;

  const handleOpenConfirm = () => {
    setError('');
    if (selectedIds.length < 3) {
      setError('Please designate all three podium squads (1st, 2nd, and 3rd).');
      return;
    }
    if (hasDuplicates) {
      setError('A squad cannot be placed in multiple winning podium positions.');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleExecutePublish = () => {
    publishWinners([
      { rank: 1, groupId: firstGroupId, prizeEtb: store.settings.firstPrizeEtb },
      { rank: 2, groupId: secondGroupId, prizeEtb: store.settings.secondPrizeEtb },
      { rank: 3, groupId: thirdGroupId, prizeEtb: store.settings.thirdPrizeEtb },
    ]);
    setShowConfirmModal(false);
    navigate('/winners');
  };

  const isPublished = store.gameStatus === 'WINNERS_REVEALED';

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Winner Review & Reveal Console</h1>
          <p className="text-xs text-slate-400">
            Verify stage completion evidence, crown the 3 winning teams, and trigger the live celebration broadcast.
          </p>
        </div>

        <button
          onClick={handleOpenConfirm}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25"
        >
          <Trophy className="w-4 h-4" />
          <span>Confirm & Reveal Winners</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Podium Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1st Place Selector */}
        <div className="bg-slate-900/90 rounded-3xl p-6 border-2 border-amber-400 space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-400 text-slate-950">
              1st Place
            </span>
            <span className="text-xl font-black font-mono text-amber-400">
              {store.settings.firstPrizeEtb.toLocaleString()} ETB
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Champion Squad
            </label>
            <select
              value={firstGroupId}
              onChange={(e) => setFirstGroupId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400 font-medium"
            >
              {store.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Group {g.number} · {g.teamName}
                </option>
              ))}
            </select>
          </div>

          {/* Evidence snippet */}
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            <div>
              Progress:{' '}
              <span className="text-emerald-400 font-mono font-bold">
                {store.progress.filter((p) => p.groupId === firstGroupId).length} / 4 stages verified
              </span>
            </div>
          </div>
        </div>

        {/* 2nd Place Selector */}
        <div className="bg-slate-900/90 rounded-3xl p-6 border border-slate-400/50 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-400/10 text-slate-300 border border-slate-400/30">
              2nd Place
            </span>
            <span className="text-xl font-black font-mono text-slate-200">
              {store.settings.secondPrizeEtb.toLocaleString()} ETB
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Runner-Up Squad
            </label>
            <select
              value={secondGroupId}
              onChange={(e) => setSecondGroupId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-slate-400 font-medium"
            >
              {store.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Group {g.number} · {g.teamName}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            <div>
              Progress:{' '}
              <span className="text-emerald-400 font-mono font-bold">
                {store.progress.filter((p) => p.groupId === secondGroupId).length} / 4 stages verified
              </span>
            </div>
          </div>
        </div>

        {/* 3rd Place Selector */}
        <div className="bg-slate-900/90 rounded-3xl p-6 border border-amber-700/50 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-700/10 text-amber-300 border border-amber-700/30">
              3rd Place
            </span>
            <span className="text-xl font-black font-mono text-amber-200">
              {store.settings.thirdPrizeEtb.toLocaleString()} ETB
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Third-Place Squad
            </label>
            <select
              value={thirdGroupId}
              onChange={(e) => setThirdGroupId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-700 font-medium"
            >
              {store.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Group {g.number} · {g.teamName}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            <div>
              Progress:{' '}
              <span className="text-emerald-400 font-mono font-bold">
                {store.progress.filter((p) => p.groupId === thirdGroupId).length} / 4 stages verified
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full space-y-4 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Trophy className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-white">Broadcast Official Winners?</h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will transition the game status to{' '}
              <span className="text-amber-400 font-bold font-mono">WINNERS_REVEALED</span>, unlock the 3-tier podium on all participant phones, trigger confetti, and notify the entire graduating class.
            </p>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-1/3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePublish}
                className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/25"
              >
                Confirm & Reveal Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
