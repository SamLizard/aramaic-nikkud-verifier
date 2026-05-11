import React from "react";
import {
  Loader2, FileUp, CheckCircle2, XCircle, Layers, ArrowUpDown,
} from "lucide-react";
import type { WordEntry } from "../types";
import type { SortKey, Filters } from "../constants";
import {
  EMPTY_FILTERS,
  STATUS_FILTER_OPTIONS,
  EXACT_FILTER_OPTIONS,
  MANUAL_FILTER_OPTIONS,
  CORRECTION_FILTER_OPTIONS,
} from "../constants";
import { getExactMatchFlag, getManualStatusOption } from "../utils";
import { renderComparedWord } from "./renderers";

interface SortedRow {
  entry: WordEntry;
  originalIndex: number;
}

interface VerificationTableProps {
  results: WordEntry[];
  sortedResults: SortedRow[];
  selectedWordIdx: number | null;
  filters: Filters;
  onSort: (key: SortKey) => void;
  onFilterChange: (filters: Filters) => void;
  onSelectWord: (index: number) => void;
}

const VerificationTable: React.FC<VerificationTableProps> = ({
  results,
  sortedResults,
  selectedWordIdx,
  filters,
  onSort,
  onFilterChange,
  onSelectWord,
}) => {
  return (
    <div className="bg-white border border-[#D4C3A3] rounded-lg shadow-sm overflow-hidden flex flex-col h-[70vh]">
      <div className="bg-[#1F130B] p-4 text-[#FDFBF7] flex justify-between items-center shrink-0">
        <span className="flex items-center gap-2 font-serif text-sm">
          <Layers className="w-4 h-4 text-[#C4A35A]" /> Table de Vérification
        </span>
        <span className="text-[10px] opacity-40 uppercase tracking-widest">
          {sortedResults.length}
          {sortedResults.length !== results.length
            ? ` / ${results.length}`
            : ""}{" "}
          Mots
        </span>
      </div>
      <div className="overflow-auto flex-grow">
        {results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 opacity-15">
            <FileUp className="w-12 h-12" />
            <p className="font-serif text-base">Chargez un fichier JSON pour commencer</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#F6F1E6] z-10">
              <tr className="border-b border-[#D4C3A3] text-[9px] font-bold text-[#8B5E3C] uppercase">
                {[
                  ["index", "#", "w-10 text-center"],
                  ["word", "Mot (Nikkud)", "w-40"],
                  ["dictionary", "Dictionnaire", "w-36"],
                  ["meaning", "Sens français", ""],
                  ["status", "Statut", "w-20 text-center"],
                  ["manual", "Manuel", "w-28 text-center"],
                  ["exact", "Même exact ?", "w-24 text-center"],
                  ["correction", "Correction IA", "w-40"],
                ].map(([key, label, className]) => (
                  <th key={key} className={`p-3 ${className}`}>
                    <button
                      onClick={() => onSort(key as SortKey)}
                      className="flex items-center gap-1 w-full"
                    >
                      <span>{label}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    </button>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-[#D4C3A3] bg-[#FDFBF7]">
                <th className="px-2 py-1.5 text-center">
                  {Object.values(filters).some((value) => value !== "") ? (
                    <button
                      onClick={() => onFilterChange(EMPTY_FILTERS)}
                      title="Effacer tous les filtres"
                      className="text-[9px] font-bold text-[#8B5E3C] opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  ) : null}
                </th>
                <th className="px-2 py-1.5">
                  <input
                    type="text"
                    value={filters.word}
                    onChange={(e) =>
                      onFilterChange({ ...filters, word: e.target.value })
                    }
                    placeholder="Filtrer…"
                    dir="rtl"
                    className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    type="text"
                    value={filters.dictionary}
                    onChange={(e) =>
                      onFilterChange({ ...filters, dictionary: e.target.value })
                    }
                    placeholder="Filtrer…"
                    className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    type="text"
                    value={filters.meaning}
                    onChange={(e) =>
                      onFilterChange({ ...filters, meaning: e.target.value })
                    }
                    placeholder="Filtrer…"
                    className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  />
                </th>
                <th className="px-2 py-1.5 text-center">
                  <select
                    value={filters.status}
                    onChange={(e) =>
                      onFilterChange({ ...filters, status: e.target.value })
                    }
                    className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-1.5 text-center">
                  <select
                    value={filters.manual}
                    onChange={(e) =>
                      onFilterChange({ ...filters, manual: e.target.value })
                    }
                    className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  >
                    {MANUAL_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-1.5 text-center">
                  <select
                    value={filters.exact}
                    onChange={(e) =>
                      onFilterChange({ ...filters, exact: e.target.value })
                    }
                    className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  >
                    {EXACT_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-1.5">
                  <select
                    value={filters.correction}
                    onChange={(e) =>
                      onFilterChange({ ...filters, correction: e.target.value })
                    }
                    className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                  >
                    {CORRECTION_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4C3A3]/20">
              {sortedResults.map(({ entry, originalIndex }) => {
                const exactMatchFlag = getExactMatchFlag(entry);
                const hasCorrection =
                  entry.ai_verification.nikkud_correct === false &&
                  Boolean(entry.ai_verification.corrected_nikkud_word);

                return (
                  <tr
                    key={originalIndex}
                    onClick={() => onSelectWord(originalIndex)}
                    className={`cursor-pointer hover:bg-[#FDFBF7] transition-colors ${
                      selectedWordIdx === originalIndex ? "bg-[#F6F1E6]" : ""
                    }`}
                  >
                    <td className="p-3 text-center text-[10px] font-bold opacity-25">{originalIndex + 1}</td>
                    <td className="p-3 text-right font-serif text-xl leading-loose" dir="rtl">
                      {hasCorrection
                        ? renderComparedWord(
                            entry.word_with_nikkud,
                            entry.ai_verification.corrected_nikkud_word || "",
                            "original"
                          )
                        : entry.word_with_nikkud}
                    </td>
                    <td className="p-3 text-[10px] leading-relaxed opacity-65">
                      <div className="line-clamp-3">{entry.dictionary?.meaning || "—"}</div>
                    </td>
                    <td className="p-3 text-[11px] truncate opacity-60">
                      {entry.french_meaning}
                    </td>
                    <td className="p-3 text-center">
                      {entry._status === "done" ? (
                        entry.ai_verification.nikkud_correct ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-700 mx-auto" />
                        )
                      ) : entry._status === "processing" ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#C4A35A]" />
                      ) : entry._status === "error" ? (
                        <span className="text-orange-500 font-bold">!</span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {getManualStatusOption(entry.manual_status) ? (
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                            getManualStatusOption(entry.manual_status)?.className
                          }`}
                          title={getManualStatusOption(entry.manual_status)?.label}
                        />
                      ) : (
                        <span
                          className={`inline-block rounded-full ${
                            entry.ai_verification.needs_ai_rerun
                              ? "w-4 h-4 bg-blue-500"
                              : "w-2 h-2 bg-[#D4C3A3]"
                          }`}
                          title={entry.ai_verification.needs_ai_rerun ? "Relance IA demandee" : ""}
                        />
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {exactMatchFlag === null ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
                      ) : exactMatchFlag ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-700 mx-auto" />
                      )}
                    </td>
                    <td
                      className="p-3 text-right font-serif text-lg font-bold text-green-800 leading-loose"
                      dir="rtl"
                    >
                      {entry._status === "done"
                        ? entry.ai_verification.nikkud_correct
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
                          : entry.ai_verification.corrected_nikkud_word
                          ? renderComparedWord(
                              entry.ai_verification.corrected_nikkud_word,
                              entry.word_with_nikkud,
                              "corrected"
                            )
                          : "—"
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default VerificationTable;
