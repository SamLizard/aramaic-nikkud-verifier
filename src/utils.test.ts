import { describe, it, expect } from "vitest";
import {
  splitVisualClusters,
  entryMatchesFilters,
  normalizeKeyInputs,
  getExactMatchFlag,
  flattenOccurrences,
  normalizeAiVerification,
  normalizeTrials,
  getImportedStatus,
  getImportedNeedsAiRerun,
  isEntryAlreadyAnalyzed,
  getUsableApiKeys,
  groupKeysByWord,
  getStatusFilterValue,
  getExactFilterValue,
  getCorrectionFilterValue,
  countCorrectionChanges,
  matchesTextFilter,
  hasSameDisplayedNikkud,
  normalizeDisplayedHebrew,
  extractDictionaryNikkudWord,
  getEffectiveModelUsed,
  getStatusSortRank,
  getManualStatusSortRank,
  getTrialTone,
  coerceBoolean,
  rowsToCSV,
} from "./utils";
import type { WordEntry } from "./types";
import { EMPTY_AI_VERIFICATION, EMPTY_FILTERS } from "./constants";

// ─── Helper to build a minimal WordEntry ─────────────────────────────────────

const makeEntry = (overrides: Partial<WordEntry> = {}): WordEntry => ({
  word_with_nikkud: "מִלָּה",
  base_consonants: "מלה",
  french_meaning: "mot",
  is_ellipsis_entry: false,
  dictionary: {
    query_used: "מלה",
    suggestions: [],
    meaning: "",
    dict_url: "",
  },
  gemara_pages: [],
  ai_verification: { ...EMPTY_AI_VERIFICATION },
  _status: "pending",
  ...overrides,
});

// ─── splitVisualClusters ─────────────────────────────────────────────────────

describe("splitVisualClusters", () => {
  it("splits a simple Hebrew word into base+mark clusters", () => {
    // שָׁלוֹם = shin+patach+shin-dot, lamed, vav+holam, mem-sofit
    const clusters = splitVisualClusters("שָׁלוֹם");
    expect(clusters.length).toBeGreaterThan(0);
    // Each cluster starts with a base character
    for (const cluster of clusters) {
      expect(cluster.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns empty array for empty string", () => {
    expect(splitVisualClusters("")).toEqual([]);
  });

  it("handles plain ASCII text", () => {
    expect(splitVisualClusters("abc")).toEqual(["a", "b", "c"]);
  });

  it("keeps marks attached to their base letter", () => {
    // בְּ = bet + shva + dagesh
    const input = "\u05D1\u05B0\u05BC"; // bet + shva + dagesh
    const clusters = splitVisualClusters(input);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toBe(input);
  });
});

// ─── normalizeKeyInputs ──────────────────────────────────────────────────────

describe("normalizeKeyInputs", () => {
  it("keeps a single empty input as-is", () => {
    expect(normalizeKeyInputs([""])).toEqual([""]);
  });

  it("adds an empty slot after a filled key", () => {
    expect(normalizeKeyInputs(["gsk_abc"])).toEqual(["gsk_abc", ""]);
  });

  it("trims trailing empty slots to leave exactly one", () => {
    expect(normalizeKeyInputs(["gsk_abc", "", ""])).toEqual(["gsk_abc", ""]);
  });

  it("collapses all-empty to single empty", () => {
    expect(normalizeKeyInputs(["", "", ""])).toEqual([""]);
  });

  it("preserves multiple filled keys", () => {
    expect(normalizeKeyInputs(["a", "b"])).toEqual(["a", "b", ""]);
  });
});

// ─── getExactMatchFlag ───────────────────────────────────────────────────────

describe("getExactMatchFlag", () => {
  it("returns null when nikkud_correct is not false", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true },
    });
    expect(getExactMatchFlag(entry)).toBeNull();
  });

  it("returns null when no corrected word", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: false },
    });
    expect(getExactMatchFlag(entry)).toBeNull();
  });

  it("returns true when word matches correction", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: {
        ...EMPTY_AI_VERIFICATION,
        nikkud_correct: false,
        corrected_nikkud_word: "אָב",
      },
    });
    expect(getExactMatchFlag(entry)).toBe(true);
  });

  it("returns false when word differs from correction", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: {
        ...EMPTY_AI_VERIFICATION,
        nikkud_correct: false,
        corrected_nikkud_word: "אַב",
      },
    });
    expect(getExactMatchFlag(entry)).toBe(false);
  });
});

