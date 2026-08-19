import React from "react";
import { Info, CheckCircle2, XCircle, BookOpen, AlertTriangle } from "lucide-react";
import type { WordEntry } from "../types";
import {
  getExactMatchFlag,
  getEffectiveModelUsed,
  getAiVerdictWord,
  isAiVerdictOutdated,
} from "../utils";
import { renderComparedWord } from "./renderers";
import { highlightWordInText } from "./highlightWord";

interface AiResultSectionProps {
  word: WordEntry;
}

const AiResultSection: React.FC<AiResultSectionProps> = ({ word }) => {
  const exactMatch = getExactMatchFlag(word);
  const modelUsed = getEffectiveModelUsed(word.ai_verification);
  // The verdict describes the pre-edit form until the entry is rerun, so show
  // that form here rather than the current one.
  const verdictWord = getAiVerdictWord(word);
  const verdictIsOutdated = isAiVerdictOutdated(word);

  return (
    <div className="p-4 space-y-3">
      {verdictIsOutdated ? (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-900 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Analyse effectuée sur le mot d'origine (affiché ci-dessous). Votre
            mot corrigé{" "}
            <span className="font-serif text-sm font-bold" dir="rtl">
              {word.word_with_nikkud}
            </span>{" "}
            n'a pas encore été analysé.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-[10px] uppercase font-bold text-[#8B5E3C]">
        <span>Modèle utilisé : {modelUsed || "—"}</span>
        <div className="flex items-center gap-3">
          {word.ai_verification.needs_ai_rerun ? (
            <span className="text-blue-700">Relance IA demandée</span>
          ) : null}
          {exactMatch !== null && (
            <span className={exactMatch ? "text-green-700" : "text-red-700"}>
              Même exact ? {exactMatch ? "true" : "false"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className={`p-3 rounded-lg border-2 ${
            word.ai_verification.nikkud_correct
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-2">
            {word.ai_verification.nikkud_correct ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-600" />
            )}
            <span className="text-[8px] font-black uppercase tracking-widest opacity-50">
              {word.ai_verification.nikkud_correct ? "Correct" : "À corriger"}
            </span>
            {verdictIsOutdated ? (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-700">
                · mot d'origine
              </span>
            ) : null}
          </div>
          <div className="font-serif text-xl text-right leading-loose" dir="rtl">
            {!word.ai_verification.nikkud_correct &&
            word.ai_verification.corrected_nikkud_word
              ? renderComparedWord(
                  verdictWord,
                  word.ai_verification.corrected_nikkud_word,
                  "original"
                )
              : verdictWord}
          </div>
        </div>

        <div
          className={`p-3 rounded-lg border-2 flex flex-col justify-center ${
            !word.ai_verification.nikkud_correct &&
            word.ai_verification.corrected_nikkud_word
              ? "bg-amber-50 border-amber-200"
              : "bg-[#F6F1E6] border-[#D4C3A3]"
          }`}
        >
          {!word.ai_verification.nikkud_correct &&
          word.ai_verification.corrected_nikkud_word ? (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[8px] font-black uppercase tracking-widest opacity-50">
                  Correction IA
                </span>
              </div>
              <div className="font-serif text-xl text-right font-bold text-green-800 leading-loose" dir="rtl">
                {renderComparedWord(
                  word.ai_verification.corrected_nikkud_word,
                  verdictWord,
                  "corrected"
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-gray-400 italic text-center">
              {word.ai_verification.nikkud_correct
                ? "Vocalisation correcte ✓"
                : "Aucune correction fournie"}
            </p>
          )}
        </div>
      </div>

      {word.ai_verification.notes && (
        <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
          <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
            <Info className="w-3 h-3" /> Analyse Grammaticale
          </h4>
          <p className="text-base leading-relaxed text-[#2D1B0E]">
            {highlightWordInText(word.ai_verification.notes, word)}
          </p>
        </div>
      )}

      {word.ai_verification.pages_same_meaning.length > 0 && (
        <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
          <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
            <BookOpen className="w-3 h-3" /> Même sens —{" "}
            {word.ai_verification.pages_same_meaning.length} page(s)
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {word.ai_verification.pages_same_meaning.map((page, index) => (
              <span
                key={index}
                className="text-xs px-2.5 py-0.5 rounded-full bg-[#F6F1E6] border border-[#D4C3A3] font-serif"
                dir="rtl"
              >
                {page}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AiResultSection;
