import React from "react";
import type { DisplayOccurrence } from "../types";
import { splitVisualClusters } from "../utils";

/** Strip all Hebrew nikkud/cantillation marks from a string */
const stripNikkud = (text: string): string =>
  (text || "").replace(/[\u0591-\u05C7]/g, "").trim();

/** Highlight a plain-text word inside a string (nikkud-stripped comparison) */
const highlightWordInPlainText = (
  text: string,
  strippedTarget: string
): React.ReactNode => {
  if (!strippedTarget) return <span className="opacity-70">{text}</span>;

  // Split text by spaces and check each token
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => {
        const isMatch = stripNikkud(word) === strippedTarget;
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
  const tokens = occurrence.steinsaltzContextTokens;
  if (tokens && tokens.length > 0) {
    // Strip nikkud from the target word to match against plain Steinsaltz tokens
    const stripped = baseWord ? stripNikkud(baseWord) : "";
    return (
      <>
        {tokens.map((token, index) => {
          const isWordMatch =
            stripped && stripNikkud(token.t) === stripped;
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
  // Try to highlight the word in the plain text
  const text = occurrence.steinsaltzContext || "";
  if (baseWord && text) {
    const stripped = stripNikkud(baseWord);
    return highlightWordInPlainText(text, stripped);
  }
  return <span className="opacity-70">{text}</span>;
};
