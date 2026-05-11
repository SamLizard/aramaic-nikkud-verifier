import type { AIVerification, AIVerificationTrial, WordEntry } from "../types";
import { EMPTY_AI_VERIFICATION } from "../constants";
import type { ManualStatus } from "../constants";

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

// ─── Entry status helpers ────────────────────────────────────────────────────

export const getExactMatchFlag = (entry: WordEntry): boolean | null => {
  if (entry.ai_verification.nikkud_correct !== false) {
    return null;
  }

  if (!entry.ai_verification.corrected_nikkud_word) {
    return null;
  }

  return entry.word_with_nikkud === entry.ai_verification.corrected_nikkud_word;
};

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

export const getTrialTone = (trial: AIVerificationTrial): string => {
  if (trial.status === "success") {
    return "text-green-700 border-green-200 bg-green-50";
  }

  if (trial.status === "invalid_json") {
    return "text-amber-800 border-amber-200 bg-amber-50";
  }

  return "text-red-700 border-red-200 bg-red-50";
};