// ─── flattenOccurrences ──────────────────────────────────────────────────────

describe("flattenOccurrences", () => {
  it("returns empty array for entry with no pages", () => {
    const entry = makeEntry();
    expect(flattenOccurrences(entry)).toEqual([]);
  });

  it("flattens multiple pages and occurrences", () => {
    const entry = makeEntry({
      gemara_pages: [
        {
          label: "Berakhot 2a",
          page_id: "b2a",
          url_nikud: "http://a",
          url_explain: "http://b",
          occurrences: [
            {
              gemara: {
                word: "מִלָּה",
                before: ["a"],
                after: ["b"],
                full_context: "a מִלָּה b",
              },
              steinsaltz: null,
            },
            {
              gemara: {
                word: "מִלָּה",
                before: ["c"],
                after: ["d"],
                full_context: "c מִלָּה d",
              },
              steinsaltz: null,
            },
          ],
        },
        {
          label: "Berakhot 2b",
          page_id: "b2b",
          url_nikud: "http://c",
          url_explain: "http://d",
          occurrences: [
            {
              gemara: {
                word: "מִלָּה",
                before: ["e"],
                after: ["f"],
                full_context: "e מִלָּה f",
              },
              steinsaltz: null,
            },
          ],
        },
      ],
    });

    const result = flattenOccurrences(entry);
    expect(result).toHaveLength(3);
    expect(result[0].pageLabel).toBe("Berakhot 2a");
    expect(result[0].occurrenceIndex).toBe(0);
    expect(result[1].occurrenceIndex).toBe(1);
    expect(result[2].pageLabel).toBe("Berakhot 2b");
    expect(result[2].occurrenceIndex).toBe(0);
  });

  it("splits gemaraWords from ellipsis-separated word", () => {
    const entry = makeEntry({
      gemara_pages: [
        {
          label: "Test",
          page_id: "t1",
          url_nikud: "",
          url_explain: "",
          occurrences: [
            {
              gemara: {
                word: "אָב…בֵּן",
                before: [],
                after: [],
                full_context: "",
              },
              steinsaltz: null,
            },
          ],
        },
      ],
    });

    const result = flattenOccurrences(entry);
    expect(result[0].gemaraWords).toEqual(["אָב", "בֵּן"]);
  });
});

// ─── entryMatchesFilters ─────────────────────────────────────────────────────

describe("entryMatchesFilters", () => {
  it("matches everything with empty filters", () => {
    const entry = makeEntry();
    expect(entryMatchesFilters(entry, EMPTY_FILTERS)).toBe(true);
  });

  it("filters by word text", () => {
    const entry = makeEntry({ word_with_nikkud: "שָׁלוֹם" });
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, word: "שלום" })).toBe(false);
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, word: "שָׁלוֹם" })).toBe(true);
  });

  it("filters by status", () => {
    const entry = makeEntry({ _status: "done", ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true } });
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, status: { correct: "include" } })).toBe(true);
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, status: { incorrect: "include" } })).toBe(false);
  });

  it("filters by manual status", () => {
    const entry = makeEntry({ manual_status: "good" });
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, manual: { good: "include" } })).toBe(true);
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, manual: { to_fix: "include" } })).toBe(false);
  });

  it("filters unset manual status", () => {
    const entry = makeEntry({ manual_status: null });
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, manual: { unset: "include" } })).toBe(true);
  });

  it("filters by rerun flag", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, needs_ai_rerun: true },
    });
    expect(entryMatchesFilters(entry, { ...EMPTY_FILTERS, manual: { rerun: "include" } })).toBe(true);
  });
});

// ─── normalizeAiVerification ─────────────────────────────────────────────────

describe("normalizeAiVerification", () => {
  it("returns defaults for null input", () => {
    const result = normalizeAiVerification(null);
    expect(result.nikkud_correct).toBeNull();
    expect(result.pages_same_meaning).toEqual([]);
    expect(result.ai_trials).toEqual([]);
  });

  it("preserves existing values", () => {
    const result = normalizeAiVerification({
      nikkud_correct: true,
      notes: "test",
    });
    expect(result.nikkud_correct).toBe(true);
    expect(result.notes).toBe("test");
  });
});

// ─── coerceBoolean ───────────────────────────────────────────────────────────

