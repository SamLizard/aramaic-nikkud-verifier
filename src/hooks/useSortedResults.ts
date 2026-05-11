import { useState, useMemo, useCallback } from "react";
import type { WordEntry } from "../types";
import type { SortKey, SortDirection, Filters } from "../constants";
import { EMPTY_FILTERS } from "../constants";
import {
  getStatusSortRank,
  getManualStatusSortRank,
  getExactMatchFlag,
  entryMatchesFilters,
} from "../utils";

export interface SortedRow {
  entry: WordEntry;
  originalIndex: number;
}

export const useSortedResults = (results: WordEntry[]) => {
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const handleSort = useCallback(
    (nextKey: SortKey) => {
      if (sortKey === nextKey) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(nextKey);
      setSortDirection("asc");
    },
    [sortKey]
  );

  const sortedResults: SortedRow[] = useMemo(() => {
    const rows = results
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => entryMatchesFilters(entry, filters));

    rows.sort((left, right) => {
      let leftValue: string | number | boolean | null = left.originalIndex;
      let rightValue: string | number | boolean | null = right.originalIndex;

      switch (sortKey) {
        case "word":
          leftValue = left.entry.word_with_nikkud;
          rightValue = right.entry.word_with_nikkud;
          break;
        case "dictionary":
          leftValue = left.entry.dictionary?.meaning || "";
          rightValue = right.entry.dictionary?.meaning || "";
          break;
        case "meaning":
          leftValue = left.entry.french_meaning;
          rightValue = right.entry.french_meaning;
          break;
        case "status":
          leftValue = getStatusSortRank(left.entry);
          rightValue = getStatusSortRank(right.entry);
          break;
        case "manual":
          leftValue = getManualStatusSortRank(left.entry.manual_status);
          rightValue = getManualStatusSortRank(right.entry.manual_status);
          break;
        case "exact":
          leftValue = getExactMatchFlag(left.entry);
          rightValue = getExactMatchFlag(right.entry);
          break;
        case "correction":
          leftValue = left.entry.ai_verification.corrected_nikkud_word || "";
          rightValue = right.entry.ai_verification.corrected_nikkud_word || "";
          break;
        default:
          break;
      }

      if (leftValue === null) return 1;
      if (rightValue === null) return -1;

      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "fr");

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [results, sortDirection, sortKey, filters]);

  return {
    sortedResults,
    filters,
    setFilters,
    handleSort,
  };
};
