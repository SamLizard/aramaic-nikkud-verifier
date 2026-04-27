import { GoogleGenAI, Type } from "@google/genai";
import { WordEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface VerificationResult {
  nikkud_correct: boolean;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
  generated_prompt?: string;
}

export function generatePrompt(entry: WordEntry): string {
  return `You are a world-class expert in Aramaic of the Babylonian Talmud (Gemara).
  
Task: Verify if the NIKKUD (vowel marks) on the student's Aramaic word matches the intended meaning, using the provided dictionary and Gemara context.

STUDENT INPUT:
- Word (with nikkud): "${entry.word_with_nikkud}"
- Intended French Meaning: "${entry.french_meaning}"

DICTIONARY DATA:
- Search word: ${entry.dictionary.query_used}
- Suggestions: ${entry.dictionary.suggestions.join(", ")}
- Meanings: ${entry.dictionary.meaning}

GEMARA CONTEXT WINDOWS:
${entry.gemara_pages.map(page => `
Page ${page.label}:
${page.occurrences.map((occ, i) => `
  Occurrence ${i + 1}:
  - Gemara Text (with nikkud): "${occ.gemara.full_context}"
  - Steinsaltz Explanation (Hebrew): "${occ.steinsaltz?.full_context || "N/A"}"
  - Word is bold in Steinsaltz: ${occ.steinsaltz?.word_is_bold ? "Yes" : "No"}
`).join("")}`).join("")}

INSTRUCTIONS:
1. "nikkud_correct": boolean. Is the nikkud on student's word "${entry.word_with_nikkud}" correct for the meaning "${entry.french_meaning}"?
2. "pages_same_meaning": Array of labels (e.g. ["ברכות ה ע\"ב"]) where meaning matches.
3. "corrected_nikkud_word": If wrong, provide the word with FIXED nikkud marks. If correct, return "-".
4. "notes": A brief scholarly explanation.

Return JSON.`;
}

export async function verifyWithGemini(entry: WordEntry): Promise<VerificationResult> {
  const prompt = generatePrompt(entry);

  const result = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nikkud_correct: { type: Type.BOOLEAN },
          pages_same_meaning: { type: Type.ARRAY, items: { type: Type.STRING } },
          corrected_nikkud_word: { type: Type.STRING },
          notes: { type: Type.STRING }
        },
        required: ["nikkud_correct", "pages_same_meaning", "corrected_nikkud_word", "notes"]
      }
    }
  });

  const parsed = JSON.parse(result.text || '{}');
  return {
    nikkud_correct: parsed.nikkud_correct,
    pages_same_meaning: parsed.pages_same_meaning,
    corrected_nikkud_word: parsed.corrected_nikkud_word === "-" ? null : parsed.corrected_nikkud_word,
    notes: parsed.notes
  };
}
