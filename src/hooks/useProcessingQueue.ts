import { useState, useRef, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  verifyWithGroq,
  isRateLimitError,
  extractVerificationErrorDetails,
} from "../lib/groq";
import type { WordEntry } from "../types";
import {
  DELAY_BETWEEN_WORDS_MS,
  RATE_LIMIT_BUFFER_MS,
  MAX_RATE_LIMIT_RETRIES_PER_WORD,
} from "../constants";
import {
  wait,
  normalizeAiVerification,
  isEntryAlreadyAnalyzed,
  getUsableApiKeys,
  groupKeysByWord,
} from "../utils";

interface UseProcessingQueueOptions {
  apiKeyInputs: string[];
  results: WordEntry[];
  setResults: Dispatch<SetStateAction<WordEntry[]>>;
}

export const useProcessingQueue = ({
  apiKeyInputs,
  results,
  setResults,
}: UseProcessingQueueOptions) => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  const abortRef = useRef(false);
  const resultsRef = useRef<WordEntry[]>([]);
  resultsRef.current = results;

  const usableApiKeys = getUsableApiKeys(apiKeyInputs);
  const keyGroups = groupKeysByWord(usableApiKeys);

  const handleStartProcess = useCallback(async () => {
    if (results.length === 0) return;
    if (usableApiKeys.length === 0) {
      setStatusMsg("⚠️ Entrez au moins une clé API Groq.");
      return;
    }

    const entriesToProcess = resultsRef.current
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !isEntryAlreadyAnalyzed(entry));

    if (entriesToProcess.length === 0) {
      setProgress(100);
      setStatusMsg("✓ Tous les mots de ce fichier ont déjà une analyse IA.");
      return;
    }

    setProcessing(true);
    abortRef.current = false;
    setProgress(0);

    let queueIndex = 0;
    let processedCount = 0;
    const total = entriesToProcess.length;

    const runWorker = async (workerKeys: string[], workerNumber: number) => {
      while (!abortRef.current) {
        const currentJob = entriesToProcess[queueIndex];
        queueIndex += 1;
        if (!currentJob) return;

        const currentIndex = currentJob.index;
        setResults((prev) =>
          prev.map((row, index) =>
            index === currentIndex
              ? {
                  ...row,
                  _status: "processing",
                  ai_verification: {
                    ...normalizeAiVerification(row.ai_verification),
                    last_error: "",
                  },
                }
              : row
          )
        );

        let currentWordDone = false;
        let rateLimitRetries = 0;

        while (!currentWordDone && !abortRef.current) {
          setStatusMsg(
            `File ${workerNumber + 1} — ${processedCount + 1}/${total} — ${resultsRef.current[currentIndex]?.word_with_nikkud}`
          );

          try {
            const currentEntry = resultsRef.current[currentIndex];
            const res = await verifyWithGroq(currentEntry, workerKeys);
            setResults((prev) =>
              prev.map((row, index) =>
                index === currentIndex
                  ? {
                      ...row,
                      _status: "done",
                      ai_verification: {
                        ...normalizeAiVerification(row.ai_verification),
                        ...res,
                        needs_ai_rerun: false,
                      },
                    }
                  : row
              )
            );
            currentWordDone = true;
          } catch (err: any) {
            if (
              isRateLimitError(err) &&
              rateLimitRetries < MAX_RATE_LIMIT_RETRIES_PER_WORD
            ) {
              rateLimitRetries += 1;
              const waitMs = err.retryAfterMs + RATE_LIMIT_BUFFER_MS;
              setStatusMsg(
                `Quota Groq atteint. Pause ${Math.ceil(waitMs / 1000)}s avant reprise (${processedCount + 1}/${total}).`
              );
              await wait(waitMs);
              continue;
            }

            const failureDetails = extractVerificationErrorDetails(err);
            console.error(`Error processing word ${currentIndex}:`, err);
            setStatusMsg(`❌ ${err.message}`);
            setResults((prev) =>
              prev.map((row, index) =>
                index === currentIndex
                  ? {
                      ...row,
                      _status: "error",
                      ai_verification: {
                        ...normalizeAiVerification(row.ai_verification),
                        ...failureDetails,
                        needs_ai_rerun: normalizeAiVerification(
                          row.ai_verification
                        ).needs_ai_rerun,
                      },
                    }
                  : row
              )
            );
            currentWordDone = true;
          }
        }

        processedCount += 1;
        setProgress(Math.round((processedCount / total) * 100));

        if (processedCount < total && !abortRef.current) {
          await wait(DELAY_BETWEEN_WORDS_MS);
        }
      }
    };

    try {
      await Promise.all(
        keyGroups.map((workerKeys, workerNumber) =>
          runWorker(workerKeys, workerNumber)
        )
      );
      setStatusMsg(
        abortRef.current ? "Analyse interrompue." : "✓ Analyse terminée."
      );
    } finally {
      setProcessing(false);
    }
  }, [results.length, usableApiKeys, keyGroups, setResults]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    processing,
    progress,
    statusMsg,
    setStatusMsg,
    usableApiKeys,
    keyGroups,
    handleStartProcess,
    handleStop,
  };
};
