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

  return `Tu es un expert mondial en araméen du Talmud babylonien (Guemara).

Vérifie le nikkud de ce mot araméen :
  Mot étudiant : "${entry.word_with_nikkud}"
  Sens visé (fr) : "${entry.french_meaning}"
  Dictionnaire : ${dict?.meaning || "N/A"}
  Suggestions : ${(dict?.suggestions || []).slice(0, 4).join(", ")}

Contextes Guemara :
${ctx || "  (aucun contexte disponible)"}

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
};

export { generatePrompt, verifyWithGemini };
export { GeminiRateLimitError, isRateLimitError };
export type { VerificationResult };
