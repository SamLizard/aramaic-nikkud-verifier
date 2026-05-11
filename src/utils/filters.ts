import type { WordEntry } from "../types";
import type { Filters, ManualStatus } from "../constants";
import { MANUAL_STATUS_OPTIONS } from "../constants";
import { getExactMatchFlag } from "./status";
import { countCorrectionChanges } from "./hebrew";

// ─── Filter value extractors ─────────────────────────────────────────────────

export const getStatusFilterValue = (entry: WordEntry): string => {
  if (entry._status === "error") return "error";
  if (entry._status === "processing") return "processing";
  if (entry._status === "pending") return "pending";
  if (entry._status === "done") {
    if (entry.ai_verification.nikkud_correct === true) return "correct";
    if (entry.ai_verification.nikkud_correct === false) return "incorrect";
  }
  return "";
};

export const getExactFilterValue = (entry: WordEntry): string => {
  const flag = getExactMatchFlag(entry);
  if (flag === null) return "none";
  return flag ? "true" : "false";
};

export const getCorrectionFilterValue = (entry: WordEntry): string => {
  const changes = countCorrectionChanges(entry);
  if (changes === null) return "none";
  if (changes >= 5) return "5+";
  return String(changes);
};

export const matchesTextFilter = (haystack: string, needle: string): boolean => {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
};

export const getManualStatusOption = (status?: ManualStatus | null) =>
  MANUAL_STATUS_OPTIONS.find((option) => option.value === status) || null;

// ─── Main filter function ────────────────────────────────────────────────────

export const entryMatchesFilters = (
  entry: WordEntry,
  filters: Filters
): boolean => {
  if (!matchesTextFilter(entry.word_with_nikkud || "", filters.word)) {
    return false;
  }
  if (!matchesTextFilter(entry.dictionary?.meaning || "", filters.dictionary)) {
    return false;
  }
  if (!matchesTextFilter(entry.french_meaning || "", filters.meaning)) {
    return false;
  }
  if (
    filters.correction &&
    getCorrectionFilterValue(entry) !== filters.correction
  ) {
    return false;
  }
  if (filters.status && getStatusFilterValue(entry) !== filters.status) {
    return false;
  }
  if (filters.exact && getExactFilterValue(entry) !== filters.exact) {
    return false;
  }
  if (filters.manual) {
    if (filters.manual === "unset") {
      if (entry.manual_status) return false;
    } else if (filters.manual === "rerun") {
      if (!entry.ai_verification.needs_ai_rerun) return false;
    } else if (entry.manual_status !== filters.manual) {
      return false;
    }
  }
  return true;
};
