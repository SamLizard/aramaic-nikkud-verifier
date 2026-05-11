import React, { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WordEntry } from "../types";
import {
  normalizeAiVerification,
  getImportedNeedsAiRerun,
  getImportedStatus,
} from "../utils";

interface UseFileImportOptions {
  setResults: Dispatch<SetStateAction<WordEntry[]>>;
  setStatusMsg: (msg: string) => void;
  setSelectedWordIdx: Dispatch<SetStateAction<number | null>>;
}

export const useFileImport = ({
  setResults,
  setStatusMsg,
  setSelectedWordIdx,
}: UseFileImportOptions) => {
  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const raw = JSON.parse(ev.target?.result as string);
          const list: WordEntry[] = Array.isArray(raw) ? raw : [raw];
          setResults(
            list.map((entry) => {
              const aiVerification = {
                ...normalizeAiVerification(entry.ai_verification),
                needs_ai_rerun: getImportedNeedsAiRerun(entry),
              };
              return {
                ...entry,
                ai_verification: aiVerification,
                manual_status: entry.manual_status || null,
                manual_note: entry.manual_note || "",
                _status: getImportedStatus({
                  ...entry,
                  ai_verification: aiVerification,
                }),
              };
            })
          );
          setStatusMsg(
            `${list.length} mot${list.length > 1 ? "s" : ""} chargé${list.length > 1 ? "s" : ""}.`
          );
          setSelectedWordIdx(null);
        } catch {
          alert("Erreur de lecture JSON.");
        }
      };
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    [setResults, setStatusMsg, setSelectedWordIdx]
  );

  return { handleFile };
};
