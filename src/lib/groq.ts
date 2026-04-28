import { AIVerification, AIVerificationTrial, WordEntry } from "../types";

interface VerificationResult extends AIVerification {
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

interface InvalidJsonFailure {
  message: string;
  model: string;
  rawResponse: string;
}

interface ErrorVerificationDetails {
  failed_raw_ai_response: string;
  failed_raw_ai_model: string | null;
  failed_raw_ai_error: string;
  last_error: string;
  ai_trials: AIVerificationTrial[];
}

class GroqRequestError extends Error {
  model: string;
  status: number;
  retryAfterMs: number;

  constructor(
    message: string,
    model: string,
    status: number,
    retryAfterMs: number = 30000
  ) {
    super(message);
    this.name = "GroqRequestError";
    this.model = model;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

class GroqRateLimitError extends GroqRequestError {
  constructor(message: string, model: string, retryAfterMs: number) {
    super(message, model, 429, retryAfterMs);
    this.name = "GroqRateLimitError";
  }
}

class GroqInvalidJsonError extends Error {
  model: string;
  rawResponse: string;

  constructor(message: string, model: string, rawResponse: string) {
    super(message);
    this.name = "GroqInvalidJsonError";
    this.model = model;
    this.rawResponse = rawResponse;
  }
}

class GroqAllKeysFailedError extends Error {
  details: ErrorVerificationDetails;

  constructor(message: string, details: ErrorVerificationDetails) {
    super(message);
    this.name = "GroqAllKeysFailedError";
    this.details = details;
  }
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "openai/gpt-oss-120b";
const JSON_FALLBACK_MODEL = "qwen/qwen3-32b";
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

const isRecoverableStatus = (status: number): boolean =>
  [400, 401, 403, 408, 409, 422, 429].includes(status) || status >= 500;

const isPrimaryJsonValidationFailure = (error: GroqRequestError): boolean =>
  error.model === PRIMARY_MODEL &&
  error.status === 400 &&
  (
    error.message.toLowerCase().includes("validate json") ||
    error.message.toLowerCase().includes("failed_generation")
  );

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

const createFailureDetails = (
  message: string,
  invalidJsonFailure?: InvalidJsonFailure,
  aiTrials: AIVerificationTrial[] = []
): ErrorVerificationDetails => ({
  failed_raw_ai_response: invalidJsonFailure?.rawResponse || "",
  failed_raw_ai_model: invalidJsonFailure?.model || null,
  failed_raw_ai_error: invalidJsonFailure?.message || "",
  last_error: message,
  ai_trials: aiTrials,
});

const requestVerification = async (
  prompt: string,
  apiKey: string,
  model: string,
  responseFormat: "json_schema" | "json_object"
): Promise<GroqChatCompletionResponse> => {
  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: responseFormat === "json_schema" ? 0.2 : 0.1,
    max_completion_tokens: 1400,
    top_p: 1,
    stream: false,
    response_format:
      responseFormat === "json_schema"
        ? {
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
          }
        : {
            type: "json_object",
          },
  };

  if (model === PRIMARY_MODEL) {
    body.reasoning_effort = "medium";
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await parseApiErrorMessage(res);
    if (res.status === 429) {
      throw new GroqRateLimitError(message, model, parseRetryAfterMs(res, message));
    }

    throw new GroqRequestError(message, model, res.status, parseRetryAfterMs(res, message));
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

const generateFallbackPrompt = (entry: WordEntry): string =>
  `${generatePrompt(entry)}

IMPORTANT SUPPLÉMENTAIRE :
- Réponds avec du JSON valide uniquement.
- Aucune phrase avant ou après le JSON.
- Si tu n'es pas sûr, renvoie quand même l'objet JSON demandé.`;

const parseVerificationResponse = (
  entry: WordEntry,
  rawContent: string,
  model: string,
  priorInvalidJsonFailure?: InvalidJsonFailure,
  aiTrials: AIVerificationTrial[] = []
): VerificationResult => {
  const clean = rawContent.replace(/```json|```/g, "").trim();
  let parsed: Partial<VerificationResult>;

  try {
    parsed = JSON.parse(clean) as Partial<VerificationResult>;
  } catch (error) {
    throw new GroqInvalidJsonError(
      `Le modèle ${model} n'a pas renvoyé un JSON valide.`,
      model,
      rawContent
    );
  }

  const rawCorrectedWord =
    parsed.corrected_nikkud_word && parsed.corrected_nikkud_word !== "-"
      ? parsed.corrected_nikkud_word.trim()
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
    nikkud_correct: parsed.nikkud_correct ?? null,
    corrected_nikkud_word: correctedWord,
    notes: buildNotes(parsed.notes || "", correctionRejected),
    pages_same_meaning: Array.isArray(parsed.pages_same_meaning)
      ? parsed.pages_same_meaning
      : [],
    model_used: model,
    failed_raw_ai_response: priorInvalidJsonFailure?.rawResponse || "",
    failed_raw_ai_model: priorInvalidJsonFailure?.model || null,
    failed_raw_ai_error: priorInvalidJsonFailure?.message || "",
    last_error: "",
    ai_trials: aiTrials,
  };
};

const tryModel = async (
  entry: WordEntry,
  apiKey: string,
  model: string,
  responseFormat: "json_schema" | "json_object",
  priorInvalidJsonFailure?: InvalidJsonFailure,
  aiTrials: AIVerificationTrial[] = []
): Promise<{ verification: VerificationResult; rawContent: string }> => {
  const prompt =
    model === JSON_FALLBACK_MODEL ? generateFallbackPrompt(entry) : generatePrompt(entry);
  const data = await requestVerification(prompt, apiKey, model, responseFormat);
  const rawContent = data.choices?.[0]?.message?.content;
  const txt = typeof rawContent === "string" ? rawContent : "";

  if (!txt.trim()) {
    throw new GroqInvalidJsonError(
      `Le modèle ${model} n'a pas renvoyé de contenu exploitable.`,
      model,
      txt
    );
  }

  return {
    verification: parseVerificationResponse(
      entry,
      txt,
      model,
      priorInvalidJsonFailure,
      aiTrials
    ),
    rawContent: txt,
  };
};

const verifyWithGroq = async (
  entry: WordEntry,
  apiKeys: string[]
): Promise<VerificationResult> => {
  let lastRecoverableError: GroqRequestError | null = null;
  let latestInvalidJsonFailure: InvalidJsonFailure | undefined;
  const aiTrials: AIVerificationTrial[] = [];

  for (const apiKey of apiKeys) {
    try {
      const primaryAttempt = await tryModel(
        entry,
        apiKey,
        PRIMARY_MODEL,
        "json_schema",
        undefined,
        aiTrials
      );
      aiTrials.push({
        model: PRIMARY_MODEL,
        status: "success",
        message: "JSON valide reçu.",
        raw_response: primaryAttempt.rawContent,
      });
      return {
        ...primaryAttempt.verification,
        ai_trials: [...aiTrials],
      };
    } catch (error) {
      if (error instanceof GroqInvalidJsonError) {
        aiTrials.push({
          model: error.model,
          status: "invalid_json",
          message: error.message,
          raw_response: error.rawResponse,
        });
        latestInvalidJsonFailure = {
          message: error.message,
          model: error.model,
          rawResponse: error.rawResponse,
        };

        try {
          const fallbackAttempt = await tryModel(
            entry,
            apiKey,
            JSON_FALLBACK_MODEL,
            "json_object",
            latestInvalidJsonFailure,
            aiTrials
          );
          aiTrials.push({
            model: JSON_FALLBACK_MODEL,
            status: "success",
            message: "JSON valide reçu.",
            raw_response: fallbackAttempt.rawContent,
          });
          return {
            ...fallbackAttempt.verification,
            ai_trials: [...aiTrials],
          };
        } catch (fallbackError) {
          if (fallbackError instanceof GroqInvalidJsonError) {
            aiTrials.push({
              model: fallbackError.model,
              status: "invalid_json",
              message: fallbackError.message,
              raw_response: fallbackError.rawResponse,
            });
            latestInvalidJsonFailure = {
              message: fallbackError.message,
              model: fallbackError.model,
              rawResponse: fallbackError.rawResponse,
            };
            continue;
          }

          if (
            fallbackError instanceof GroqRequestError &&
            isRecoverableStatus(fallbackError.status)
          ) {
            aiTrials.push({
              model: fallbackError.model,
              status: `api_error_${fallbackError.status}`,
              message: fallbackError.message,
              raw_response: "",
            });
            lastRecoverableError = fallbackError;
            continue;
          }

          throw fallbackError;
        }
      }

      if (error instanceof GroqRequestError && isPrimaryJsonValidationFailure(error)) {
        aiTrials.push({
          model: error.model,
          status: "json_validation_error",
          message: error.message,
          raw_response: error.message,
        });
        latestInvalidJsonFailure = {
          message: error.message,
          model: error.model,
          rawResponse: error.message,
        };

        try {
          const fallbackAttempt = await tryModel(
            entry,
            apiKey,
            JSON_FALLBACK_MODEL,
            "json_object",
            latestInvalidJsonFailure,
            aiTrials
          );
          aiTrials.push({
            model: JSON_FALLBACK_MODEL,
            status: "success",
            message: "JSON valide reçu.",
            raw_response: fallbackAttempt.rawContent,
          });
          return {
            ...fallbackAttempt.verification,
            ai_trials: [...aiTrials],
          };
        } catch (fallbackError) {
          if (fallbackError instanceof GroqInvalidJsonError) {
            aiTrials.push({
              model: fallbackError.model,
              status: "invalid_json",
              message: fallbackError.message,
              raw_response: fallbackError.rawResponse,
            });
            latestInvalidJsonFailure = {
              message: fallbackError.message,
              model: fallbackError.model,
              rawResponse: fallbackError.rawResponse,
            };
            continue;
          }

          if (
            fallbackError instanceof GroqRequestError &&
            isRecoverableStatus(fallbackError.status)
          ) {
            aiTrials.push({
              model: fallbackError.model,
              status: `api_error_${fallbackError.status}`,
              message: fallbackError.message,
              raw_response: fallbackError.message,
            });
            lastRecoverableError = fallbackError;
            continue;
          }

          throw fallbackError;
        }
      }

      if (error instanceof GroqRequestError && isRecoverableStatus(error.status)) {
        aiTrials.push({
          model: error.model,
          status: `api_error_${error.status}`,
          message: error.message,
          raw_response: error.message,
        });
        lastRecoverableError = error;
        continue;
      }

      throw error;
    }
  }

  if (latestInvalidJsonFailure) {
    throw new GroqAllKeysFailedError(
      "Aucune clé n'a permis d'obtenir un JSON valide.",
      createFailureDetails(
        "Aucune clé n'a permis d'obtenir un JSON valide.",
        latestInvalidJsonFailure,
        aiTrials
      )
    );
  }

  if (lastRecoverableError instanceof GroqRateLimitError) {
    throw new GroqRateLimitError(
      lastRecoverableError.message,
      lastRecoverableError.model,
      lastRecoverableError.retryAfterMs
    );
  }

  if (lastRecoverableError) {
    throw new GroqAllKeysFailedError(
      lastRecoverableError.message,
      createFailureDetails(lastRecoverableError.message, undefined, aiTrials)
    );
  }

  throw new GroqAllKeysFailedError(
    "Toutes les clés ont échoué sans réponse exploitable.",
    createFailureDetails(
      "Toutes les clés ont échoué sans réponse exploitable.",
      undefined,
      aiTrials
    )
  );
};

const extractVerificationErrorDetails = (
  error: unknown
): Partial<ErrorVerificationDetails> => {
  if (error instanceof GroqAllKeysFailedError) {
    return error.details;
  }

  if (error instanceof GroqInvalidJsonError) {
    return createFailureDetails(error.message, {
      message: error.message,
      model: error.model,
      rawResponse: error.rawResponse,
    }, [
      {
        model: error.model,
        status: "invalid_json",
        message: error.message,
        raw_response: error.rawResponse,
      },
    ]);
  }

  if (error instanceof Error) {
    return {
      failed_raw_ai_response: "",
      failed_raw_ai_model: null,
      failed_raw_ai_error: "",
      last_error: error.message,
      ai_trials: [],
    };
  }

  return {};
};

export { extractVerificationErrorDetails, generatePrompt, verifyWithGroq };
export { GroqRateLimitError, isRateLimitError };
export type { VerificationResult };