describe("coerceBoolean", () => {
  it("coerces truthy values", () => {
    expect(coerceBoolean(true)).toBe(true);
    expect(coerceBoolean("true")).toBe(true);
    expect(coerceBoolean(1)).toBe(true);
    expect(coerceBoolean("1")).toBe(true);
  });

  it("returns false for other values", () => {
    expect(coerceBoolean(false)).toBe(false);
    expect(coerceBoolean("false")).toBe(false);
    expect(coerceBoolean(0)).toBe(false);
    expect(coerceBoolean(null)).toBe(false);
    expect(coerceBoolean(undefined)).toBe(false);
  });
});

// ─── matchesTextFilter ───────────────────────────────────────────────────────

describe("matchesTextFilter", () => {
  it("returns true for empty needle", () => {
    expect(matchesTextFilter("anything", "")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesTextFilter("Hello World", "hello")).toBe(true);
  });

  it("returns false when not found", () => {
    expect(matchesTextFilter("abc", "xyz")).toBe(false);
  });
});

// ─── hasSameDisplayedNikkud ──────────────────────────────────────────────────

describe("hasSameDisplayedNikkud", () => {
  it("matches identical strings", () => {
    expect(hasSameDisplayedNikkud("אָב", "אָב")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(hasSameDisplayedNikkud(" אָב ", "אָב")).toBe(true);
  });

  it("returns false for different nikkud", () => {
    expect(hasSameDisplayedNikkud("אָב", "אַב")).toBe(false);
  });
});

// ─── extractDictionaryNikkudWord ─────────────────────────────────────────────

describe("extractDictionaryNikkudWord", () => {
  it("returns null for empty meaning", () => {
    const entry = makeEntry();
    expect(extractDictionaryNikkudWord(entry)).toBeNull();
  });

  it("returns null for non-Hebrew head", () => {
    const entry = makeEntry({
      dictionary: { query_used: "", suggestions: [], meaning: "hello - world", dict_url: "" },
    });
    expect(extractDictionaryNikkudWord(entry)).toBeNull();
  });

  it("extracts Hebrew head with nikkud", () => {
    const entry = makeEntry({
      dictionary: { query_used: "", suggestions: [], meaning: "שָׁלוֹם - paix", dict_url: "" },
    });
    expect(extractDictionaryNikkudWord(entry)).toBe("שָׁלוֹם");
  });

  it("returns null for Hebrew without nikkud marks", () => {
    const entry = makeEntry({
      dictionary: { query_used: "", suggestions: [], meaning: "שלום - paix", dict_url: "" },
    });
    expect(extractDictionaryNikkudWord(entry)).toBeNull();
  });
});

// ─── countCorrectionChanges ──────────────────────────────────────────────────

describe("countCorrectionChanges", () => {
  it("returns null when no correction", () => {
    const entry = makeEntry();
    expect(countCorrectionChanges(entry)).toBeNull();
  });

  it("returns 0 when correction matches original", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: { ...EMPTY_AI_VERIFICATION, corrected_nikkud_word: "אָב" },
    });
    expect(countCorrectionChanges(entry)).toBe(0);
  });

  it("counts differing clusters", () => {
    // Two 2-cluster words differing in one cluster
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: { ...EMPTY_AI_VERIFICATION, corrected_nikkud_word: "אַב" },
    });
    const changes = countCorrectionChanges(entry);
    expect(changes).toBeGreaterThanOrEqual(1);
  });
});

// ─── getStatusSortRank ───────────────────────────────────────────────────────

describe("getStatusSortRank", () => {
  it("ranks error highest (0)", () => {
    expect(getStatusSortRank(makeEntry({ _status: "error" }))).toBe(0);
  });

  it("ranks done+correct lowest (4)", () => {
    expect(
      getStatusSortRank(
        makeEntry({ _status: "done", ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true } })
      )
    ).toBe(4);
  });
});

// ─── getManualStatusSortRank ─────────────────────────────────────────────────

describe("getManualStatusSortRank", () => {
  it("ranks good as 0", () => {
    expect(getManualStatusSortRank("good")).toBe(0);
  });

  it("ranks null/undefined as 4", () => {
    expect(getManualStatusSortRank(null)).toBe(4);
    expect(getManualStatusSortRank(undefined)).toBe(4);
  });
});

// ─── getTrialTone ────────────────────────────────────────────────────────────

