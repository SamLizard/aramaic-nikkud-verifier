import React, { useState } from "react";
import {
  Loader2, Info, CheckCircle2, XCircle, Search, BookOpen, X,
} from "lucide-react";
import { generatePrompt } from "../lib/groq";
import type { WordEntry, DisplayOccurrence } from "../types";
import { MANUAL_STATUS_OPTIONS } from "../constants";
import {
  normalizeTrials,
  normalizeAiVerification,
  getExactMatchFlag,
  getManualStatusOption,
  getEffectiveModelUsed,
  extractDictionaryNikkudWord,
  hasSameDisplayedNikkud,
  getTrialTone,
  flattenOccurrences,
} from "../utils";
import {
  renderComparedWord,
  renderOccurrenceContext,
  renderSteinsaltzContext,
} from "./renderers";

interface WordDetailPanelProps {
  word: WordEntry;
  onUpdate: (updater: (entry: WordEntry) => WordEntry) => void;
  onClose: () => void;
}

// ─── Small sub-component for a single occurrence card ────────────────────────

interface OccurrenceCardProps {
  occurrence: DisplayOccurrence;
  dictionaryNikkudWord: string | null;
}

const OccurrenceCard: React.FC<OccurrenceCardProps> = ({ occurrence, dictionaryNikkudWord }) => (
  <div className="border border-[#D4C3A3] rounded-lg overflow-hidden bg-white">
    <div className="flex justify-between items-center bg-[#F6F1E6] px-3 py-2 border-b border-[#D4C3A3]/40">
      <div className="flex items-center gap-2">
        <span className="text-[8px] opacity-35 font-bold uppercase">
          occ. {occurrence.occurrenceIndex + 1}
        </span>
        {dictionaryNikkudWord &&
        hasSameDisplayedNikkud(occurrence.gemaraWord, dictionaryNikkudWord) ? (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 font-bold">
            {dictionaryNikkudWord}
          </span>
        ) : null}
      </div>
      <h5 className="font-serif text-sm font-bold" dir="rtl">
        {occurrence.pageLabel}
      </h5>
    </div>

    <div className="px-3 py-2.5">
      <p className="text-right font-serif text-lg leading-loose" dir="rtl">
        {renderOccurrenceContext(occurrence)}
      </p>
      {(occurrence.steinsaltzContext ||
        occurrence.steinsaltzContextTokens.length > 0) && (
        <p
          className="text-right font-serif text-sm text-gray-600 mt-2 leading-relaxed border-t border-dashed border-[#D4C3A3]/40 pt-2"
          dir="rtl"
        >
          {renderSteinsaltzContext(occurrence)}
        </p>
      )}
    </div>

    {(occurrence.urlNikud || occurrence.urlExplain) && (
      <div className="flex gap-4 px-3 py-1.5 bg-gray-50/60 border-t border-[#D4C3A3]/30">
        {occurrence.urlNikud && (
          <a
            href={occurrence.urlNikud}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-[#C4A35A] font-bold uppercase tracking-wide hover:underline"
          >
            ↗ Texte vocalisé
          </a>
        )}
        {occurrence.urlExplain && (
          <a
            href={occurrence.urlExplain}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-[#C4A35A] font-bold uppercase tracking-wide hover:underline"
          >
            ↗ Explication
          </a>
        )}
      </div>
    )}
  </div>
);

// ─── Main detail panel ───────────────────────────────────────────────────────

const WordDetailPanel: React.FC<WordDetailPanelProps> = ({ word, onUpdate, onClose }) => {
  const [showPrompt, setShowPrompt] = useState(false);

  const exactMatch = getExactMatchFlag(word);
  const modelUsed = getEffectiveModelUsed(word.ai_verification);
  const manualStatus = getManualStatusOption(word.manual_status);
  const dictionaryNikkudWord = extractDictionaryNikkudWord(word);
  const occurrences = flattenOccurrences(word);

  const shouldGroupOccurrences = Boolean(
    word.ai_verification.nikkud_correct === false &&
    word.ai_verification.corrected_nikkud_word
  );

  const occurrenceGroups = shouldGroupOccurrences
    ? [
        {
          key: "mine",
          title: "Comme mon nikkud",
          dictionaryMatch: dictionaryNikkudWord
            ? hasSameDisplayedNikkud(word.word_with_nikkud, dictionaryNikkudWord)
            : false,
          occurrences: occurrences.filter((occ) =>
            hasSameDisplayedNikkud(occ.gemaraWord, word.word_with_nikkud)
          ),
        },
        {
          key: "ai",
          title: "Comme la correction IA",
          dictionaryMatch: dictionaryNikkudWord
            ? hasSameDisplayedNikkud(
                word.ai_verification.corrected_nikkud_word || "",
                dictionaryNikkudWord
              )
            : false,
          occurrences: occurrences.filter((occ) =>
            hasSameDisplayedNikkud(
              occ.gemaraWord,
              word.ai_verification.corrected_nikkud_word || ""
            )
          ),
        },
        {
          key: "other",
          title: "Autres nikkudim",
          dictionaryMatch: false,
          occurrences: occurrences.filter(
            (occ) =>
              !hasSameDisplayedNikkud(occ.gemaraWord, word.word_with_nikkud) &&
              !hasSameDisplayedNikkud(
                occ.gemaraWord,
                word.ai_verification.corrected_nikkud_word || ""
              )
          ),
        },
      ]
    : [];

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

        <div className="p-4 pb-0">
          <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C]">
                Revue manuelle
              </h4>
              {manualStatus ? (
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${manualStatus.className}`}>
                  {manualStatus.label}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {MANUAL_STATUS_OPTIONS.map((option) => {
                const isActive = word.manual_status === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() =>
                      onUpdate((entry) => ({
                        ...entry,
                        manual_status: entry.manual_status === option.value ? null : option.value,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${
                      option.className
                    } ${isActive ? "ring-2 ring-offset-1 ring-[#8B5E3C]/25" : "opacity-75"}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() =>
                onUpdate((entry) => ({
                  ...entry,
                  ai_verification: {
                    ...normalizeAiVerification(entry.ai_verification),
                    needs_ai_rerun: !normalizeAiVerification(entry.ai_verification).needs_ai_rerun,
                  },
                }))
              }
              className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase w-fit ${
                word.ai_verification.needs_ai_rerun
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : "bg-white text-[#8B5E3C] border-[#D4C3A3]"
              }`}
            >
              {word.ai_verification.needs_ai_rerun
                ? "Relance IA activée"
                : "Marquer pour relance IA"}
            </button>
            <textarea
              value={word.manual_note || ""}
              onChange={(e) =>
                onUpdate((entry) => ({
                  ...entry,
                  manual_note: e.target.value,
                }))
              }
              placeholder="Note libre pour cette entrée…"
              rows={4}
              className="w-full py-2 px-3 rounded border border-[#D4C3A3] text-base leading-relaxed bg-[#FDFBF7] focus:outline-none focus:border-[#C4A35A] resize-y"
            />
          </div>
        </div>

        {word._status === "done" && (
          <div className="p-4 space-y-3">
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
                </div>
                <div className="font-serif text-xl text-right leading-loose" dir="rtl">
                  {!word.ai_verification.nikkud_correct &&
                  word.ai_verification.corrected_nikkud_word
                    ? renderComparedWord(
                        word.word_with_nikkud,
                        word.ai_verification.corrected_nikkud_word,
                        "original"
                      )
                    : word.word_with_nikkud}
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
                        word.word_with_nikkud,
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
                  {word.ai_verification.notes}
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
        )}

        {normalizeTrials(word.ai_verification.ai_trials).length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C]">
                Historique des essais IA
              </h4>
              {normalizeTrials(word.ai_verification.ai_trials).map((trial, index) => (
                <div
                  key={`${trial.model}-${index}`}
                  className={`border rounded-lg p-3 space-y-2 ${getTrialTone(trial)}`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase font-bold">
                    <span>{trial.model}</span>
                    <span>{trial.status}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{trial.message}</p>
                  <pre className="text-[10px] whitespace-pre-wrap break-words bg-white/70 border border-current/15 rounded p-3 font-mono">
                    {trial.raw_response || trial.message}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

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

        <div className="p-4 pt-0">
          <header className="border-b-2 border-[#1F130B]/10 pb-2 flex justify-between items-center mb-3">
            <h4 className="font-serif text-base text-[#1F130B]">
              Sources Guemara ({occurrences.length})
            </h4>
            <BookOpen className="w-4 h-4 opacity-10" />
          </header>

          {occurrences.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-xl italic text-[11px] text-gray-400">
              Aucune source trouvée.
            </div>
          ) : shouldGroupOccurrences ? (
            <div className="space-y-4">
              {occurrenceGroups.map((group) => (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className="font-serif text-sm text-[#1F130B]">
                        {group.title}
                      </h5>
                      {group.dictionaryMatch && dictionaryNikkudWord ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 font-bold">
                          {dictionaryNikkudWord}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] uppercase font-bold opacity-40">
                      {group.occurrences.length} ressource(s)
                    </span>
                  </div>

                  {group.occurrences.length === 0 ? (
                    <div className="py-4 text-center border border-dashed border-[#D4C3A3] rounded-lg italic text-[11px] text-gray-400 bg-white">
                      Aucune occurrence dans cette catégorie.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {group.occurrences.map((occurrence, occurrenceIndex) => (
                        <OccurrenceCard
                          key={`${group.key}-${occurrence.pageLabel}-${occurrenceIndex}`}
                          occurrence={occurrence}
                          dictionaryNikkudWord={dictionaryNikkudWord}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {occurrences.map((occurrence, occurrenceIndex) => (
                <OccurrenceCard
                  key={`${occurrence.pageLabel}-${occurrenceIndex}`}
                  occurrence={occurrence}
                  dictionaryNikkudWord={dictionaryNikkudWord}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default WordDetailPanel;
