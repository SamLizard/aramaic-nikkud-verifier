import { WordEntry } from "../types";

interface VerificationResult {
  nikkud_correct: boolean | null;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

class GroqRateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "GroqRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const HEBREW_DIACRITICS_REGEX = /[\u0591-\u05BD\u05BF-\u05C7]/g;

const parseApiErrorMessage = async (res: Response): Promise<string> => {
  const err = await res.json().catch(() => ({}));
  return (
    (err as { error?: { message?: string } })?.error?.message ||
    `Groq API error: HTTP ${res.status}`
  );
};

const parseRetryAfterMs = (res: Response, message: string): number => {
  const retryAfterHeader = res.headers.get("retry-after");
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000);
    }
  }

  const match = message.match(/retry in ([\d.]+)s/i);
  if (match) {
    const retryAfterSeconds = Number(match[1]);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000);
    }
  }

  return 30000;
};

const isRateLimitError = (error: unknown): error is GroqRateLimitError =>
  error instanceof GroqRateLimitError;

const normalizeSurfaceWithoutNikkud = (text: string): string =>
  text.normalize("NFC").replace(HEBREW_DIACRITICS_REGEX, "");

const hasSameSurfaceWithoutNikkud = (
  originalWord: string,
  correctedWord: string
): boolean =>
  normalizeSurfaceWithoutNikkud(originalWord) ===
  normalizeSurfaceWithoutNikkud(correctedWord);

const buildNotes = (notes: string, extraNote?: string): string => {
  if (!extraNote) {
    return notes || "";
  }

  if (!notes) {
    return extraNote;
  }

  return `${notes} ${extraNote}`;
};

const requestVerification = async (
  prompt: string,
  apiKey: string
): Promise<GroqChatCompletionResponse> => {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 1200,
      top_p: 1,
      reasoning_effort: "medium",
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nikkud_verification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              nikkud_correct: {
                type: "boolean",
              },
              corrected_nikkud_word: {
                type: "string",
              },
              notes: {
                type: "string",
              },
              pages_same_meaning: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: [
              "nikkud_correct",
              "corrected_nikkud_word",
              "notes",
              "pages_same_meaning",
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const message = await parseApiErrorMessage(res);
    if (res.status === 429) {
      throw new GroqRateLimitError(message, parseRetryAfterMs(res, message));
    }
    throw new Error(message);
  }

  return (await res.json()) as GroqChatCompletionResponse;
};

const generatePrompt = (entry: WordEntry): string => {
  const dict = entry.dictionary;
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

  return `Tu es un expert en araméen du Talmud babylonien.

Ta tâche est UNIQUEMENT de vérifier la vocalisation (nikkud) d'une forme déjà écrite.

Données :
  Mot étudiant : "${entry.word_with_nikkud}"
  Forme sans nikkud à préserver : "${entry.base_consonants}"
  Sens visé (fr) : "${entry.french_meaning}"
  Dictionnaire : ${dict?.meaning || "N/A"}
  Suggestions : ${(dict?.suggestions || []).slice(0, 4).join(", ")}
  Entrée avec ellipse : ${entry.is_ellipsis_entry ? "oui" : "non"}

Règles impératives :
1. Le texte araméen doit rester le même. Tu peux modifier seulement le nikkud, le dagesh, le shva et les autres signes de vocalisation.
2. Tu ne dois jamais ajouter, supprimer, remplacer ou déplacer une lettre consonantique.
3. Tu ne dois jamais supprimer ou réécrire une partie de l'expression. Si l'entrée contient plusieurs mots, ו, tirets, maqaf, points de suspension, etc., tout cela doit rester présent exactement dans la correction.
4. Ne remplace jamais l'expression par un lemme, une forme plus courte, une forme canonique ou un synonyme.
5. Le bon choix est celui qui correspond au sens français visé. Les sources ci-dessous servent seulement de preuves pour vérifier l'usage réel du même mot dans la Guemara.
6. Si les sources montrent un autre mot ou un autre sens, ne force pas cette autre forme.
7. "corrected_nikkud_word" doit être soit la forme complète corrigée avec exactement le même texte de base, soit "-".
8. "pages_same_meaning" ne doit contenir que les labels des pages où le mot correspond bien au sens français visé.

Contextes Guemara :
${ctx || "  (aucun contexte disponible)"}

Procédure :
- Compare la forme étudiante au sens visé.
- Utilise les contextes seulement pour vérifier si cette même forme araméenne, avec ce sens, apparaît avec un nikkud déterminé.
- Si la vocalisation étudiante est correcte pour ce sens, mets "nikkud_correct": true et "corrected_nikkud_word": "-".
- Si la vocalisation est incorrecte, propose la forme complète corrigée en conservant exactement les mêmes consonnes et la même ponctuation.

Réponds UNIQUEMENT avec cet objet JSON (sans backticks ni texte autour) :
{"nikkud_correct":boolean,"corrected_nikkud_word":"mot corrigé ou -","notes":"explication grammaticale courte en français","pages_same_meaning":["label1","..."]}`;
};

const verifyWithGroq = async (
  entry: WordEntry,
  apiKey: string
): Promise<VerificationResult> => {
  const prompt = generatePrompt(entry);
  const data = await requestVerification(prompt, apiKey);
  const rawContent = data.choices?.[0]?.message?.content;
  const txt = typeof rawContent === "string" ? rawContent : "{}";
  const clean = txt.replace(/```json|```/g, "").trim();
  const p = JSON.parse(clean) as Partial<VerificationResult>;
  const rawCorrectedWord =
    p.corrected_nikkud_word && p.corrected_nikkud_word !== "-"
      ? p.corrected_nikkud_word.trim()
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
    nikkud_correct: p.nikkud_correct ?? null,
    corrected_nikkud_word: correctedWord,
    notes: buildNotes(p.notes || "", correctionRejected),
    pages_same_meaning: Array.isArray(p.pages_same_meaning)
      ? p.pages_same_meaning
      : [],
  };
};

export { generatePrompt, verifyWithGroq };
export { GroqRateLimitError, isRateLimitError };
export type { VerificationResult };
