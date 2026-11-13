import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  Lightbulb,
  Radio,
  FileText,
  KeyRound,
  Headphones,
  CheckCircle2,
  Lock,
  Send,
  Save,
  Users,
  Paperclip,
  Volume2,
  FileUp,
} from 'lucide-react';
import { ClueStage } from '../../types';
import { getActiveClueForGroup, playMysteryAudioClue } from '../../lib/store';

export const AdminHintsPage: React.FC = () => {
  const { store, releaseClue, updateClueDraft, language } = useGame();

  const [activeStage, setActiveStage] = useState<1 | 2 | 3 | 4>(1);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);

  // Find or create current clue for activeStage and selectedGroupId
  const getCurrentClue = (stage: 1 | 2 | 3 | 4, grpId: string): ClueStage => {
    if (grpId !== 'all') {
      const specific = store.clues.find(
        (c) => c.stage === stage && c.targetGroupId === grpId
      );
      if (specific) return specific;
      // If not yet created for this group, clone the default stage clue as template
      const fallback = store.clues.find((c) => c.stage === stage && (!c.targetGroupId || c.targetType === 'all')) || store.clues[0];
      return {
        ...fallback,
        id: `clue-${grpId}-s${stage}`,
        targetGroupId: grpId,
        targetType: 'specific_groups',
        targetGroupIds: [grpId],
        titleEnglish: `Stage ${stage} (${store.groups.find(g => g.id === grpId)?.teamName || grpId} Path)`,
        titleAmharic: `ደረጃ ${stage} (${store.groups.find(g => g.id === grpId)?.teamName || grpId})`,
      };
    }
    const general = store.clues.find((c) => c.stage === stage && (!c.targetGroupId || c.targetType === 'all'));
    return general || store.clues[0];
  };

  const [editForm, setEditForm] = useState<ClueStage>(() => getCurrentClue(1, 'all'));

  const handleStageSelect = (stageNum: 1 | 2 | 3 | 4) => {
    setActiveStage(stageNum);
    setEditForm(getCurrentClue(stageNum, selectedGroupId));
  };

  const handleGroupSelect = (grpId: string) => {
    setSelectedGroupId(grpId);
    setEditForm(getCurrentClue(activeStage, grpId));
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    updateClueDraft(editForm);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2500);
  };

  const handlePublishStage = () => {
    releaseClue(activeStage);
  };

  const handleTestAudio = async () => {
    setIsPlayingAudio(true);
    await playMysteryAudioClue();
    setIsPlayingAudio(false);
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Clue Studio & Attachment Manager</h1>
          <p className="text-xs text-slate-400">
            Write distinct clue paths for each squad, attach audio recordings or PDF documents, and publish live.
          </p>
        </div>

        <button
          onClick={handlePublishStage}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
        >
          <Radio className="w-4 h-4" />
          <span>Release Stage {activeStage} Live</span>
        </button>
      </div>

      {/* Target Squad Selector Bar */}
      <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Target Squad Clue Route</span>
          </label>
          <span className="text-[11px] text-amber-400 font-mono">
            {selectedGroupId === 'all' ? 'All Squads Shared Route' : `Custom for ${store.groups.find(g => g.id === selectedGroupId)?.teamName || selectedGroupId}`}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleGroupSelect('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              selectedGroupId === 'all'
                ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Squads (General)
          </button>

          {store.groups.map((g) => (
            <button
              type="button"
              key={g.id}
              onClick={() => handleGroupSelect(g.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedGroupId === g.id
                  ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {g.teamName}
            </button>
          ))}
        </div>
      </div>

      {/* Stage Tabs (1 to 4) */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((s) => {
          const clue = getCurrentClue(s as 1 | 2 | 3 | 4, selectedGroupId);
          const isSelected = activeStage === s;
          const isPublished = clue?.status === 'published';

          return (
            <button
              key={s}
              onClick={() => handleStageSelect(s as 1 | 2 | 3 | 4)}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'bg-amber-500/15 border-amber-400 text-white shadow-sm ring-1 ring-amber-400/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold">Stage {s}</span>
                {isPublished ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Published" />
                ) : (
                  <span title="Draft / Unreleased">
                    <Lock className="w-3 h-3 text-slate-500" />
                  </span>
                )}
              </div>
              <div className="text-xs font-semibold truncate mt-1 text-slate-200">
                {clue ? clue.titleEnglish : `Stage ${s}`}
              </div>
            </button>
          );
        })}
      </div>

      {saveNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Stage {activeStage} clue saved successfully for {selectedGroupId === 'all' ? 'All Squads' : selectedGroupId}!</span>
        </div>
      )}

      {/* Clue Editor Form */}
      <form onSubmit={handleSaveDraft} className="bg-slate-900/80 rounded-3xl p-6 sm:p-7 border border-slate-800 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase text-amber-400">
              Editing Stage {activeStage} Clue
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({selectedGroupId === 'all' ? 'Universal' : `Custom for ${selectedGroupId}`})
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              editForm.status === 'published'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {editForm.status}
          </span>
        </div>

        {/* English & Amharic Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Clue Title (English)
            </label>
            <input
              type="text"
              value={editForm.titleEnglish}
              onChange={(e) => setEditForm({ ...editForm, titleEnglish: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Clue Title (Amharic)
            </label>
            <input
              type="text"
              value={editForm.titleAmharic}
              onChange={(e) => setEditForm({ ...editForm, titleAmharic: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400 font-sans"
            />
          </div>
        </div>

        {/* Clue Story Narrative */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Clue Narrative & Directions
          </label>
          <textarea
            rows={3}
            value={editForm.bodyEnglish}
            onChange={(e) => setEditForm({ ...editForm, bodyEnglish: e.target.value })}
            placeholder="Describe the mystery location, landmarks, and context..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400 resize-none"
          />
        </div>

        {/* Riddle Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Poetic Riddle / እንቆቅልሽ
          </label>
          <input
            type="text"
            value={editForm.riddleEnglish || editForm.riddleAmharic || ''}
            onChange={(e) =>
              setEditForm({
                ...editForm,
                riddleEnglish: e.target.value,
                riddleAmharic: e.target.value,
              })
            }
            placeholder="e.g. I have four faces but no eyes; two hands that never rest..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-amber-300 italic focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Attachments Section: Audio & PDF */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-amber-400" />
            <span>Clue Media Attachments (Audio & PDF)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* PDF Attachment */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-400">
                Attached PDF Document / Map URL
              </label>
              <input
                type="text"
                value={editForm.attachedPdfUrl || ''}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    attachedPdfUrl: e.target.value,
                    attachmentName: e.target.value ? 'Campus_Document.pdf' : undefined,
                  })
                }
                placeholder="e.g. /assets/aistudio/campus_map.pdf"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Audio Attachment */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-400">
                  Audio Attachment / Chime
                </label>
                <button
                  type="button"
                  onClick={handleTestAudio}
                  disabled={isPlayingAudio}
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{isPlayingAudio ? 'Playing...' : 'Test Sound'}</span>
                </button>
              </div>
              <input
                type="text"
                value={editForm.attachedAudioUrl || ''}
                onChange={(e) => setEditForm({ ...editForm, attachedAudioUrl: e.target.value })}
                placeholder="synthesized_chime or audio URL"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Location Placeholder & Coded Cipher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Location Placeholder / Label
            </label>
            <input
              type="text"
              value={editForm.locationPlaceholder}
              onChange={(e) => setEditForm({ ...editForm, locationPlaceholder: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Coded Cipher (Optional)
            </label>
            <input
              type="text"
              value={editForm.codedCipher || ''}
              onChange={(e) => setEditForm({ ...editForm, codedCipher: e.target.value })}
              placeholder="e.g. CIPHER-71: L-I-B // 2026"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Clue Route</span>
          </button>
        </div>
      </form>
    </div>
  );
};
