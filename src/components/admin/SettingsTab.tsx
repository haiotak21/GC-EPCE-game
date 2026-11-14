/**
 * Settings: prize money, the help allowance, and the on-site codes.
 *
 * All of these used to require the SQL editor. On the day nobody will want to
 * open one.
 */

import React, { useEffect, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Save, Trophy, LifeBuoy, KeyRound, Lock, Unlock } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const { game, groups, checkpoints, updateSettings, setCheckpointCode } = useAdmin();

  const [title, setTitle] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [third, setThird] = useState('');
  const [helpLimit, setHelpLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  // Load once the game arrives, and whenever it changes underneath us.
  useEffect(() => {
    if (!game) return;
    setTitle(game.title ?? '');
    setFirst(String(game.first_prize_etb ?? 3000));
    setSecond(String(game.second_prize_etb ?? 2000));
    setThird(String(game.third_prize_etb ?? 1000));
    setHelpLimit(String(game.help_request_limit ?? 2));
  }, [game?.id, game?.title, game?.first_prize_etb, game?.help_request_limit, game]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(
        await updateSettings({
          title,
          firstPrize: Number(first),
          secondPrize: Number(second),
          thirdPrize: Number(third),
          helpLimit: Number(helpLimit),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`p-3.5 rounded-xl text-xs border ${
            notice.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Prizes */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          Prize money
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Applied when a team finishes. Changing these does not alter prizes already awarded.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {([
            ['🥇 1st', first, setFirst],
            ['🥈 2nd', second, setSecond],
            ['🥉 3rd', third, setThird],
          ] as const).map(([label, value, setter]) => (
            <div key={label}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {label} (ETB)
              </label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Help allowance + title */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-sky-400" />
          Game settings
        </h3>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Game title (students see this)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Help requests allowed per team
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={helpLimit}
            onChange={(e) => setHelpLimit(e.target.value)}
            className="w-full sm:max-w-[160px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Extra requests granted to individual teams on the Help Desk are added on top of this.
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-2"
      >
        <Save className="w-4 h-4" />
        {busy ? 'Saving…' : 'Save settings'}
      </button>

      {/* On-site codes */}
      <OnSiteCodes
        groups={groups.map((g) => g.group_number)}
        checkpoints={checkpoints}
        onSet={setCheckpointCode}
      />
    </div>
  );
};

const OnSiteCodes: React.FC<{
  groups: number[];
  checkpoints: ReturnType<typeof useAdmin>['checkpoints'];
  onSet: ReturnType<typeof useAdmin>['setCheckpointCode'];
}> = ({ checkpoints, onSet }) => {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const sorted = checkpoints
    .slice()
    .sort(
      (a, b) =>
        (a.group_number ?? 0) - (b.group_number ?? 0) || a.stage_number - b.stage_number
    );

  const keyOf = (stage: number, group: number | null) => `${group ?? 'shared'}-${stage}`;

  const apply = async (stage: number, group: number | null, code: string | null) => {
    const k = keyOf(stage, group);
    setBusy(k);
    setNotice(null);
    try {
      setNotice(await onSet(stage, group, code));
      setCodes((c) => ({ ...c, [k]: '' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
      <h3 className="font-bold text-white text-sm flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-amber-400" />
        On-site codes
      </h3>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        A printed QR can be photographed and sent to another team. Turn this on for any checkpoint
        where that matters: scanning alone is then refused, and a student must also type a word an
        organizer says out loud at the location. Change it whenever you like — it takes effect
        immediately.
      </p>

      {notice && (
        <div
          className={`p-2.5 rounded-xl text-[11px] border ${
            notice.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500">
          No checkpoints yet — generate codes on the Clues tab first.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const k = keyOf(c.stage_number, c.group_number);
            return (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-white font-semibold flex items-center gap-2">
                    {c.requires_organizer_code ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-slate-600" />
                    )}
                    Checkpoint {c.stage_number}
                    <span className="text-slate-500 font-normal">
                      {c.group_number ? `· Group ${c.group_number}` : '· all teams'}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      c.requires_organizer_code
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {c.requires_organizer_code ? 'Code required' : 'Scan only'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codes[k] ?? ''}
                    onChange={(e) => setCodes((cs) => ({ ...cs, [k]: e.target.value }))}
                    placeholder={c.requires_organizer_code ? 'New code…' : 'e.g. LION42'}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono uppercase focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    disabled={busy === k || !(codes[k] ?? '').trim()}
                    onClick={() => void apply(c.stage_number, c.group_number, codes[k])}
                    className="px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-[11px] font-bold"
                  >
                    Set
                  </button>
                  {c.requires_organizer_code && (
                    <button
                      type="button"
                      disabled={busy === k}
                      onClick={() => void apply(c.stage_number, c.group_number, null)}
                      className="px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                    >
                      Turn off
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
