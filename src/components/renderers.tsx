import React from "react";
import type { DisplayOccurrence } from "../types";
import { splitVisualClusters } from "../utils";

/** Strip all Hebrew nikkud/cantillation marks from a string */
const stripNikkud = (text: string): string =>
  (text || "").replace(/[\u0591-\u05C7]/g, "").trim();

/**
 * Build a Set of stripped word forms to match against.
 * Handles multi-word base words (split by space) and gemaraWords arrays.
 */
const buildMatchSet = (baseWord?: string, gemaraWords?: string[]): Set<string> => {
  const set = new Set<string>();
  if (baseWord) {
    // The base word itself (stripped)
    const stripped = stripNikkud(baseWord);
    if (stripped) set.add(stripped);
    // If it contains spaces, also add each individual word
    if (stripped.includes(" ")) {
      for (const part of stripped.split(/\s+/)) {
        if (part) set.add(part);
      }
    }
  }
  if (gemaraWords) {
    for (const w of gemaraWords) {
      const s = stripNikkud(w);
      if (s) set.add(s);
    }
  }
  return set;
};

/** Highlight words in plain text that match any of the target forms */
const highlightWordInPlainText = (
  text: string,
  matchSet: Set<string>
): React.ReactNode => {
  if (matchSet.size === 0) return <span className="opacity-70">{text}</span>;

  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => {
        const isMatch = matchSet.has(stripNikkud(word));
        return (
          <React.Fragment key={i}>
            {isMatch ? (
              <span className="font-black text-[#8B5E3C] bg-amber-50 px-0.5 rounded border-b border-[#C4A35A]">
                {word}
              </span>
            ) : (
              <span className="opacity-70">{word}</span>
            )}
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </>
  );
};

/**
 * Renders a Hebrew word with per-cluster diff highlighting against another word.
 */
export const renderComparedWord = (
  text: string,
  otherText: string,
  tone: "original" | "corrected"
) => {
  const sourceTokens = splitVisualClusters(text);
  const otherTokens = splitVisualClusters(otherText);
  const maxLen = Math.max(sourceTokens.length, otherTokens.length);

  return (
    <>
      {Array.from({ length: maxLen }, (_, index) => {
        const token = sourceTokens[index] || "";
        const otherToken = otherTokens[index] || "";
        const isDifferent = token !== otherToken;
        const className = isDifferent
          ? tone === "original"
            ? "bg-red-100 text-red-900 rounded px-0.5"
            : "bg-amber-100 text-[#8B5E3C] rounded px-0.5"
          : "";

        return (
          <span key={`${tone}-${index}`} className={className}>
            {token || "\u200b"}
          </span>
        );
      })}
    </>
  );
};

/**
 * Renders the Gemara occurrence context with matched-word highlighting.
 */
export const renderOccurrenceContext = (occurrence: DisplayOccurrence) => {
  // Preferred path: we have the tokenised context + per-word matched positions
  if (
    occurrence.fullContextTokens.length > 0 &&
    occurrence.matchedPositions.length > 0
  ) {
    const matched = new Set(occurrence.matchedPositions);
    return (
      <>
        {occurrence.fullContextTokens.map((token, index) => {
          const isMatched = matched.has(index);
          return (
            <React.Fragment key={`tok-${index}`}>
              {isMatched ? (
                <span className="text-[#8B5E3C] font-black px-1.5 bg-amber-50 rounded border border-amber-200">
                  {token}
                </span>
              ) : (
                <span className="opacity-40">{token}</span>
              )}
              {index < occurrence.fullContextTokens.length - 1 ? " " : null}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  // Legacy fallback — older JSON files don't have tokenised context.
  const fullContext = occurrence.fullContext || "";
  const target = occurrence.gemaraWord || "";
  const targetIndex = target ? fullContext.indexOf(target) : -1;

  if (fullContext && targetIndex >= 0) {
    const before = fullContext.slice(0, targetIndex);
    const after = fullContext.slice(targetIndex + target.length);

    return (
      <>
        {before ? <span className="opacity-40">{before}</span> : null}
        <span className="text-[#8B5E3C] font-black px-1.5 bg-amber-50 rounded border border-amber-200">
          {target}
        </span>
        {after ? <span className="opacity-40">{after}</span> : null}
      </>
    );
  }

  return (
    <>
      {occurrence.before.slice(-5).length > 0 ? (
        <span className="opacity-40">
          {occurrence.before.slice(-5).join(" ")}{" "}
        </span>
      ) : null}
      <span className="text-[#8B5E3C] font-black px-1.5 bg-amber-50 rounded border border-amber-200">
        {occurrence.gemaraWord}
      </span>
      {occurrence.after.slice(0, 5).length > 0 ? (
        <span className="opacity-40">
          {" "}{occurrence.after.slice(0, 5).join(" ")}
        </span>
      ) : null}
    </>
  );
};

/**
 * Renders the Steinsaltz context with bold highlighting AND highlights the
 * target word (without nikkud) so the user can spot it in the explanation.
 */
export const renderSteinsaltzContext = (
  occurrence: DisplayOccurrence,
  baseWord?: string
) => {
  const matchSet = buildMatchSet(baseWord, occurrence.gemaraWords);
  const tokens = occurrence.steinsaltzContextTokens;
  if (tokens && tokens.length > 0) {
    return (
      <>
        {tokens.map((token, index) => {
          const isWordMatch =
            matchSet.size > 0 && matchSet.has(stripNikkud(token.t));
          return (
            <React.Fragment key={`stein-${index}`}>
              {isWordMatch ? (
                <span className="font-black text-[#8B5E3C] bg-amber-50 px-0.5 rounded border-b border-[#C4A35A]">
                  {token.t}
                </span>
              ) : token.b ? (
                <span className="font-black text-[#2D1B0E]">{token.t}</span>
              ) : (
                <span className="opacity-70">{token.t}</span>
              )}
              {index < tokens.length - 1 ? " " : null}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  // Legacy fallback — plain text from older JSON files.
  const text = occurrence.steinsaltzContext || "";
  if (matchSet.size > 0 && text) {
    return highlightWordInPlainText(text, matchSet);
  }
  return <span className="opacity-70">{text}</span>;
};
