import React, { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  verifyWithGroq,
  isRateLimitError,
  extractVerificationErrorDetails,
} from "./lib/groq";
import type { WordEntry } from "./types";
import type { SortKey, SortDirection, Filters } from "./constants";
import {
  DELAY_BETWEEN_WORDS_MS,
  RATE_LIMIT_BUFFER_MS,
  MAX_RATE_LIMIT_RETRIES_PER_WORD,
  EMPTY_FILTERS,
} from "./constants";
import {
  rowsToCSV,
  wait,
  normalizeAiVerification,
  getImportedNeedsAiRerun,
  getImportedStatus,
  isEntryAlreadyAnalyzed,
  normalizeKeyInputs,
  getUsableApiKeys,
  groupKeysByWord,
  getExactMatchFlag,
  getStatusSortRank,
  getManualStatusSortRank,
  entryMatchesFilters,
  getEffectiveModelUsed,
} from "./utils";
import VerificationTable from "./components/VerificationTable";
import ControlsPanel from "./components/ControlsPanel";
import WordDetailPanel from "./components/WordDetailPanel";

const App = () => {
  const [results, setResults] = useState<WordEntry[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<string[]>([""]);
  const [showKeys, setShowKeys] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const resultsRef = useRef<WordEntry[]>([]);
  resultsRef.current = results;

  const usableApiKeys = getUsableApiKeys(apiKeyInputs);
  const keyGroups = groupKeysByWord(usableApiKeys);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
        setStatusMsg(`${list.length} mot${list.length > 1 ? "s" : ""} chargé${list.length > 1 ? "s" : ""}.`);
        setSelectedWordIdx(null);
      } catch {
        alert("Erreur de lecture JSON.");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }, []);

  const handleApiKeyChange = (index: number, value: string) => {
    setApiKeyInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return normalizeKeyInputs(next);
    });
  };

  const updateSelectedWord = (updater: (entry: WordEntry) => WordEntry) => {
    if (selectedWordIdx === null) return;
    setResults((prev) =>
      prev.map((entry, index) =>
        index === selectedWordIdx ? updater(entry) : entry
      )
    );
  };

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  };

  const handleStartProcess = async () => {
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
                        needs_ai_rerun: normalizeAiVerification(row.ai_verification).needs_ai_rerun,
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
        keyGroups.map((workerKeys, workerNumber) => runWorker(workerKeys, workerNumber))
      );
      setStatusMsg(abortRef.current ? "Analyse interrompue." : "✓ Analyse terminée.");
    } finally {
      setProcessing(false);
    }
  };

  const sortedResults = useMemo(() => {
    const rows = results
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => entryMatchesFilters(entry, filters));

    rows.sort((left, right) => {
      let leftValue: string | number | boolean | null = left.originalIndex;
      let rightValue: string | number | boolean | null = right.originalIndex;

      switch (sortKey) {
        case "word":
          leftValue = left.entry.word_with_nikkud;
          rightValue = right.entry.word_with_nikkud;
          break;
        case "dictionary":
          leftValue = left.entry.dictionary?.meaning || "";
          rightValue = right.entry.dictionary?.meaning || "";
          break;
        case "meaning":
          leftValue = left.entry.french_meaning;
          rightValue = right.entry.french_meaning;
          break;
        case "status":
          leftValue = getStatusSortRank(left.entry);
          rightValue = getStatusSortRank(right.entry);
          break;
        case "manual":
          leftValue = getManualStatusSortRank(left.entry.manual_status);
          rightValue = getManualStatusSortRank(right.entry.manual_status);
          break;
        case "exact":
          leftValue = getExactMatchFlag(left.entry);
          rightValue = getExactMatchFlag(right.entry);
          break;
        case "correction":
          leftValue = left.entry.ai_verification.corrected_nikkud_word || "";
          rightValue = right.entry.ai_verification.corrected_nikkud_word || "";
          break;
        default:
          break;
      }

      if (leftValue === null) return 1;
      if (rightValue === null) return -1;

      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "fr");

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [results, sortDirection, sortKey, filters]);

  const handleExportCSV = () => {
    const visibleEntries = sortedResults.map((row) => row.entry);
    const csvRows = visibleEntries.map((entry) => {
      const modelUsed = getEffectiveModelUsed(entry.ai_verification);
      const exactMatch = getExactMatchFlag(entry);
      return {
        "Mot (Nikkud)": entry.word_with_nikkud,
        Dictionnaire: entry.dictionary?.meaning || "",
        "Sens (Attendu)": entry.french_meaning,
        "Correct?":
          entry.ai_verification.nikkud_correct === true
            ? "✓"
            : entry.ai_verification.nikkud_correct === false
            ? "✗"
            : "?",
        "Meme exact?":
          exactMatch === null ? "-" : exactMatch ? "true" : "false",
        Correction: entry.ai_verification.corrected_nikkud_word || "-",
        Modele: modelUsed || "",
        "Statut manuel": entry.manual_status || "",
        "Note manuelle": entry.manual_note || "",
        Notes: entry.ai_verification.notes || "",
      };
    });

    const csv = rowsToCSV(csvRows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nikkud_rapport.csv";
    a.click();
  };

  const handleExportJSON = () => {
    const visibleEntries = sortedResults.map((row) => row.entry);
    const dataStr = JSON.stringify(
      visibleEntries.map(({ _status, ...rest }: WordEntry) => rest),
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nikkud_enrichi.json";
    a.click();
  };

  const selectedWord = selectedWordIdx !== null ? results[selectedWordIdx] : null;
  const doneN = results.filter((entry) => entry._status === "done").length;
  const corrN = results.filter(
    (entry) => entry._status === "done" && entry.ai_verification.nikkud_correct === true
  ).length;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D1B0E] font-sans flex">
      <div className="flex-1 min-w-0 py-4 md:py-8 px-4 md:px-8">
        <header className="text-center mb-8 border-b-2 border-[#D4C3A3] pb-6">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#1F130B] mb-1 tracking-tight">
            מאגר ניקוד ארמי
          </h1>
          <p className="text-xs text-[#5C3D1E] font-bold opacity-50 uppercase tracking-widest">
            Vérificateur de Vocalisation IA
          </p>
        </header>

        <div className="flex flex-col gap-8">
          <div>
            <VerificationTable
              results={results}
              sortedResults={sortedResults}
              selectedWordIdx={selectedWordIdx}
              filters={filters}
              onSort={handleSort}
              onFilterChange={setFilters}
              onSelectWord={setSelectedWordIdx}
            />
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFile}
            accept=".json"
          />

          <ControlsPanel
            apiKeyInputs={apiKeyInputs}
            showKeys={showKeys}
            processing={processing}
            progress={progress}
            statusMsg={statusMsg}
            doneN={doneN}
            corrN={corrN}
            hasResults={results.length > 0}
            keyGroupsLength={keyGroups.length}
            onApiKeyChange={handleApiKeyChange}
            onToggleShowKeys={() => setShowKeys((v) => !v)}
            onLoadFile={() => fileRef.current?.click()}
            onStartOrStop={processing ? () => (abortRef.current = true) : handleStartProcess}
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
          />
        </div>
      </div>

      <AnimatePresence>
        {selectedWord && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWordIdx(null)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              key="details-panel-mobile"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[92vw] z-50 bg-white border-l-2 border-[#1F130B] shadow-2xl flex flex-col lg:hidden"
            >
              <WordDetailPanel
                word={selectedWord}
                onUpdate={updateSelectedWord}
                onClose={() => setSelectedWordIdx(null)}
              />
            </motion.div>
            <motion.div
              key="details-panel-desktop"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 620, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="hidden lg:flex flex-col h-screen sticky top-0 overflow-hidden bg-white border-l-2 border-[#1F130B] shadow-2xl shrink-0"
            >
              <div className="w-[620px] h-full flex flex-col">
                <WordDetailPanel
                  word={selectedWord}
                  onUpdate={updateSelectedWord}
                  onClose={() => setSelectedWordIdx(null)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