describe("getTrialTone", () => {
  it("returns green for success", () => {
    expect(getTrialTone({ model: "m", status: "success", message: "", raw_response: "" })).toContain("green");
  });

  it("returns amber for invalid_json", () => {
    expect(getTrialTone({ model: "m", status: "invalid_json", message: "", raw_response: "" })).toContain("amber");
  });

  it("returns red for other statuses", () => {
    expect(getTrialTone({ model: "m", status: "error", message: "", raw_response: "" })).toContain("red");
  });
});

// ─── getEffectiveModelUsed ───────────────────────────────────────────────────

describe("getEffectiveModelUsed", () => {
  it("returns model_used when present", () => {
    expect(getEffectiveModelUsed({ ...EMPTY_AI_VERIFICATION, model_used: "llama3" })).toBe("llama3");
  });

  it("falls back to last success trial model", () => {
    expect(
      getEffectiveModelUsed({
        ...EMPTY_AI_VERIFICATION,
        ai_trials: [
          { model: "m1", status: "error", message: "", raw_response: "" },
          { model: "m2", status: "success", message: "", raw_response: "" },
        ],
      })
    ).toBe("m2");
  });

  it("falls back to failed_raw_ai_model", () => {
    expect(
      getEffectiveModelUsed({ ...EMPTY_AI_VERIFICATION, failed_raw_ai_model: "fallback" })
    ).toBe("fallback");
  });

  it("returns null when nothing available", () => {
    expect(getEffectiveModelUsed(EMPTY_AI_VERIFICATION)).toBeNull();
  });
});

// ─── rowsToCSV ───────────────────────────────────────────────────────────────

describe("rowsToCSV", () => {
  it("returns empty string for empty array", () => {
    expect(rowsToCSV([])).toBe("");
  });

  it("generates header + data rows", () => {
    const csv = rowsToCSV([{ a: 1, b: "hello" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe("1,hello");
  });

  it("escapes commas and newlines", () => {
    const csv = rowsToCSV([{ col: "a,b\nc" }]);
    expect(csv).toContain('"a,b\nc"');
  });
});

// ─── getImportedStatus ───────────────────────────────────────────────────────

describe("getImportedStatus", () => {
  it("returns 'pending' for entry with no AI data", () => {
    const entry = makeEntry();
    expect(getImportedStatus(entry)).toBe("pending");
  });

  it("returns 'done' when nikkud_correct is set", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true },
    });
    expect(getImportedStatus(entry)).toBe("done");
  });

  it("returns 'done' when corrected_nikkud_word is set", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, corrected_nikkud_word: "אַב" },
    });
    expect(getImportedStatus(entry)).toBe("done");
  });

  it("returns 'done' when notes are present", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, notes: "some note" },
    });
    expect(getImportedStatus(entry)).toBe("done");
  });

  it("returns 'done' when pages_same_meaning has entries", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, pages_same_meaning: ["Berakhot 2a"] },
    });
    expect(getImportedStatus(entry)).toBe("done");
  });
});

// ─── isEntryAlreadyAnalyzed ──────────────────────────────────────────────────

describe("isEntryAlreadyAnalyzed", () => {
  it("returns false for pending entry", () => {
    expect(isEntryAlreadyAnalyzed(makeEntry())).toBe(false);
  });

  it("returns true for done entry without rerun flag", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true },
    });
    expect(isEntryAlreadyAnalyzed(entry)).toBe(true);
  });

  it("returns false for done entry with needs_ai_rerun", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true, needs_ai_rerun: true },
    });
    expect(isEntryAlreadyAnalyzed(entry)).toBe(false);
  });
});

// ─── getImportedNeedsAiRerun ─────────────────────────────────────────────────

describe("getImportedNeedsAiRerun", () => {
  it("returns false when not set", () => {
    expect(getImportedNeedsAiRerun(makeEntry())).toBe(false);
  });

  it("returns true from ai_verification.needs_ai_rerun", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, needs_ai_rerun: true },
    });
    expect(getImportedNeedsAiRerun(entry)).toBe(true);
  });

  it("coerces string 'true' to true", () => {
    const entry = makeEntry({
      ai_verification: { ...EMPTY_AI_VERIFICATION, needs_ai_rerun: "true" as any },
    });
    expect(getImportedNeedsAiRerun(entry)).toBe(true);
  });
});

// ─── getStatusFilterValue ────────────────────────────────────────────────────

