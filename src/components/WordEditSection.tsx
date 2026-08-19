import React, { useEffect, useState } from "react";
import { Pencil, RotateCcw, Check, X, History } from "lucide-react";
import type { WordEntry } from "../types";
import {
  applyManualWordEdit,
  revertManualWordEdit,
  acknowledgeManualWordEdit,
  normalizeDisplayedHebrew,
} from "../utils";
import { renderComparedWord } from "./renderers";

interface WordEditSectionProps {
  word: WordEntry;
  onUpdate: (updater: (entry: WordEntry) => WordEntry) => void;
}

const formatEditedAt = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const WordEditSection: React.FC<WordEditSectionProps> = ({ word, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(word.word_with_nikkud);

  const edit = word.manual_word_edit || null;

  // Reset the local draft whenever another word is selected or the stored
  // value changes underneath us.
  useEffect(() => {
    setEditing(false);
    setDraft(word.word_with_nikkud);
  }, [word.word_with_nikkud]);

  const trimmedDraft = normalizeDisplayedHebrew(draft);
  const isUnchanged =
    trimmedDraft === normalizeDisplayedHebrew(word.word_with_nikkud);
  const canSave = Boolean(trimmedDraft) && !isUnchanged;

  const handleSave = () => {
    if (!canSave) {
      setEditing(false);
      setDraft(word.word_with_nikkud);
      return;
    }
    onUpdate((entry) => applyManualWordEdit(entry, trimmedDraft));
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(word.word_with_nikkud);
  };

  return (
    <div className="p-4 pb-0">
      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C] flex items-center gap-1.5">
            <Pencil className="w-3 h-3" /> Mot vérifié
          </h4>
          {edit ? (
            <span
              className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                edit.ai_verdict_outdated
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-violet-100 text-violet-800 border-violet-200"
              }`}
              title={`Corrigé à la main le ${formatEditedAt(edit.edited_at)}`}
            >
              Corrigé à la main
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className="space-y-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              dir="rtl"
              autoFocus
              aria-label="Mot vocalisé corrigé"
              className="w-full py-2 px-3 rounded border border-[#C4A35A] font-serif text-2xl text-right bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#C4A35A]/40"
            />
            <p className="text-[10px] text-[#8B5E3C] opacity-70 italic">
              Le mot d'origine sera conservé et l'analyse IA marquée comme à
              revoir.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 bg-green-100 text-green-800 border-green-200 disabled:opacity-40"
              >
                <Check className="w-3 h-3" /> Enregistrer
              </button>
              <button
                onClick={handleCancel}
                className="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 bg-white text-[#8B5E3C] border-[#D4C3A3]"
              >
                <X className="w-3 h-3" /> Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 bg-white text-[#8B5E3C] border-[#D4C3A3] hover:bg-[#F6F1E6] shrink-0"
            >
              <Pencil className="w-3 h-3" /> Modifier
            </button>
            <div
              className="font-serif text-2xl text-right leading-loose"
              dir="rtl"
            >
              {edit
                ? renderComparedWord(
                    word.word_with_nikkud,
                    edit.original_word_with_nikkud,
                    "corrected"
                  )
                : word.word_with_nikkud}
            </div>
          </div>
        )}

        {edit && !editing ? (
          <div className="border-t border-[#D4C3A3]/50 pt-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C] opacity-60 flex items-center gap-1 shrink-0 pt-1">
                <History className="w-3 h-3" /> Origine
              </span>
              <div
                className="font-serif text-lg text-right leading-loose opacity-60 line-through decoration-red-400/60"
                dir="rtl"
              >
                {renderComparedWord(
                  edit.original_word_with_nikkud,
                  word.word_with_nikkud,
                  "original"
                )}
              </div>
            </div>
            <p className="text-[9px] text-[#8B5E3C] opacity-50">
              Modifié le {formatEditedAt(edit.edited_at)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onUpdate(revertManualWordEdit)}
                className="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 bg-white text-[#8B5E3C] border-[#D4C3A3] hover:bg-[#F6F1E6]"
              >
                <RotateCcw className="w-3 h-3" /> Rétablir l'origine
              </button>
              {edit.ai_verdict_outdated ? (
                <button
                  onClick={() => onUpdate(acknowledgeManualWordEdit)}
                  className="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase flex items-center gap-1 bg-amber-100 text-amber-800 border-amber-200"
                  title="L'analyse IA affichée porte sur le mot d'origine"
                >
                  <Check className="w-3 h-3" /> Verdict IA revu
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WordEditSection;
