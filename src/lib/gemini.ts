import { WordEntry } from "../types";

interface VerificationResult {
  nikkud_correct: boolean | null;
  pages_same_meaning: string[];
  corrected_nikkud_word: string | null;
  notes: string;
}

interface GeminiModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiListModelsResponse {
  models?: GeminiModel[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

class GeminiRateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const PREFERRED_MODEL_NAMES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];
const modelNameCache = new Map<string, Promise<string>>();
const HEBREW_DIACRITICS_REGEX = /[\u0591-\u05BD\u05BF-\u05C7]/g;

const normalizeModelName = (modelName: string): string =>
  modelName.startsWith("models/") ? modelName : `models/${modelName}`;

const parseApiErrorMessage = async (res: Response): Promise<string> => {
  const err = await res.json().catch(() => ({}));
  return (
    (err as { error?: { message?: string } })?.error?.message ||
    `Gemini API error: HTTP ${res.status}`
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

  const match = message.match(/Please retry in ([\d.]+)s/i);
  if (match) {
    const retryAfterSeconds = Number(match[1]);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000);
    }
  }

  return 30000;
};

const isModelNotFoundError = (message: string): boolean =>
  message.includes("not found") ||
  message.includes("not supported for generateContent");

const isRateLimitError = (error: unknown): error is GeminiRateLimitError =>
  error instanceof GeminiRateLimitError;

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

const fetchAvailableModelName = async (apiKey: string): Promise<string> => {
  const res = await fetch(`${GEMINI_API_BASE_URL}/models`, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  if (!res.ok) {
    return normalizeModelName(PREFERRED_MODEL_NAMES[0]);
  }

  const data = (await res.json()) as GeminiListModelsResponse;
  const models = (data.models || []).filter((model) =>
    (model.supportedGenerationMethods || []).includes("generateContent")
  );

  const preferredModel = PREFERRED_MODEL_NAMES.map(normalizeModelName).find(
    (preferredName) =>
      models.some((model) => normalizeModelName(model.name || "") === preferredName)
  );

  if (preferredModel) {
    return preferredModel;
  }

  const flashModel = models.find((model) =>
    normalizeModelName(model.name || "").includes("flash")
  )?.name;

  if (flashModel) {
    return normalizeModelName(flashModel);
  }

  return normalizeModelName(models[0]?.name || PREFERRED_MODEL_NAMES[0]);
};

const getModelName = async (
  apiKey: string,
  options?: { forceRefresh?: boolean }
): Promise<string> => {
  if (options?.forceRefresh) {
    modelNameCache.delete(apiKey);
  }

  const cachedModel = modelNameCache.get(apiKey);
  if (cachedModel) {
    return cachedModel;
  }

  const modelPromise = fetchAvailableModelName(apiKey);
  modelNameCache.set(apiKey, modelPromise);

  return modelPromise;
};

const requestVerification = async (
  prompt: string,
  apiKey: string,
  modelName: string
): Promise<GeminiGenerateContentResponse> => {
  const url = `${GEMINI_API_BASE_URL}/${normalizeModelName(modelName)}:generateContent?key=${apiKey}`;
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
    const message = await parseApiErrorMessage(res);
    if (res.status === 429) {
      throw new GeminiRateLimitError(message, parseRetryAfterMs(res, message));
    }
    throw new Error(message);
  }

  return (await res.json()) as GeminiGenerateContentResponse;
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

// DONE: Uses direct REST call instead of the SDK to avoid the 404 model-not-found error.
// The SDK sometimes resolves the wrong endpoint depending on the version.
const verifyWithGemini = async (
  entry: WordEntry,
  apiKey: string
): Promise<VerificationResult> => {
  const prompt = generatePrompt(entry);
  let modelName = await getModelName(apiKey);
  let data: GeminiGenerateContentResponse;

  try {
    data = await requestVerification(prompt, apiKey, modelName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isModelNotFoundError(message)) {
      throw error;
    }

    modelName = await getModelName(apiKey, { forceRefresh: true });
    data = await requestVerification(prompt, apiKey, modelName);
  }

  const txt: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
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

export { generatePrompt, verifyWithGemini };
export { GeminiRateLimitError, isRateLimitError };
export type { VerificationResult };
