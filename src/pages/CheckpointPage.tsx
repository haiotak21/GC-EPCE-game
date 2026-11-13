import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import {
  Camera,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Shield,
  Key,
  SwitchCamera,
  RefreshCw,
  Upload,
  Users,
} from 'lucide-react';
import jsQR from 'jsqr';

export const CheckpointPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { store, myGroup, verifyCheckpoint, t, language } = useGame();

  const [inputCode, setInputCode] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannedCodeFeedback, setScannedCodeFeedback] = useState<string | null>(null);

  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    stage?: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Determine which stage the team needs next
  const myCompletedStages = store.progress
    .filter((p) => myGroup && p.groupId === myGroup.id)
    .map((p) => p.stage);
  const highestDone = myCompletedStages.length > 0 ? Math.max(...myCompletedStages) : 0;
  const currentStageRequired = (highestDone < 4 ? highestDone + 1 : 4) as 1 | 2 | 3 | 4;
  const currentCheckpoint = store.checkpoints.find((c) => c.stage === currentStageRequired);

  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleVerify = useCallback(
    (codeToVerify?: string) => {
      const code = codeToVerify || inputCode;
      if (!code.trim()) return;

      const res = verifyCheckpoint(code, currentStageRequired);
      setVerificationResult(res);
      if (res.success) {
        setInputCode('');
        stopCamera();
      }
    },
    [currentStageRequired, inputCode, stopCamera, verifyCheckpoint]
  );

  // Frame scanning loop
  const scanQRCode = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameId.current = requestAnimationFrame(scanQRCode);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animationFrameId.current = requestAnimationFrame(scanQRCode);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      setScannedCodeFeedback(code.data);
      handleVerify(code.data);
      return;
    }

    animationFrameId.current = requestAnimationFrame(scanQRCode);
  }, [handleVerify]);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setScannedCodeFeedback(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser environment.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        // Fallback to generic video if environment constraint fails
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
        await videoRef.current.play();
        setIsScanning(true);
        animationFrameId.current = requestAnimationFrame(scanQRCode);
      }
    } catch (err: unknown) {
      console.warn('Camera access error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to access camera. Please allow camera permissions or enter the manual short code.';
      setCameraError(msg);
      setIsScanning(false);
    }
  }, [facingMode, scanQRCode, stopCamera]);

  // Handle switching tabs
  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, facingMode, startCamera, stopCamera]);

  // Image file QR scanning alternative
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleVerify(code.data);
          } else {
            setVerificationResult({
              success: false,
              message:
                language === 'am'
                  ? 'በምስሉ ላይ ምንም የQR ኮድ አልተገኘም'
                  : 'No valid QR code detected in the selected image.',
            });
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-6 px-4 sm:px-6 max-w-xl mx-auto space-y-5 pb-28">
      {/* Top back navigation */}
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors p-1"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
          <QrCode className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-white">{t.check_title}</h1>
        <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
          Scan the physical QR sign at the campus checkpoint with your camera to confirm your team arrival.
        </p>

        {/* Squad notice: 1 player scan unlocks for all teammates */}
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-center gap-2 font-medium max-w-md mx-auto">
          <Users className="w-4 h-4 shrink-0" />
          <span>One teammate scanning unlocks the next stage for your entire squad!</span>
        </div>

        {/* Current required stage chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-amber-400 font-mono">
          <span>Target Checkpoint:</span>
          <span className="font-bold text-white">Stage {currentStageRequired} of 4</span>
        </div>
      </div>

      {/* Result feedback notification card */}
      {verificationResult && (
        <div
          className={`p-5 rounded-2xl border text-center space-y-2 animate-in fade-in duration-300 ${
            verificationResult.success
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center justify-center gap-2 font-bold text-sm">
            {verificationResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            )}
            <span>{verificationResult.message}</span>
          </div>

          {verificationResult.success && (
            <div className="pt-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-md"
              >
                <span>{language === 'am' ? 'ወደ ዳሽቦርድ ተመለስ' : 'Return to Dashboard'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input Mode Tabs: Camera Viewfinder vs Manual Short Code */}
      <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'camera'
              ? 'bg-amber-400 text-slate-950 shadow-sm font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{language === 'am' ? 'የካሜራ ስካነር (Camera)' : 'Camera QR Scanner'}</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'manual'
              ? 'bg-amber-400 text-slate-950 shadow-sm font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>{language === 'am' ? 'አጭር ኮድ (Manual)' : 'Manual Short Code'}</span>
        </button>
      </div>

      {activeTab === 'camera' ? (
        /* Real Camera QR Scanner View */
        <div className="bg-slate-900/90 rounded-3xl p-6 border border-slate-800 space-y-4 text-center shadow-xl">
          <div className="relative aspect-square max-w-[320px] mx-auto bg-slate-950 rounded-2xl border-2 border-amber-500/40 overflow-hidden shadow-inner flex items-center justify-center">
            {/* Live Camera Video Element */}
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isScanning ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Hidden canvas for image data pixel analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder crosshairs overlay */}
            <div className="absolute inset-4 pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
              {/* Animated laser scanning line */}
              {isScanning && (
                <div className="absolute left-2 right-2 h-0.5 bg-amber-400/90 shadow-[0_0_12px_#f59e0b] animate-bounce top-1/2" />
              )}
            </div>

            {/* Camera Loading or Error State */}
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/90 space-y-3">
                <Camera className="w-10 h-10 text-slate-500" />
                <div className="text-xs text-slate-300 font-medium">
                  {cameraError ? 'Camera unavailable or permission denied' : 'Initializing camera stream...'}
                </div>
                <button
                  onClick={startCamera}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
              </div>
            )}
          </div>

          {/* Camera controls toolbar */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => {
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
              title="Flip Camera (Front/Rear)"
            >
              <SwitchCamera className="w-3.5 h-3.5 text-amber-400" />
              <span>{facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}</span>
            </button>

            {/* Upload QR image alternative */}
            <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Scan QR Image</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>

          {/* Scanned code feedback */}
          {scannedCodeFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              Scanned: {scannedCodeFeedback}
            </div>
          )}

          {/* Quick manual code entry directly under camera */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="text-[11px] font-semibold text-slate-300">
              Camera not reading? Enter checkpoint code manually:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="e.g. GC-LIB-2026"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono uppercase text-center focus:outline-none focus:border-amber-400 placeholder-slate-600 tracking-wider"
              />
              <button
                type="button"
                onClick={() => handleVerify()}
                disabled={!inputCode.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0 shadow-sm"
              >
                Verify Code
              </button>
            </div>
          </div>

          {/* Direct Simulator for desktop/testing convenience */}
          {currentCheckpoint && (
            <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
              <div className="text-[10px] text-slate-400 uppercase font-mono">
                Stage {currentStageRequired} Testing Shortcut:
              </div>
              <button
                type="button"
                onClick={() => handleVerify(currentCheckpoint.qrCodeValue)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all"
              >
                Simulate QR Sign Scan: {currentCheckpoint.shortCode}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Manual Short Code Input Form */
        <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-4 shadow-xl">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t.check_manual_label}
            </label>
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder={t.check_manual_placeholder}
              className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-amber-400 uppercase"
              autoFocus
            />
          </div>

          <button
            onClick={() => handleVerify()}
            disabled={!inputCode.trim()}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <span>{t.check_verify_btn}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {currentCheckpoint && (
            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-center">
              <div className="text-[10px] text-slate-400 uppercase font-mono">
                Current Stage Code:
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputCode(currentCheckpoint.shortCode);
                  handleVerify(currentCheckpoint.shortCode);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-mono font-bold transition-colors"
              >
                <span>Autofill & Verify: {currentCheckpoint.shortCode}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Anti-cheat guidelines */}
      <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-300">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Anti-Cheat & Verification Security</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
          <li>Checkpoints must be verified in order (Stage 1 → 2 → 3 → 4).</li>
          <li>A repeated scan of the same stage returns "already completed".</li>
          <li>Server-received verification timestamp determines official podium rankings.</li>
        </ul>
      </div>
    </div>
  );
};
