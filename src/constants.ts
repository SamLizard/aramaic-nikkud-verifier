import type { AIVerification, WordEntry } from "./types";

// ─── Processing delays ───────────────────────────────────────────────────────

export const DELAY_BETWEEN_WORDS_MS = 600;
export const RATE_LIMIT_BUFFER_MS = 1200;
export const MAX_RATE_LIMIT_RETRIES_PER_WORD = 8;
export const KEY_GROUP_SIZE = 2;

// ─── Regex ───────────────────────────────────────────────────────────────────

export const HEBREW_MARK_REGEX = /[\u0591-\u05C7]/;

// ─── Sort & Filter types ─────────────────────────────────────────────────────

export type SortKey =
  | "index"
  | "word"
  | "dictionary"
  | "meaning"
  | "status"
  | "manual"
  | "exact"
  | "correction";

export type SortDirection = "asc" | "desc";

export type FilterKey =
  | "word"
  | "dictionary"
  | "meaning"
  | "status"
  | "manual"
  | "exact"
  | "correction";

export type Filters = Record<FilterKey, string>;

export type ManualStatus = WordEntry["manual_status"];

// ─── Filter option lists ─────────────────────────────────────────────────────

export const EMPTY_FILTERS: Filters = {
  word: "",
  dictionary: "",
  meaning: "",
  status: "",
  manual: "",
  exact: "",
  correction: "",
};

export const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tous" },
  { value: "correct", label: "Correct" },
  { value: "incorrect", label: "À corriger" },
  { value: "processing", label: "En cours" },
  { value: "pending", label: "En attente" },
  { value: "error", label: "Erreur" },
];

export const EXACT_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tous" },
  { value: "true", label: "Oui" },
  { value: "false", label: "Non" },
  { value: "none", label: "—" },
];

export const MANUAL_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tous" },
  { value: "good", label: "Good" },
  { value: "to_fix", label: "To fix" },
  { value: "need_more_sources", label: "Need more sources" },
  { value: "to_ask", label: "To ask" },
  { value: "unset", label: "Non marqué" },
  { value: "rerun", label: "Relance IA" },
];

export const CORRECTION_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tous" },
  { value: "none", label: "Pas de correction" },
  { value: "0", label: "0 changement" },
  { value: "1", label: "1 changement" },
  { value: "2", label: "2 changements" },
  { value: "3", label: "3 changements" },
  { value: "4", label: "4 changements" },
  { value: "5+", label: "5+ changements" },
];

// ─── Default objects ─────────────────────────────────────────────────────────

export const EMPTY_AI_VERIFICATION: AIVerification = {
  nikkud_correct: null,
  corrected_nikkud_word: null,
  notes: "",
  pages_same_meaning: [],
  needs_ai_rerun: false,
  model_used: null,
  failed_raw_ai_response: "",
  failed_raw_ai_model: null,
  failed_raw_ai_error: "",
  last_error: "",
  ai_trials: [],
};

export const MANUAL_STATUS_OPTIONS: Array<{
  value: NonNullable<ManualStatus>;
  label: string;
  className: string;
}> = [
  {
    value: "good",
    label: "Good",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  {
    value: "to_fix",
    label: "To fix",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  {
    value: "need_more_sources",
    label: "Need more sources",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    value: "to_ask",
    label: "To ask",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
];
