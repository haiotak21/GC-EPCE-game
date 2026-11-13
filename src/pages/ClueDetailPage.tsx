import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { playMysteryAudioClue, getActiveClueForGroup } from '../lib/store';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  FileText,
  KeyRound,
  QrCode,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Download,
} from 'lucide-react';

export const ClueDetailPage: React.FC<{
  clueId: string;
  navigate: (path: string) => void;
}> = ({ clueId, navigate }) => {
  const { store, t, language, myGroup } = useGame();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const matched = store.clues.find((c) => c.id === clueId) || store.clues[0];
  const clue = myGroup ? getActiveClueForGroup(store.clues, matched.stage, myGroup.id) : matched;

  const handlePlayAudio = async () => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    await playMysteryAudioClue();
    setIsPlayingAudio(false);
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6 pb-28">
      {/* Top Back Nav */}
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      {/* Clue Header Card */}
      <div className="bg-slate-900/90 rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
            Stage {clue.stage} of 4
          </span>
          <span className="text-xs font-mono text-slate-400">
            {clue.releasedAt ? new Date(clue.releasedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          {language === 'am' ? clue.titleAmharic : clue.titleEnglish}
        </h1>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          {language === 'am' ? clue.bodyAmharic : clue.bodyEnglish}
        </p>

        {/* Riddle Callout Box */}
        {clue.riddleAmharic && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm italic leading-relaxed space-y-1">
            <div className="text-[10px] uppercase font-mono font-bold text-amber-400 not-italic tracking-wider">
              {language === 'am' ? 'የካምፓስ እንቆቅልሽ' : 'Campus Riddle'}
            </div>
            <div>"{language === 'am' ? clue.riddleAmharic : clue.riddleEnglish}"</div>
          </div>
        )}

        {/* Audio Player Card (for audio clues) */}
        {clue.mediaType === 'audio' && (
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {language === 'am' ? 'የድምፅ ፍንጭ ቅንብር' : 'Acoustic Mystery Chime'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isPlayingAudio ? 'Playing chime notes...' : 'Tap play to listen'}
                  </div>
                </div>
              </div>

              <button
                onClick={handlePlayAudio}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-all"
              >
                {isPlayingAudio ? <VolumeX className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                <span>{isPlayingAudio ? 'Listening...' : t.hint_audio_listen}</span>
              </button>
            </div>

            {/* Expandable Transcript */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.hint_transcript}</span>
                </span>
                {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showTranscript && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans">
                  {language === 'am' ? clue.transcriptAmharic : clue.transcriptEnglish}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coded Cipher Panel */}
        {clue.codedCipher && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-mono font-bold text-slate-400">
                  {t.hint_cipher}
                </div>
                <div className="text-xs sm:text-sm font-mono font-bold text-white tracking-wider">
                  {clue.codedCipher}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attached PDF Map or Media */}
        {(clue.attachedPdfUrl || clue.attachedAudioUrl) && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="text-[10px] uppercase font-mono font-bold text-amber-400">
              Attached Clue Evidence / ተጨማሪ ፋይሎች
            </div>

            <div className="flex flex-wrap gap-2.5">
              {clue.attachedPdfUrl && (
                <a
                  href={clue.attachedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-amber-300 font-bold flex items-center gap-2 transition-all hover:border-amber-500/50"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>{clue.attachmentName || 'Campus Map Guide (PDF)'}</span>
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                </a>
              )}

              {clue.attachedAudioUrl && (
                <button
                  type="button"
                  onClick={handlePlayAudio}
                  disabled={isPlayingAudio}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-amber-300 font-bold flex items-center gap-2 transition-all hover:border-amber-500/50"
                >
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>{isPlayingAudio ? 'Playing Chime...' : 'Play Audio Note'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Organizer Addenda Notes */}
        {clue.organizerAddenda && clue.organizerAddenda.length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="text-[10px] uppercase font-mono font-bold text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Organizer Addenda / የአዘጋጆች ተጨማሪ ማስታወሻ</span>
            </div>
            {clue.organizerAddenda.map((note, idx) => (
              <p key={idx} className="text-xs text-slate-300 leading-relaxed">
                {note}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/checkpoint')}
          className="py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
        >
          <QrCode className="w-5 h-5" />
          <span>{language === 'am' ? 'ጣቢያውን አረጋግጥ (Verify)' : 'Verify This Checkpoint'}</span>
        </button>

        <button
          onClick={() => navigate('/help')}
          className="py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-sm border border-slate-700/80 flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          <LifeBuoy className="w-5 h-5 text-amber-400" />
          <span>{t.dash_help_btn}</span>
        </button>
      </div>
    </div>
  );
};
