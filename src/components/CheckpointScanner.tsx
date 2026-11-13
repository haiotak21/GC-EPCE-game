/**
 * QR checkpoint verification (§6).
 *
 * The camera reads a token off the printed sign and hands it to the database,
 * which decides everything: whether the code is real, whether it is this
 * team's turn, whether the game is paused, and whether this is a repeat scan.
 * Nothing here can grant progress.
 *
 * Implementation note: the scan loop reads its callback through a ref. The
 * obvious version — putting the handler in the effect's dependencies — tears
 * down and re-acquires the camera on every keystroke in the manual-entry box
 * and on every background data refresh, which makes scanning nearly
 * impossible on a phone. That bug exists in the old prototype.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  Keyboard,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SwitchCamera,
  ShieldCheck,
} from 'lucide-react';
import { useLiveGame } from '../context/LiveGameContext';
import type { VerifyCheckpointResult } from '../lib/database.types';

/** Plain-language wording for every outcome the database can return. */
function describe(result: VerifyCheckpointResult): { ok: boolean; title: string; detail: string } {
  switch (result.code) {
    case 'VERIFIED':
      return {
        ok: true,
        title: `Checkpoint ${result.stage} verified!`,
        detail:
          'next_stage' in result && result.next_stage
            ? `Clue ${result.next_stage} is now unlocked for your whole team.`
            : 'You have completed all four stages. Head for the finish line!',
      };
    case 'ALREADY_VERIFIED':
      return {
        ok: true,
        title: 'Already done',
        detail: 'Your team has already verified this checkpoint. Nothing lost — keep going.',
      };
    case 'WRONG_STAGE':
      // Never name the checkpoint that was scanned — that would hand the team
      // the location of a stage they have not earned yet.
      return {
        ok: false,
        title: 'Not your next checkpoint',
        detail:
          'expected_stage' in result
            ? `This is not the one you are looking for. Your team needs checkpoint ${result.expected_stage} — keep searching.`
            : 'This is not the checkpoint your team needs next. Keep searching.',
      };
    case 'ORGANIZER_CODE_REQUIRED':
      return {
        ok: false,
        title: 'Organizer code needed',
        detail: 'Ask the organizer at this location for the code, then enter it below.',
      };
    case 'OTHER_TEAM_CHECKPOINT':
      // Kept for older databases; 0015 folds this into WRONG_STAGE so the two
      // are indistinguishable to a student.
      return {
        ok: false,
        title: 'Not your next checkpoint',
        detail: 'This is not the checkpoint your team needs next. Keep searching.',
      };
    case 'INVALID_CODE':
      return { ok: false, title: 'Not a valid code', detail: 'Check you are scanning the right sign.' };
    case 'GAME_PAUSED':
      return {
        ok: false,
        title: 'Game paused',
        detail: 'The organizers have paused the hunt. Your progress is safe — wait for the restart.',
      };
    case 'GAME_NOT_ACTIVE':
      return { ok: false, title: 'Game not running', detail: 'The hunt has not started yet.' };
    case 'NO_GROUP':
      return { ok: false, title: 'No team yet', detail: 'Wait for the organizers to assign your team.' };
    default:
      return { ok: false, title: 'Could not verify', detail: 'Please try again.' };
  }
}

