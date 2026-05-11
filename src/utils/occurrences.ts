import type { WordEntry, DisplayOccurrence } from "../types";

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
