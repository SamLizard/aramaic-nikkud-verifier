import React, { useState } from "react";
import { Loader2, Search, BookOpen, X } from "lucide-react";
import { generatePrompt } from "../lib/groq";
import type { WordEntry } from "../types";
import ManualReviewSection from "./ManualReviewSection";
import AiResultSection from "./AiResultSection";
import TrialHistorySection from "./TrialHistorySection";
import OccurrenceList from "./OccurrenceList";

interface WordDetailPanelProps {
  word: WordEntry;
  onUpdate: (updater: (entry: WordEntry) => WordEntry) => void;
  onClose: () => void;
}

const WordDetailPanel: React.FC<WordDetailPanelProps> = ({ word, onUpdate, onClose }) => {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <>
      <div className="bg-[#1F130B] text-white p-4 shrink-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[9px] font-black tracking-widest uppercase opacity-35">
            Expertise Linguistique
          </span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex justify-between items-baseline gap-3 mb-3">
          <p className="text-sm opacity-55 italic max-w-[45%] leading-relaxed">
            « {word.french_meaning} »
          </p>
          <h3 className="font-serif text-2xl font-bold text-right" dir="rtl">
            {word.word_with_nikkud}
          </h3>
        </div>
        <div className="flex gap-2">
          {word.dictionary.dict_url && (
            <a
              href={word.dictionary.dict_url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 bg-[#C4A35A] hover:bg-[#B3934A] text-white text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors uppercase tracking-widest"
            >
              <Search className="w-3 h-3" /> Dictionnaire
            </a>
          )}
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors uppercase tracking-widest"
          >
            {showPrompt ? "Masquer Prompt" : "Voir Prompt"}
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto bg-[#FDFBF7]">
        {showPrompt && (
          <pre className="m-4 p-4 bg-gray-900 text-green-400 text-[10px] font-mono whitespace-pre-wrap leading-relaxed rounded-lg shadow-inner">
            {generatePrompt(word)}
          </pre>
        )}

        <div className="p-4 pb-0">
          <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
            <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
              <BookOpen className="w-3 h-3" /> Dictionnaire
            </h4>
            <div className="space-y-2 text-base leading-relaxed">
              <p><span className="font-bold">Requête :</span> {word.dictionary.query_used || "—"}</p>
              <p><span className="font-bold">Définition :</span> {word.dictionary.meaning || "—"}</p>
              <p>
                <span className="font-bold">Suggestions :</span>{" "}
                {word.dictionary.suggestions?.length
                  ? word.dictionary.suggestions.join(", ")
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        <ManualReviewSection word={word} onUpdate={onUpdate} />

        {word._status === "done" && <AiResultSection word={word} />}

        <TrialHistorySection trials={word.ai_verification.ai_trials} />

        {word._status === "error" && (
          <div className="m-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 space-y-2">
            <p>{word.ai_verification.last_error || "Erreur lors de l'analyse. Relancez l'analyse pour réessayer."}</p>
          </div>
        )}

        {(word._status === "pending" || word._status === "processing") && (
          <div className="m-4 p-3 rounded-lg border border-[#D4C3A3] bg-[#F6F1E6] text-sm text-[#8B5E3C] italic text-center flex items-center justify-center gap-2">
            {word._status === "processing" && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {word._status === "processing" ? "Analyse en cours…" : "En attente d'analyse…"}
          </div>
        )}

        <OccurrenceList word={word} />
      </div>
    </>
  );
};

export default WordDetailPanel;
