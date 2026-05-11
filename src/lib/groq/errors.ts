import type { AIVerificationTrial } from "../../types";

export interface InvalidJsonFailure {
  message: string;
  model: string;
  rawResponse: string;
}

export interface ErrorVerificationDetails {
  failed_raw_ai_response: string;
  failed_raw_ai_model: string | null;
  failed_raw_ai_error: string;
  last_error: string;
  ai_trials: AIVerificationTrial[];
}

export class GroqRequestError extends Error {
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

export class GroqRateLimitError extends GroqRequestError {
  constructor(message: string, model: string, retryAfterMs: number) {
    super(message, model, 429, retryAfterMs);
    this.name = "GroqRateLimitError";
  }
}

export class GroqInvalidJsonError extends Error {
  model: string;
  rawResponse: string;

  constructor(message: string, model: string, rawResponse: string) {
    super(message);
    this.name = "GroqInvalidJsonError";
    this.model = model;
    this.rawResponse = rawResponse;
  }
}

export class GroqAllKeysFailedError extends Error {
  details: ErrorVerificationDetails;

  constructor(message: string, details: ErrorVerificationDetails) {
    super(message);
    this.name = "GroqAllKeysFailedError";
    this.details = details;
  }
}

export const isRateLimitError = (
  error: unknown
): error is GroqRateLimitError => error instanceof GroqRateLimitError;

export const createFailureDetails = (
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

export const extractVerificationErrorDetails = (
  error: unknown
): Partial<ErrorVerificationDetails> => {
  if (error instanceof GroqAllKeysFailedError) {
    return error.details;
  }

  if (error instanceof GroqInvalidJsonError) {
    return createFailureDetails(
      error.message,
      {
        message: error.message,
        model: error.model,
        rawResponse: error.rawResponse,
      },
      [
        {
          model: error.model,
          status: "invalid_json",
          message: error.message,
          raw_response: error.rawResponse,
        },
      ]
    );
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