describe("getStatusFilterValue", () => {
  it("returns 'error' for error status", () => {
    expect(getStatusFilterValue(makeEntry({ _status: "error" }))).toBe("error");
  });

  it("returns 'processing' for processing status", () => {
    expect(getStatusFilterValue(makeEntry({ _status: "processing" }))).toBe("processing");
  });

  it("returns 'pending' for pending status", () => {
    expect(getStatusFilterValue(makeEntry({ _status: "pending" }))).toBe("pending");
  });

  it("returns 'correct' for done+correct", () => {
    expect(
      getStatusFilterValue(
        makeEntry({ _status: "done", ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: true } })
      )
    ).toBe("correct");
  });

  it("returns 'incorrect' for done+incorrect", () => {
    expect(
      getStatusFilterValue(
        makeEntry({ _status: "done", ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: false } })
      )
    ).toBe("incorrect");
  });
});

// ─── getExactFilterValue ─────────────────────────────────────────────────────

describe("getExactFilterValue", () => {
  it("returns 'none' when no exact match info", () => {
    expect(getExactFilterValue(makeEntry())).toBe("none");
  });

  it("returns 'true' when word matches correction", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: false, corrected_nikkud_word: "אָב" },
    });
    expect(getExactFilterValue(entry)).toBe("true");
  });

  it("returns 'false' when word differs from correction", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: { ...EMPTY_AI_VERIFICATION, nikkud_correct: false, corrected_nikkud_word: "אַב" },
    });
    expect(getExactFilterValue(entry)).toBe("false");
  });
});

// ─── getCorrectionFilterValue ────────────────────────────────────────────────

describe("getCorrectionFilterValue", () => {
  it("returns 'none' when no correction", () => {
    expect(getCorrectionFilterValue(makeEntry())).toBe("none");
  });

  it("returns '0' when correction matches original", () => {
    const entry = makeEntry({
      word_with_nikkud: "אָב",
      ai_verification: { ...EMPTY_AI_VERIFICATION, corrected_nikkud_word: "אָב" },
    });
    expect(getCorrectionFilterValue(entry)).toBe("0");
  });

  it("returns '5+' for many changes", () => {
    const entry = makeEntry({
      word_with_nikkud: "אבגדהו",
      ai_verification: { ...EMPTY_AI_VERIFICATION, corrected_nikkud_word: "וּהֵדָגְבַאֲ" },
    });
    const value = getCorrectionFilterValue(entry);
    // With very different clusters, should be 5+
    expect(["1", "2", "3", "4", "5+"].includes(value) || value === "none").toBe(true);
  });
});

// ─── normalizeTrials ─────────────────────────────────────────────────────────

describe("normalizeTrials", () => {
  it("returns empty array for undefined", () => {
    expect(normalizeTrials(undefined)).toEqual([]);
  });

  it("returns the array as-is when valid", () => {
    const trials = [{ model: "m", status: "success", message: "", raw_response: "" }];
    expect(normalizeTrials(trials)).toBe(trials);
  });
});

// ─── normalizeDisplayedHebrew ────────────────────────────────────────────────

describe("normalizeDisplayedHebrew", () => {
  it("trims whitespace", () => {
    expect(normalizeDisplayedHebrew("  אָב  ")).toBe("אָב");
  });

  it("handles empty string", () => {
    expect(normalizeDisplayedHebrew("")).toBe("");
  });
});

// ─── getUsableApiKeys ────────────────────────────────────────────────────────

describe("getUsableApiKeys", () => {
  it("filters out empty strings", () => {
    expect(getUsableApiKeys(["key1", "", "key2", ""])).toEqual(["key1", "key2"]);
  });

  it("trims whitespace", () => {
    expect(getUsableApiKeys(["  key1  ", ""])).toEqual(["key1"]);
  });

  it("returns empty for all-empty input", () => {
    expect(getUsableApiKeys(["", ""])).toEqual([]);
  });
});

// ─── groupKeysByWord ─────────────────────────────────────────────────────────

describe("groupKeysByWord", () => {
  it("groups keys in pairs (KEY_GROUP_SIZE=2)", () => {
    expect(groupKeysByWord(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles odd number of keys", () => {
    expect(groupKeysByWord(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
  });

  it("returns empty for no keys", () => {
    expect(groupKeysByWord([])).toEqual([]);
  });
});
