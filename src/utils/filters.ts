import type { WordEntry } from "../types";
import type { Filters, TriState, ManualStatus } from "../constants";
import { MANUAL_STATUS_OPTIONS } from "../constants";
import { getExactMatchFlag } from "./status";
import { countCorrectionChanges } from "./hebrew";

// ─── Nikkud stripping for filter matching ────────────────────────────────────

const stripNikkud = (text: string): string =>
  (text || "").replace(/[\u0591-\u05C7]/g, "");

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
  const lowerNeedle = needle.toLowerCase();
  // Match with nikkud or without nikkud (so user can type plain consonants)
  return (
    haystack.toLowerCase().includes(lowerNeedle) ||
    stripNikkud(haystack).toLowerCase().includes(lowerNeedle)
  );
};

export const getManualStatusOption = (status?: ManualStatus | null) =>
  MANUAL_STATUS_OPTIONS.find((option) => option.value === status) || null;

// ─── Tri-state filter matching ───────────────────────────────────────────────

/**
 * Checks if a value passes a tri-state filter map.
 * - If no selections are active (all null), everything passes.
 * - If any "include" selections exist, value must match one of them.
 * - If any "exclude" selections exist, value must NOT match any of them.
 * - Include and exclude can coexist.
 */
const matchesTriStateFilter = (
  value: string,
  selections: Record<string, TriState>
): boolean => {
  const includes: string[] = [];
  const excludes: string[] = [];

  for (const [key, state] of Object.entries(selections)) {
    if (state === "include") includes.push(key);
    else if (state === "exclude") excludes.push(key);
  }

  if (includes.length === 0 && excludes.length === 0) return true;
  if (excludes.includes(value)) return false;
  if (includes.length > 0 && !includes.includes(value)) return false;
  return true;
};

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
  if (!matchesTriStateFilter(getCorrectionFilterValue(entry), filters.correction)) {
    return false;
  }
  if (!matchesTriStateFilter(getStatusFilterValue(entry), filters.status)) {
    return false;
  }
  if (!matchesTriStateFilter(getExactFilterValue(entry), filters.exact)) {
    return false;
  }

  // Manual filter: derive the value
  const manualValue = entry.ai_verification.needs_ai_rerun
    ? "rerun"
    : entry.manual_status || "unset";
  if (!matchesTriStateFilter(manualValue, filters.manual)) {
    return false;
  }

  return true;
};
