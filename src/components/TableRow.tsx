import React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { WordEntry } from "../types";
import { getExactMatchFlag, getManualStatusOption } from "../utils";
import { renderComparedWord } from "./renderers";

interface TableRowProps {
  entry: WordEntry;
  originalIndex: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}

const TableRow: React.FC<TableRowProps> = ({
  entry,
  originalIndex,
  isSelected,
  onSelect,
}) => {
  const exactMatchFlag = getExactMatchFlag(entry);
  const hasCorrection =
    entry.ai_verification.nikkud_correct === false &&
    Boolean(entry.ai_verification.corrected_nikkud_word);

  return (
    <tr
      onClick={() => onSelect(originalIndex)}
      className={`cursor-pointer hover:bg-[#FDFBF7] transition-colors ${
        isSelected ? "bg-[#F6F1E6]" : ""
      }`}
    >
      <td className="p-2 text-center text-[10px] font-bold opacity-25">
        {originalIndex + 1}
      </td>
      <td className="p-2 text-right font-serif text-lg leading-relaxed" dir="rtl">
        {hasCorrection
          ? renderComparedWord(
              entry.word_with_nikkud,
              entry.ai_verification.corrected_nikkud_word || "",
              "original"
            )
          : entry.word_with_nikkud}
      </td>
      <td className="p-2 text-[10px] leading-relaxed opacity-65">
        <div className="line-clamp-2">{entry.dictionary?.meaning || "—"}</div>
      </td>
      <td className="p-2 text-[11px] truncate opacity-60">
        {entry.french_meaning}
      </td>
      <td className="p-2 text-center">
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
      <td className="p-2 text-center">
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
      <td className="p-2 text-center">
        {exactMatchFlag === null ? (
          <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
        ) : exactMatchFlag ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
        ) : (
          <XCircle className="w-4 h-4 text-red-700 mx-auto" />
        )}
      </td>
      <td
        className="p-2 text-right font-serif text-base font-bold text-green-800 leading-relaxed"
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
};

export default TableRow;
