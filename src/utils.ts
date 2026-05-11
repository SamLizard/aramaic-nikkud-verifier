import type { AIVerification, AIVerificationTrial, WordEntry, DisplayOccurrence } from "./types";
import {
  EMPTY_AI_VERIFICATION,
  HEBREW_MARK_REGEX,
  MANUAL_STATUS_OPTIONS,
  KEY_GROUP_SIZE,
} from "./constants";
import type { Filters, ManualStatus } from "./constants";

// ─── General helpers ─────────────────────────────────────────────────────────

export const rowsToCSV = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) return "";
  const allKeys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const text = String(v ?? "");
    return text.includes(",") || text.includes("\n")
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  return [
    allKeys.join(","),
    ...rows.map((row) => allKeys.map((key) => escape(row[key])).join(",")),
  ].join("\n");
};

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─── AI verification normalization ──────────────────────────────────────────

export const normalizeTrials = (
  trials?: AIVerificationTrial[]
): AIVerificationTrial[] => (Array.isArray(trials) ? trials : []);

export const normalizeAiVerification = (
  verification?: Partial<AIVerification> | null
): AIVerification => ({
  ...EMPTY_AI_VERIFICATION,
  ...verification,
  pages_same_meaning: Array.isArray(verification?.pages_same_meaning)
    ? verification?.pages_same_meaning
    : [],
  ai_trials: normalizeTrials(verification?.ai_trials),
});

export const coerceBoolean = (value: unknown): boolean =>
  value === true || value === "true" || value === 1 || value === "1";

export const getImportedNeedsAiRerun = (entry: WordEntry): boolean =>
  coerceBoolean(entry.ai_verification?.needs_ai_rerun) ||
  coerceBoolean(
    (entry as WordEntry & { needs_ai_rerun?: unknown }).needs_ai_rerun
  );

export const getImportedStatus = (entry: WordEntry): WordEntry["_status"] => {
  const verification = normalizeAiVerification(entry.ai_verification);
  const hasVerdict = verification.nikkud_correct !== null;
  const hasCorrection = Boolean(verification.corrected_nikkud_word);
  const hasNotes = Boolean(verification.notes?.trim());
  const hasPages = verification.pages_same_meaning.length > 0;

  return hasVerdict || hasCorrection || hasNotes || hasPages ? "done" : "pending";
};

export const isEntryAlreadyAnalyzed = (entry: WordEntry): boolean =>
  getImportedStatus(entry) === "done" &&
  !normalizeAiVerification(entry.ai_verification).needs_ai_rerun;

// ─── API key helpers ─────────────────────────────────────────────────────────

export const normalizeKeyInputs = (inputs: string[]): string[] => {
  const next = [...inputs];

  while (
    next.length > 1 &&
    next[next.length - 1] === "" &&
    next[next.length - 2] === ""
  ) {
    next.pop();
  }

  if (next.every((value) => value === "")) {
    return [""];
  }

  if (next[next.length - 1] !== "") {
    next.push("");
  }

  return next;
};

export const getUsableApiKeys = (inputs: string[]): string[] =>
  inputs.map((key) => key.trim()).filter(Boolean);

export const groupKeysByWord = (keys: string[]): string[][] => {
  const groups: string[][] = [];

  for (let i = 0; i < keys.length; i += KEY_GROUP_SIZE) {
    groups.push(keys.slice(i, i + KEY_GROUP_SIZE));
  }

  return groups;
};

// ─── Entry status & filter helpers ───────────────────────────────────────────

export const getExactMatchFlag = (entry: WordEntry): boolean | null => {
  if (entry.ai_verification.nikkud_correct !== false) {
    return null;
  }

  if (!entry.ai_verification.corrected_nikkud_word) {
    return null;
  }

  return entry.word_with_nikkud === entry.ai_verification.corrected_nikkud_word;
};

export const getManualStatusOption = (status?: ManualStatus | null) =>
  MANUAL_STATUS_OPTIONS.find((option) => option.value === status) || null;

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

// ─── Hebrew text processing ──────────────────────────────────────────────────

export const splitVisualClusters = (text: string): string[] => {
  const clusters: string[] = [];
  let current = "";

  for (const char of Array.from((text || "").normalize("NFC"))) {
    if (!current) {
      current = char;
      continue;
    }

    if (HEBREW_MARK_REGEX.test(char)) {
      current += char;
      continue;
    }

    clusters.push(current);
    current = char;
  }

  if (current) {
    clusters.push(current);
  }

  return clusters;
};

