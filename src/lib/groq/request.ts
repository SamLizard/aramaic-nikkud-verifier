import { GroqRequestError, GroqRateLimitError } from "./errors";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "openai/gpt-oss-120b";

export { PRIMARY_MODEL };

export interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export const parseApiErrorMessage = async (res: Response): Promise<string> => {
  const err = await res.json().catch(() => ({}));
  return (
    (err as { error?: { message?: string } })?.error?.message ||
    `Groq API error: HTTP ${res.status}`
  );
};

export const parseRetryAfterMs = (res: Response, message: string): number => {
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

export const isRecoverableStatus = (status: number): boolean =>
  [400, 401, 403, 408, 409, 422, 429].includes(status) || status >= 500;

export const isPrimaryJsonValidationFailure = (
  error: GroqRequestError
): boolean =>
  error.model === PRIMARY_MODEL &&
  error.status === 400 &&
  (error.message.toLowerCase().includes("validate json") ||
    error.message.toLowerCase().includes("failed_generation"));

export const requestVerification = async (
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
                  nikkud_correct: { type: "boolean" },
                  corrected_nikkud_word: { type: "string" },
                  notes: { type: "string" },
                  pages_same_meaning: {
                    type: "array",
                    items: { type: "string" },
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
        : { type: "json_object" },
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
      throw new GroqRateLimitError(
        message,
        model,
        parseRetryAfterMs(res, message)
      );
    }

    throw new GroqRequestError(
      message,
      model,
      res.status,
      parseRetryAfterMs(res, message)
    );
  }

  return (await res.json()) as GroqChatCompletionResponse;
};
