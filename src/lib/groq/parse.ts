import type { AIVerification, AIVerificationTrial, WordEntry } from "../../types";
import { GroqInvalidJsonError } from "./errors";
import type { InvalidJsonFailure } from "./errors";

const HEBREW_DIACRITICS_REGEX = /[\u0591-\u05BD\u05BF-\u05C7]/g;

export interface VerificationResult extends AIVerification {
  nikkud_correct: boolean | null;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
}

export const normalizeSurfaceWithoutNikkud = (text: string): string =>
  text.normalize("NFC").replace(HEBREW_DIACRITICS_REGEX, "");

export const hasSameSurfaceWithoutNikkud = (
  originalWord: string,
  correctedWord: string
): boolean =>
  normalizeSurfaceWithoutNikkud(originalWord) ===
  normalizeSurfaceWithoutNikkud(correctedWord);

export const buildNotes = (notes: string, extraNote?: string): string => {
  if (!extraNote) {
    return notes || "";
  }

  if (!notes) {
    return extraNote;
  }

  return `${notes} ${extraNote}`;
};

export const parseVerificationResponse = (
  entry: WordEntry,
  rawContent: string,
  model: string,
  priorInvalidJsonFailure?: InvalidJsonFailure,
  aiTrials: AIVerificationTrial[] = []
): VerificationResult => {
  const clean = rawContent.replace(/```json|```/g, "").trim();
  let parsed: Partial<VerificationResult>;

  try {
    parsed = JSON.parse(clean) as Partial<VerificationResult>;
  } catch {
    throw new GroqInvalidJsonError(
      `Le modèle ${model} n'a pas renvoyé un JSON valide.`,
      model,
      rawContent
    );
  }

  const rawCorrectedWord =
    parsed.corrected_nikkud_word && parsed.corrected_nikkud_word !== "-"
      ? parsed.corrected_nikkud_word.trim()
      : null;
  const correctedWord =
    rawCorrectedWord &&
    hasSameSurfaceWithoutNikkud(entry.word_with_nikkud, rawCorrectedWord)
      ? rawCorrectedWord
      : null;
  const correctionRejected =
    rawCorrectedWord !== null && correctedWord === null
      ? "Correction IA rejetee car elle modifie le texte arameen au lieu du seul nikkud."
      : "";

  return {
    nikkud_correct: parsed.nikkud_correct ?? null,
    corrected_nikkud_word: correctedWord,
    notes: buildNotes(parsed.notes || "", correctionRejected),
    pages_same_meaning: Array.isArray(parsed.pages_same_meaning)
      ? parsed.pages_same_meaning
      : [],
    model_used: model,
    failed_raw_ai_response: priorInvalidJsonFailure?.rawResponse || "",
    failed_raw_ai_model: priorInvalidJsonFailure?.model || null,
    failed_raw_ai_error: priorInvalidJsonFailure?.message || "",
    last_error: "",
    ai_trials: aiTrials,
  };
};
