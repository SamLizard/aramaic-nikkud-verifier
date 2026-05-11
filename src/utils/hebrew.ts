import { HEBREW_MARK_REGEX } from "../constants";
import type { WordEntry } from "../types";

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
