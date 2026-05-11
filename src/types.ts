
export interface DictionaryInfo {
  query_used: string;
  suggestions: string[];
  meaning: string;
  dict_url: string;
}

export interface GemaraOccurrence {
  gemara: {
    word: string;
    /** Each matched word (for multi-word entries like "X … Y"). */
    words?: string[];
    before: string[];
    after: string[];
    full_context: string;
    /**
     * Tokenised context window — the UI uses this to highlight each matched
     * word individually instead of rendering a literal "…".
     */
    full_context_tokens?: string[];
    /**
     * Indices inside `full_context_tokens` of each matched word.
     */
    matched_positions?: number[];
  };
  steinsaltz: {
    steinsaltz_pos: number;
    word_is_bold: boolean;
    match_score: number;
    before: string[];
    after: string[];
    full_context: string;
    /**
     * Per-token bold flag, so the UI can reproduce the bold/highlight
     * rendering of daf-yomi.com instead of a flat plain-text block.
     */
    full_context_tokens?: Array<{ t: string; b: boolean }>;
  } | null;
}

export interface GemaraPage {
  label: string;
  page_id: string;
  url_nikud: string;
  url_explain: string;
  occurrences: GemaraOccurrence[];
}

export interface AIVerification {
  nikkud_correct: boolean | null;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
  needs_ai_rerun?: boolean;
  model_used?: string | null;
  failed_raw_ai_response?: string;
  failed_raw_ai_model?: string | null;
  failed_raw_ai_error?: string;
  last_error?: string;
  ai_trials?: AIVerificationTrial[];
}

export interface AIVerificationTrial {
  model: string;
  status: string;
  message: string;
  raw_response: string;
}

export interface WordEntry {
  word_with_nikkud: string;
  base_consonants: string;
  french_meaning: string;
  is_ellipsis_entry: boolean;
  dictionary: DictionaryInfo;
  gemara_pages: GemaraPage[];
  ai_verification: AIVerification;
  manual_status?: "good" | "to_fix" | "need_more_sources" | "to_ask" | null;
  manual_note?: string;
  // Local UI status
  _status?: "pending" | "processing" | "done" | "error";
}

export interface DisplayOccurrence {
  pageLabel: string;
  urlNikud: string;
  urlExplain: string;
  occurrenceIndex: number;
  gemaraWord: string;
  gemaraWords: string[];
  fullContext: string;
  fullContextTokens: string[];
  matchedPositions: number[];
  before: string[];
  after: string[];
  steinsaltzContext: string;
  steinsaltzContextTokens: Array<{ t: string; b: boolean }>;
}
