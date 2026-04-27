import { WordEntry } from "../types";

export interface VerificationResult {
  nikkud_correct: boolean;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
}

export function generatePrompt(entry: WordEntry): string {
  const dict = entry.dictionary || {};
  const ctx = (entry.gemara_pages || [])
    .flatMap((page) =>
      (page.occurrences || []).map((occ, i) => {
        const b = (occ.gemara?.before || []).slice(-4).join(" ");
        const a = (occ.gemara?.after || []).slice(0, 4).join(" ");
        const w = occ.gemara?.word || "";
        const s = occ.steinsaltz?.full_context
          ? ` [Steinsaltz: ${(occ.steinsaltz.full_context || "").slice(0, 80)}]`
          : "";
        return `  • ${page.label} occ.${i + 1}: ${b} 【${w}】 ${a}${s}`;
      })
    )
    .join("\n");

  return `Tu es un expert mondial en araméen du Talmud babylonien (Guemara).

Vérifie le nikkud de ce mot araméen :
  Mot étudiant : "${entry.word_with_nikkud}"
  Sens visé (fr) : "${entry.french_meaning}"
  Dictionnaire : ${dict.meaning || "N/A"}
  Suggestions : ${(dict.suggestions || []).slice(0, 4).join(", ")}

Contextes Guemara :
${ctx || "  (aucun contexte disponible)"}

Réponds UNIQUEMENT avec cet objet JSON (sans backticks ni texte autour) :
{"nikkud_correct":boolean,"corrected_nikkud_word":"mot corrigé ou -","notes":"explication grammaticale courte en français","pages_same_meaning":["label1","..."]}`;
}

// Uses direct REST call instead of the SDK to avoid the 404 model-not-found error.
// The SDK sometimes resolves the wrong endpoint depending on the version.
export async function verifyWithGemini(
  entry: WordEntry,
  apiKey: string
): Promise<VerificationResult> {
  const prompt = generatePrompt(entry);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any)?.error?.message || `Gemini API error: HTTP ${res.status}`
    );
  }

  const data = await res.json();
  const txt: string =
    data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = txt.replace(/```json|```/g, "").trim();
  const p = JSON.parse(clean);

  return {
    nikkud_correct: p.nikkud_correct ?? null,
    corrected_nikkud_word:
      p.corrected_nikkud_word && p.corrected_nikkud_word !== "-"
        ? p.corrected_nikkud_word
        : null,
    notes: p.notes || "",
    pages_same_meaning: Array.isArray(p.pages_same_meaning)
      ? p.pages_same_meaning
      : [],
  };
}
