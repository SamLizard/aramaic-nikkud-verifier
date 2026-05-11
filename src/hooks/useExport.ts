import { useCallback } from "react";
import type { WordEntry } from "../types";
import type { SortedRow } from "./useSortedResults";
import { rowsToCSV, getExactMatchFlag, getEffectiveModelUsed } from "../utils";

export const useExport = (sortedResults: SortedRow[]) => {
  const handleExportCSV = useCallback(() => {
    const visibleEntries = sortedResults.map((row) => row.entry);
    const csvRows = visibleEntries.map((entry) => {
      const modelUsed = getEffectiveModelUsed(entry.ai_verification);
      const exactMatch = getExactMatchFlag(entry);
      return {
        "Mot (Nikkud)": entry.word_with_nikkud,
        Dictionnaire: entry.dictionary?.meaning || "",
        "Sens (Attendu)": entry.french_meaning,
        "Correct?":
          entry.ai_verification.nikkud_correct === true
            ? "✓"
            : entry.ai_verification.nikkud_correct === false
              ? "✗"
              : "?",
        "Meme exact?":
          exactMatch === null ? "-" : exactMatch ? "true" : "false",
        Correction: entry.ai_verification.corrected_nikkud_word || "-",
        Modele: modelUsed || "",
        "Statut manuel": entry.manual_status || "",
        "Note manuelle": entry.manual_note || "",
        Notes: entry.ai_verification.notes || "",
      };
    });

    const csv = rowsToCSV(csvRows);
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nikkud_rapport.csv";
    a.click();
  }, [sortedResults]);

  const handleExportJSON = useCallback(() => {
    const visibleEntries = sortedResults.map((row) => row.entry);
    const dataStr = JSON.stringify(
      visibleEntries.map(({ _status, ...rest }: WordEntry) => rest),
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nikkud_enrichi.json";
    a.click();
  }, [sortedResults]);

  return { handleExportCSV, handleExportJSON };
};
