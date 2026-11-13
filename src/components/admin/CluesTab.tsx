/**
 * Clue authoring (§11) — everything for one clue in one place.
 *
 * Clues key on a group NUMBER, not a team row, so all the routes can be
 * written before registration even opens. Whichever students are later drawn
 * as Group 7 receive the Group 7 route.
 *
 * Each clue carries its own checkpoint code, generated right under it: a QR
 * to download and print, and the same code as text to copy.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAdmin } from '../../context/AdminContext';
import { supabase, describeError, isMissingFunction } from '../../lib/supabase';
import {
  Save,
  Eye,
  EyeOff,
  Users,
  QrCode,
  KeyRound,
  Download,
  Copy,
  Check,
  Paperclip,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

/** 30 students at 2–3 per team never exceeds 15 teams. */
const MAX_GROUPS = 15;
const STAGES = [1, 2, 3, 4] as const;

interface Draft {
  title: string;
  description: string;
  content: string;
  mediaUrl: string;
}
const EMPTY: Draft = { title: '', description: '', content: '', mediaUrl: '' };

// -----------------------------------------------------------------------------

const QrBlock: React.FC<{ token: string; caption: string }> = ({ token, caption }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    // 'H' survives a creased, sun-bleached, taped-up sign.
    void QRCode.toCanvas(canvasRef.current, token, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [token]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${caption.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
      <button
        type="button"
        onClick={download}
        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-[11px] font-bold flex items-center gap-1.5"
      >
        <Download className="w-3.5 h-3.5" />
        Download QR
      </button>
    </div>
  );
};

// -----------------------------------------------------------------------------

const ClueEditor: React.FC<{
  stage: number;
  groupNumber: number | null;
  draft: Draft;
  published: boolean;
  exists: boolean;
  onChange: (field: keyof Draft, value: string) => void;
  onTogglePublish: () => void;
}> = ({ stage, groupNumber, draft, published, exists, onChange, onTogglePublish }) => {
  const { issueCode } = useAdmin();

  const [issued, setIssued] = useState<{ token: string; label: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const caption = `${groupNumber ? `Group ${groupNumber}` : 'All teams'} stage ${stage}`;

  const generate = async (withQr: boolean) => {
    setBusy(true);
    setError('');
    try {
      const result = await issueCode(stage, groupNumber, draft.title || `Stage ${stage}`);
      if (result.ok && result.token) {
        setIssued({ token: result.token, label: result.label ?? caption });
        setShowQr(withQr);
      } else {
        setError(`Could not generate a code: ${result.code ?? 'unknown reason'}`);
      }
    } catch (err) {
      // Surface what the database actually said — a generic message here cost
      // a whole round trip of guesswork.
      setError(
        isMissingFunction(err)
          ? 'The database is missing issue_checkpoint_code — run migration 0010.'
          : `Could not generate a code: ${describeError(err)}`
      );
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const safe = file.name.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
      const path = `${groupNumber ?? 'shared'}/stage-${stage}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('clue-media').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('clue-media').getPublicUrl(path);

      // getPublicUrl builds a URL string without checking anything, so a
      // blocked upload still yields a confident-looking link that plays
      // nothing. Confirm the object is really fetchable before accepting it.
      const probe = await fetch(data.publicUrl, { method: 'HEAD' });
      if (!probe.ok) {
        throw new Error(`file not reachable (HTTP ${probe.status})`);
      }

      onChange('mediaUrl', data.publicUrl);
    } catch (err) {
      const msg = describeError(err);
      setError(
        /row-level security|not reachable|Unauthorized|Bucket not found/i.test(msg)
          ? `Upload was blocked (${msg}). In Supabase go to Storage, open the clue-media bucket and make sure it is Public.`
          : `Upload failed: ${msg}`
      );
    } finally {
      setUploading(false);
    }
  };

  const isAudio = /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(draft.mediaUrl);

  return (
    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-black text-amber-400 uppercase tracking-wider">
          Clue {stage}
        </div>
        {exists && (
          <button
            type="button"
            onClick={onTogglePublish}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${
              published
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {published ? 'Visible to teams' : 'Draft'}
          </button>
        )}
      </div>

      <input
        type="text"
        value={draft.title}
        onChange={(e) => onChange('title', e.target.value)}
        placeholder={`Clue ${stage} title — e.g. The Library Clock Tower`}
        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
      />

      <input
        type="text"
        value={draft.description}
        onChange={(e) => onChange('description', e.target.value)}
        placeholder="Short subtitle (optional)"
        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs focus:outline-none focus:border-amber-400"
      />

      <textarea
        rows={3}
        value={draft.content}
        onChange={(e) => onChange('content', e.target.value)}
        placeholder="The riddle or directions the team will read…"
        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 resize-none"
      />

      {/* Attachment (§11 image / audio) */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer border border-slate-700">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Paperclip className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>{uploading ? 'Uploading…' : 'Attach image or audio'}</span>
          <input
            type="file"
            accept="image/*,audio/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>

        {draft.mediaUrl && (
          <button
            type="button"
            onClick={() => onChange('mediaUrl', '')}
            className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Remove
          </button>
        )}
      </div>

      {draft.mediaUrl && (
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          {isAudio ? (
            <audio controls src={draft.mediaUrl} className="w-full h-9">
              <track kind="captions" />
            </audio>
          ) : (
            <img
              src={draft.mediaUrl}
              alt={`Clue ${stage} attachment`}
              className="max-h-32 rounded-lg mx-auto"
            />
          )}
        </div>
      )}

      {/* The code for this clue's checkpoint */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate(true)}
            className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-[11px] font-bold flex items-center gap-1.5"
          >
            <QrCode className="w-3.5 h-3.5" />
            Generate QR code
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate(false)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 border border-slate-700"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            Generate code
          </button>
        </div>

        {error && <p className="text-[11px] text-rose-400">{error}</p>}

        {issued && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-2.5">
            <div className="flex items-start gap-1.5 text-emerald-300 text-[11px] leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Save this now</strong> — it is shown once and cannot be looked up again.
                Generating another replaces it.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-mono text-sm tracking-wider text-center break-all">
                {issued.token}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.token);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                title="Copy code"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {showQr ? (
              <QrBlock token={issued.token} caption={caption} />
            ) : (
              <button
                type="button"
                onClick={() => setShowQr(true)}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold"
              >
                Show QR for this code
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------

export const CluesTab: React.FC = () => {
  const { hints, groups, saveHint, setHintPublished } = useAdmin();

  // null = the shared set every team sees.
  const [groupNumber, setGroupNumber] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({
    1: EMPTY,
    2: EMPTY,
    3: EMPTY,
    4: EMPTY,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const stored = useMemo(() => {
    const map: Record<number, (typeof hints)[number] | undefined> = {};
    for (const stage of STAGES) {
      map[stage] = hints.find(
        (h) => h.hint_number === stage && (h.group_number ?? null) === groupNumber
      );
    }
    return map;
  }, [hints, groupNumber]);

  useEffect(() => {
    const next: Record<number, Draft> = { 1: EMPTY, 2: EMPTY, 3: EMPTY, 4: EMPTY };
    for (const stage of STAGES) {
      const h = stored[stage];
      if (h) {
        next[stage] = {
          // The placeholder rows created with the game aren't real titles.
          title: h.title?.startsWith('Stage ') ? '' : (h.title ?? ''),
          description: h.description ?? '',
          content: h.content ?? '',
          mediaUrl: h.media_url ?? '',
        };
      }
    }
    setDrafts(next);
    setNotice(null);
    // Keyed on the selected team only: re-running on every background refresh
    // would wipe out whatever the organizer is part-way through typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNumber]);

  const update = (stage: number, field: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [stage]: { ...d[stage], [field]: value } }));

  /** Saves all four clues for the team currently selected. */
  const saveThisGroup = async (publish: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      let saved = 0;
      for (const stage of STAGES) {
        const draft = drafts[stage];
        if (!draft.title.trim()) continue;
        const result = await saveHint({
          hintNumber: stage,
          title: draft.title,
          description: draft.description || undefined,
          content: draft.content || undefined,
          groupNumber,
          mediaUrl: draft.mediaUrl,
          publish,
        });
        if (!result.ok) {
          setNotice({ ok: false, message: `Clue ${stage}: ${result.message}` });
          return;
        }
        saved += 1;
      }
      setNotice(
        saved === 0
          ? { ok: false, message: 'Nothing to save — give at least one clue a title.' }
          : {
              ok: true,
              message: `${label}: saved ${saved} clue(s)${publish ? ' and published them' : ' as drafts'}.`,
            }
      );
    } finally {
      setBusy(false);
    }
  };

  const label = groupNumber ? `Group ${String(groupNumber).padStart(2, '0')}` : 'All teams (shared)';

  /** Which group numbers already have clues written, for the ticks. */
  const written = new Set(
    hints.filter((h) => h.group_number != null).map((h) => h.group_number as number)
  );
  const sharedWritten = hints.some((h) => h.group_number == null && !h.title.startsWith('Stage '));
  const drawnNumbers = new Set(groups.map((g) => g.group_number));

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

      {/* Group picker — all 15, whether or not the draw has happened */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-white text-sm">Which team are these clues for?</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupNumber(null)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              groupNumber === null
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            All teams
            {sharedWritten && <Check className="w-3 h-3 text-emerald-400" />}
          </button>

          {Array.from({ length: MAX_GROUPS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setGroupNumber(n)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                groupNumber === n
                  ? 'bg-amber-400 text-slate-950'
                  : drawnNumbers.has(n)
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 ring-1 ring-slate-600'
                    : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400'
              }`}
              title={drawnNumbers.has(n) ? 'This team exists' : 'Not drawn yet — you can still write its clues'}
            >
              Group {String(n).padStart(2, '0')}
              {written.has(n) && <Check className="w-3 h-3 text-emerald-400" />}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          You can write every team's route before anyone registers — whoever is drawn as{' '}
          {groupNumber ? `Group ${groupNumber}` : 'a given group'} will receive it. A green tick
          means clues are already written; a brighter button means that team has actually been
          drawn. Teams with no clues of their own fall back to the shared set.
        </p>
      </div>

      <h3 className="font-bold text-white text-sm">Clues for {label}</h3>

      {STAGES.map((stage) => (
        <ClueEditor
          key={`${groupNumber ?? 'shared'}-${stage}`}
          stage={stage}
          groupNumber={groupNumber}
          draft={drafts[stage]}
          published={!!stored[stage]?.published_at}
          exists={!!stored[stage]}
          onChange={(field, value) => update(stage, field, value)}
          onTogglePublish={async () => {
            setBusy(true);
            try {
              setNotice(
                await setHintPublished(stage, groupNumber, !stored[stage]?.published_at)
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ))}

      {/* Save applies to the selected team only */}
      <div className="flex flex-wrap gap-2 sticky bottom-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveThisGroup(true)}
          className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg"
        >
          <Save className="w-4 h-4" />
          {busy ? 'Saving…' : `Save & publish ${label}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveThisGroup(false)}
          className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs shadow-lg"
        >
          Save as draft
        </button>
      </div>
    </div>
  );
};