/**
 * Count how many visual clusters differ between the original word and the
 * corrected word. A "visual cluster" is a base letter + its attached nikkud/
 * cantillation marks — this matches what the user sees on screen.
 *
 * Returns `null` when there is no correction to compare to.
 */
export const countCorrectionChanges = (entry: WordEntry): number | null => {
  const corrected = entry.ai_verification.corrected_nikkud_word;
  if (!corrected) return null;
  const original = entry.word_with_nikkud || "";
  const left = splitVisualClusters(original);
  const right = splitVisualClusters(corrected);
  const maxLen = Math.max(left.length, right.length);
  let diff = 0;
  for (let i = 0; i < maxLen; i += 1) {
    if ((left[i] || "") !== (right[i] || "")) diff += 1;
  }
  return diff;
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

// ─── Display helpers ─────────────────────────────────────────────────────────

export const getEffectiveModelUsed = (
  verification: AIVerification
): string | null => {
  if (verification.model_used) {
    return verification.model_used;
  }

  const successTrial = [...normalizeTrials(verification.ai_trials)]
    .reverse()
    .find((trial) => trial.status === "success");

  return successTrial?.model || verification.failed_raw_ai_model || null;
};

export const normalizeDisplayedHebrew = (text: string): string =>
  (text || "").normalize("NFC").trim();

export const extractDictionaryNikkudWord = (
  entry: WordEntry
): string | null => {
  const meaning = entry.dictionary?.meaning || "";
  if (!meaning) {
    return null;
  }

  const head = meaning.split(" - ")[0].trim();
  if (!head) {
    return null;
  }

  const match = head.match(/^[\u0590-\u05FF"'׳״־…\s]+$/);
  if (!match) {
    return null;
  }

  if (!HEBREW_MARK_REGEX.test(head)) {
    return null;
  }

  return normalizeDisplayedHebrew(head);
};

export const hasSameDisplayedNikkud = (left: string, right: string): boolean =>
  normalizeDisplayedHebrew(left) === normalizeDisplayedHebrew(right);

// ─── Sort helpers ────────────────────────────────────────────────────────────

export const getStatusSortRank = (entry: WordEntry): number => {
  if (entry._status === "error") {
    return 0;
  }

  if (
    entry._status === "done" &&
    entry.ai_verification.nikkud_correct === false
  ) {
    return 1;
  }

  if (entry._status === "processing") {
    return 2;
  }

  if (entry._status === "pending") {
    return 3;
  }

  if (
    entry._status === "done" &&
    entry.ai_verification.nikkud_correct === true
  ) {
    return 4;
  }

  return 5;
};

export const getManualStatusSortRank = (
  status?: ManualStatus | null
): number => {
  switch (status) {
    case "good":
      return 0;
    case "to_fix":
      return 1;
    case "need_more_sources":
      return 2;
    case "to_ask":
      return 3;
    default:
      return 4;
  }
};

export const getTrialTone = (trial: AIVerificationTrial): string => {
  if (trial.status === "success") {
    return "text-green-700 border-green-200 bg-green-50";
  }

  if (trial.status === "invalid_json") {
    return "text-amber-800 border-amber-200 bg-amber-50";
  }

  return "text-red-700 border-red-200 bg-red-50";
};


// ─── Occurrence helpers ──────────────────────────────────────────────────────

export const flattenOccurrences = (entry: WordEntry): DisplayOccurrence[] =>
  entry.gemara_pages.flatMap((page) =>
    page.occurrences.map((occurrence, occurrenceIndex) => {
      const gemara = occurrence.gemara;
      const gemaraWord = gemara.word || "";
      const fullContext = gemara.full_context || "";
      const fullContextTokens =
        gemara.full_context_tokens && gemara.full_context_tokens.length > 0
          ? gemara.full_context_tokens
          : fullContext
          ? fullContext.split(/\s+/).filter(Boolean)
          : [];
      const gemaraWords =
        gemara.words && gemara.words.length > 0
          ? gemara.words
          : gemaraWord
              .split(/\s*(?:\u2026|\.\.\.|\s)\s*/)
              .filter(Boolean);

      return {
        pageLabel: page.label,
        urlNikud: page.url_nikud,
        urlExplain: page.url_explain,
        occurrenceIndex,
        gemaraWord,
        gemaraWords,
        fullContext,
        fullContextTokens,
        matchedPositions:
          gemara.matched_positions && gemara.matched_positions.length > 0
            ? gemara.matched_positions
            : [],
        before: gemara.before,
        after: gemara.after,
        steinsaltzContext: occurrence.steinsaltz?.full_context || "",
        steinsaltzContextTokens:
          occurrence.steinsaltz?.full_context_tokens || [],
      };
    })
  );