export const CheckpointScanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { verifyCheckpoint } = useLiveGame();

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [manualCode, setManualCode] = useState('');
  const [organizerCode, setOrganizerCode] = useState('');
  const [needsOrganizerCode, setNeedsOrganizerCode] = useState(false);
  const [lastToken, setLastToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyCheckpointResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Latest submit handler, so the scan loop never needs to be rebuilt. */
  const submitRef = useRef<(token: string) => void>(() => {});
  const inFlight = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const submit = useCallback(
    async (token: string, orgCode?: string) => {
      if (inFlight.current || !token.trim()) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const res = await verifyCheckpoint(token.trim(), orgCode?.trim() || undefined);
        setResult(res);
        setLastToken(token.trim());

        if (res.code === 'ORGANIZER_CODE_REQUIRED') {
          setNeedsOrganizerCode(true);
          stopCamera();
        } else if (res.ok) {
          setNeedsOrganizerCode(false);
          stopCamera();
        }
      } catch {
        setResult({ ok: false, code: 'NETWORK' } as unknown as VerifyCheckpointResult);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [verifyCheckpoint, stopCamera]
  );

  // Keep the ref pointing at the current closure without touching the camera.
  useEffect(() => {
    submitRef.current = (token: string) => void submit(token);
  }, [submit]);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });
        if (found?.data) {
          submitRef.current(found.data);
          return; // stop looping; submit() tears the camera down on success
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser cannot use the camera. Use the code entry instead.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // iOS needs this
        await videoRef.current.play();
        setScanning(true);
        rafRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      setCameraError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow it in your browser, or type the code below.'
          : err instanceof Error
            ? err.message
            : 'Could not open the camera.'
      );
      setScanning(false);
    }
  }, [facingMode, scanFrame, stopCamera]);

  // Only these three things may restart the camera — never a keystroke.
  useEffect(() => {
    if (mode === 'camera' && !result?.ok && !needsOrganizerCode) {
      void startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [mode, facingMode, result?.ok, needsOrganizerCode, startCamera, stopCamera]);

  const described = result ? describe(result) : null;

  return (
    <div className="fixed inset-0 bg-[#070b14]/95 backdrop-blur-md z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">Verify checkpoint</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  One teammate scanning counts for the whole team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {described && (
              <div
                className={`p-4 rounded-2xl border space-y-1 ${
                  described.ok
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {described.ok ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  <span>{described.title}</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">{described.detail}</p>

                {described.ok && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs"
                  >
                    Back to the hunt
                  </button>
                )}
              </div>
            )}

            {/* §6 second factor: an organizer reads this out at the location. */}
            {needsOrganizerCode && (
              <div className="space-y-2">
                <label
                  htmlFor="organizer-code"
                  className="block text-xs font-semibold text-slate-300"
                >
                  Organizer code
                </label>
                <div className="flex gap-2">
                  <input
                    id="organizer-code"
                    type="text"
                    value={organizerCode}
                    onChange={(e) => setOrganizerCode(e.target.value)}
                    placeholder="Ask the organizer here"
                    autoFocus
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono uppercase text-center tracking-wider focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    disabled={busy || !organizerCode.trim()}
                    onClick={() => void submit(lastToken, organizerCode)}
                    className="px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {!result?.ok && !needsOrganizerCode && (
              <>
                <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                  {(['camera', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                        mode === m
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m === 'camera' ? (
                        <Camera className="w-3.5 h-3.5" />
                      ) : (
                        <Keyboard className="w-3.5 h-3.5" />
                      )}
                      <span>{m === 'camera' ? 'Scan QR' : 'Type code'}</span>
                    </button>
                  ))}
                </div>

                {mode === 'camera' ? (
                  <div className="space-y-3">
                    <div className="relative aspect-square max-w-[320px] mx-auto bg-slate-950 rounded-2xl border-2 border-amber-500/40 overflow-hidden">
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        className={`w-full h-full object-cover ${scanning ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <canvas ref={canvasRef} className="hidden" />

                      <div className="absolute inset-5 pointer-events-none">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                      </div>

                      {!scanning && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-slate-950/90 text-center">
                          <Camera className="w-9 h-9 text-slate-600" />
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {cameraError ?? 'Starting the camera…'}
                          </p>
                          {cameraError && (
                            <button
                              type="button"
                              onClick={() => void startCamera()}
                              className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Try again
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
                        }
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 border border-slate-700"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-amber-400" />
                        Flip camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="manual-code" className="block text-xs font-semibold text-slate-300">
                      Code on the sign
                    </label>
                    <input
                      id="manual-code"
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="GCMH-…"
                      autoFocus
                      autoCapitalize="characters"
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-wider focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      disabled={busy || !manualCode.trim()}
                      onClick={() => void submit(manualCode)}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 disabled:opacity-40 text-slate-950 font-bold text-sm"
                    >
                      {busy ? 'Checking…' : 'Verify'}
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600 pt-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>Checked by the organizers' server — scanning twice is safe</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
