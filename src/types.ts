
export interface DictionaryInfo {
  query_used: string;
  suggestions: string[];
  meaning: string;
  dict_url: string;
}

export interface GemaraOccurrence {
  gemara: {
    word: string;
    before: string[];
    after: string[];
    full_context: string;
  };
  steinsaltz: {
    steinsaltz_pos: number;
    word_is_bold: boolean;
    match_score: number;
    before: string[];
    after: string[];
    full_context: string;
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
  model_used?: string | null;
  failed_raw_ai_response?: string;
  failed_raw_ai_model?: string | null;
  failed_raw_ai_error?: string;
  last_error?: string;
}

export interface WordEntry {
  word_with_nikkud: string;
  base_consonants: string;
  french_meaning: string;
  is_ellipsis_entry: boolean;
  dictionary: DictionaryInfo;
  gemara_pages: GemaraPage[];
  ai_verification: AIVerification;
  // Local UI status
  _status?: "pending" | "processing" | "done" | "error";
}
