import React from "react";
import type { WordEntry } from "../types";

/** Strip all Hebrew nikkud/cantillation marks */
const stripNikkud = (text: string): string =>
  (text || "").replace(/[\u0591-\u05C7]/g, "");

/**
 * Highlights occurrences of the word (with or without nikkud) in the given text.
 * Matches: word_with_nikkud, base_consonants, corrected_nikkud_word,
 * and their nikkud-stripped forms.
 */
export const highlightWordInText = (
  text: string,
  word: WordEntry
): React.ReactNode => {
  // Collect all forms of the word to highlight
  const targets: string[] = [];
  if (word.word_with_nikkud) targets.push(word.word_with_nikkud);
  if (word.base_consonants) targets.push(word.base_consonants);
  if (word.ai_verification.corrected_nikkud_word) {
    targets.push(word.ai_verification.corrected_nikkud_word);
  }
  // Also add stripped versions
  targets.push(...targets.map(stripNikkud));

  // Deduplicate, remove empty, sort by length (longest first for greedy matching)
  const unique = [...new Set(targets)].filter(Boolean).sort((a, b) => b.length - a.length);

  if (unique.length === 0) return text;

  // Build a regex that matches any of the target words
  const escaped = unique.map((t) => escapeRegex(t));
  const regex = new RegExp(`(${escaped.join("|")})`, "g");

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = unique.some((t) => t === part);
        if (isMatch) {
          return (
            <span
              key={i}
              className="font-bold text-[#8B5E3C] bg-amber-50 px-0.5 rounded border-b border-[#C4A35A]"
            >
              {part}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
