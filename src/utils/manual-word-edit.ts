import type { ManualWordEdit, WordEntry } from "../types";
import { HEBREW_MARK_REGEX } from "../constants";
import { normalizeDisplayedHebrew } from "./hebrew";

/**
 * Manual word edits.
 *
 * `word_with_nikkud` always holds the *current* form so prompts, diffs, exports
 * and filters keep working unchanged. The pre-edit form is archived in
 * `manual_word_edit` so it is never lost and the edit stays revertible.
 */

const stripMarks = (text: string): string =>
  (text || "").replace(new RegExp(HEBREW_MARK_REGEX.source, "g"), "");

export const hasManualWordEdit = (entry: WordEntry): boolean =>
  Boolean(entry.manual_word_edit);

/** The form the entry had before any manual edit. */
export const getOriginalWord = (entry: WordEntry): string =>
  entry.manual_word_edit?.original_word_with_nikkud || entry.word_with_nikkud;

/**
 * Normalizes an imported `manual_word_edit` value, dropping anything malformed
 * or that no longer represents a real change.
 */
export const normalizeManualWordEdit = (
  entry: WordEntry
): ManualWordEdit | null => {
  const edit = entry.manual_word_edit;
  if (!edit || typeof edit !== "object") return null;

  const original = normalizeDisplayedHebrew(edit.original_word_with_nikkud);
  if (!original) return null;
  if (original === normalizeDisplayedHebrew(entry.word_with_nikkud)) return null;

  return {
    original_word_with_nikkud: original,
    original_base_consonants:
      edit.original_base_consonants || stripMarks(original),
    edited_at: edit.edited_at || new Date().toISOString(),
    ai_verdict_outdated: edit.ai_verdict_outdated !== false,
  };
};

/**
 * Applies a manual correction of the word.
 *
 * - No-op when the new value is empty or identical to the current one.
 * - The very first edit archives the pre-edit form; later edits keep that same
 *   original (so it always reflects the imported source file).
 * - Reverting back to the original form clears the edit entirely.
 */
export const applyManualWordEdit = (
  entry: WordEntry,
  nextWord: string
): WordEntry => {
  const next = normalizeDisplayedHebrew(nextWord);
  if (!next) return entry;
  if (next === normalizeDisplayedHebrew(entry.word_with_nikkud)) return entry;

  const existing = entry.manual_word_edit;
  const original = existing?.original_word_with_nikkud || entry.word_with_nikkud;
  const originalConsonants =
    existing?.original_base_consonants || entry.base_consonants;

  // Back to square one — drop the edit instead of recording a no-change diff.
  if (next === normalizeDisplayedHebrew(original)) {
    return revertManualWordEdit(entry);
  }

  return {
    ...entry,
    word_with_nikkud: next,
    base_consonants: stripMarks(next),
    manual_word_edit: {
      original_word_with_nikkud: original,
      original_base_consonants: originalConsonants,
      edited_at: new Date().toISOString(),
      ai_verdict_outdated: true,
    },
  };
};

/**
 * True when the stored AI verdict was produced before a manual word edit, so
 * it describes the archived original rather than the current form.
 */
export const isAiVerdictOutdated = (entry: WordEntry): boolean =>
  Boolean(entry.manual_word_edit?.ai_verdict_outdated);

/**
 * The word the stored AI verdict actually describes.
 *
 * The AI is not rerun automatically after a manual edit, so while the verdict
 * is outdated it still refers to the pre-edit form. Once the entry is rerun (or
 * the verdict is acknowledged as still valid) it describes the current form.
 */
export const getAiVerdictWord = (entry: WordEntry): string =>
  isAiVerdictOutdated(entry)
    ? entry.manual_word_edit!.original_word_with_nikkud
    : entry.word_with_nikkud;

/** Sort rank: verdict-to-review first, then reviewed edits, then untouched. */
export const getManualWordEditSortRank = (entry: WordEntry): number => {
  const edit = entry.manual_word_edit;
  if (!edit) return 2;
  return edit.ai_verdict_outdated ? 0 : 1;
};

/** Restores the pre-edit form and clears the edit trace. */
export const revertManualWordEdit = (entry: WordEntry): WordEntry => {
  const edit = entry.manual_word_edit;
  if (!edit) return entry;

  return {
    ...entry,
    word_with_nikkud: edit.original_word_with_nikkud,
    base_consonants: edit.original_base_consonants,
    manual_word_edit: null,
  };
};

/**
 * Marks the AI verdict as reviewed against the edited form, without touching
 * the archived original.
 */
export const acknowledgeManualWordEdit = (entry: WordEntry): WordEntry => {
  const edit = entry.manual_word_edit;
  if (!edit) return entry;

  return {
    ...entry,
    manual_word_edit: { ...edit, ai_verdict_outdated: false },
  };
};
