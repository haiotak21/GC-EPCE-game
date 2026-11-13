import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  QrCode,
  Download,
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
} from 'lucide-react';

export const AdminCheckpointsPage: React.FC = () => {
  const { store, language } = useGame();
  const [printPreviewStage, setPrintPreviewStage] = useState<number | null>(null);

  const checkpointToPrint = store.checkpoints.find((c) => c.stage === printPreviewStage);

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">QR Checkpoints & Verification</h1>
          <p className="text-xs text-slate-400">
            Issue checkpoint credentials, test scan codes, print physical posters, and audit attempts.
          </p>
        </div>
      </div>

      {/* 4 Checkpoint Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {store.checkpoints.map((chk) => (
          <div
            key={chk.id}
            className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Checkpoint {chk.stage}
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                {chk.status}
              </span>
            </div>

            <div>
              <div className="text-sm font-bold text-white">{chk.locationLabel}</div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>Short Code:</span>
                <span className="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {chk.shortCode}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-400 truncate">
              QR Value: <span className="text-slate-300">{chk.qrCodeValue}</span>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">Window: {chk.scanWindowMinutes}m</span>
              <button
                onClick={() => setPrintPreviewStage(chk.stage)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Poster Card</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Attempt Verification Logs */}
      <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verification Attempt Logs & Anti-Cheat Feed</span>
          </h2>
          <span className="text-xs font-mono text-slate-400">
            {store.attempts.length} Total Attempts
          </span>
        </div>

        <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
          {store.attempts.length > 0 ? (
            store.attempts.map((att) => {
              const isSuccess = att.result === 'success';

              return (
                <div key={att.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2.5">
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold text-white">
                        {att.participantName}{' '}
                        <span className="text-slate-500 font-normal">
                          (Group {att.groupId.replace('grp-', '')})
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Code: <span className="text-amber-300">{att.codeEntered}</span> · Stage {att.stage}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                        isSuccess
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {att.result}
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {new Date(att.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs">
              No verification attempts recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Printable Poster Card Preview Modal */}
      {checkpointToPrint && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-6 text-center shadow-2xl">
            <div className="text-xs uppercase font-mono tracking-widest text-amber-400 font-bold">
              GC Mystery Hunt · Physical Checkpoint Sign
            </div>

            <div className="text-2xl font-black text-white">
              STAGE {checkpointToPrint.stage}
            </div>

            <div className="p-4 bg-white rounded-2xl mx-auto w-48 h-48 flex flex-col items-center justify-center text-slate-950">
              <QrCode className="w-32 h-32" />
              <span className="text-[9px] font-mono font-bold mt-1">SCAN ON-SITE</span>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-mono text-slate-400">Manual Short Code:</div>
              <div className="text-xl font-mono font-black text-amber-400 tracking-wider">
                {checkpointToPrint.shortCode}
              </div>
            </div>

            <div className="text-xs text-slate-300">
              {checkpointToPrint.locationLabel}
            </div>

            <button
              onClick={() => setPrintPreviewStage(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
            >
              Close Print Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
