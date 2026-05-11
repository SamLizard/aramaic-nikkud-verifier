import type { AIVerificationTrial, WordEntry } from "../../types";
import {
  GroqRequestError,
  GroqRateLimitError,
  GroqInvalidJsonError,
  GroqAllKeysFailedError,
  isRateLimitError,
  createFailureDetails,
  extractVerificationErrorDetails,
} from "./errors";
import type { InvalidJsonFailure } from "./errors";
import { generatePrompt, generateFallbackPrompt } from "./prompt";
import {
  requestVerification,
  isRecoverableStatus,
  isPrimaryJsonValidationFailure,
  PRIMARY_MODEL,
} from "./request";
import { parseVerificationResponse } from "./parse";
import type { VerificationResult } from "./parse";

const JSON_FALLBACK_MODEL = "qwen/qwen3-32b";

const tryModel = async (
  entry: WordEntry,
  apiKey: string,
  model: string,
  responseFormat: "json_schema" | "json_object",
  priorInvalidJsonFailure?: InvalidJsonFailure,
  aiTrials: AIVerificationTrial[] = []
): Promise<{ verification: VerificationResult; rawContent: string }> => {
  const prompt =
    model === JSON_FALLBACK_MODEL
      ? generateFallbackPrompt(entry)
      : generatePrompt(entry);
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

      if (
        error instanceof GroqRequestError &&
        isPrimaryJsonValidationFailure(error)
      ) {
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

      if (
        error instanceof GroqRequestError &&
        isRecoverableStatus(error.status)
      ) {
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

export { extractVerificationErrorDetails, generatePrompt, verifyWithGroq };
export { GroqRateLimitError, isRateLimitError };
export type { VerificationResult };
