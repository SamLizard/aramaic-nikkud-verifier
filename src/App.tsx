import React, { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2, FileUp, Download, Play, Square, CheckCircle2,
  XCircle, Layers, FileJson, Key, Eye, EyeOff,
  ArrowUpDown,
} from "lucide-react";
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
  STATUS_FILTER_OPTIONS,
  EXACT_FILTER_OPTIONS,
  MANUAL_FILTER_OPTIONS,
  CORRECTION_FILTER_OPTIONS,
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
  getManualStatusOption,
  getStatusSortRank,
  getManualStatusSortRank,
  entryMatchesFilters,
  getEffectiveModelUsed,
} from "./utils";
import { renderComparedWord } from "./components/renderers";
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
    if (selectedWordIdx === null) {
      return;
    }

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

        if (!currentJob) {
          return;
        }

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
      {/* Main content — takes all available width */}
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
            <div className="bg-white border border-[#D4C3A3] rounded-lg shadow-sm overflow-hidden flex flex-col h-[70vh]">
              <div className="bg-[#1F130B] p-4 text-[#FDFBF7] flex justify-between items-center shrink-0">
                <span className="flex items-center gap-2 font-serif text-sm">
                  <Layers className="w-4 h-4 text-[#C4A35A]" /> Table de Vérification
                </span>
                <span className="text-[10px] opacity-40 uppercase tracking-widest">
                  {sortedResults.length}
                  {sortedResults.length !== results.length
                    ? ` / ${results.length}`
                    : ""}{" "}
                  Mots
                </span>
              </div>
              <div className="overflow-auto flex-grow">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 opacity-15">
                    <FileUp className="w-12 h-12" />
                    <p className="font-serif text-base">Chargez un fichier JSON pour commencer</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-[#F6F1E6] z-10">
                      <tr className="border-b border-[#D4C3A3] text-[9px] font-bold text-[#8B5E3C] uppercase">
                        {[
                          ["index", "#", "w-10 text-center"],
                          ["word", "Mot (Nikkud)", "w-40"],
                          ["dictionary", "Dictionnaire", "w-36"],
                          ["meaning", "Sens français", ""],
                          ["status", "Statut", "w-20 text-center"],
                          ["manual", "Manuel", "w-28 text-center"],
                          ["exact", "Même exact ?", "w-24 text-center"],
                          ["correction", "Correction IA", "w-40"],
                        ].map(([key, label, className]) => (
                          <th key={key} className={`p-3 ${className}`}>
                            <button
                              onClick={() => handleSort(key as SortKey)}
                              className="flex items-center gap-1 w-full"
                            >
                              <span>{label}</span>
                              <ArrowUpDown className="w-3 h-3 opacity-40" />
                            </button>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-[#D4C3A3] bg-[#FDFBF7]">
                        <th className="px-2 py-1.5 text-center">
                          {Object.values(filters).some((value) => value !== "") ? (
                            <button
                              onClick={() => setFilters(EMPTY_FILTERS)}
                              title="Effacer tous les filtres"
                              className="text-[9px] font-bold text-[#8B5E3C] opacity-60 hover:opacity-100"
                            >
                              ×
                            </button>
                          ) : null}
                        </th>
                        <th className="px-2 py-1.5">
                          <input
                            type="text"
                            value={filters.word}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, word: e.target.value }))
                            }
                            placeholder="Filtrer…"
                            dir="rtl"
                            className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          />
                        </th>
                        <th className="px-2 py-1.5">
                          <input
                            type="text"
                            value={filters.dictionary}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, dictionary: e.target.value }))
                            }
                            placeholder="Filtrer…"
                            className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          />
                        </th>
                        <th className="px-2 py-1.5">
                          <input
                            type="text"
                            value={filters.meaning}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, meaning: e.target.value }))
                            }
                            placeholder="Filtrer…"
                            className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          />
                        </th>
                        <th className="px-2 py-1.5 text-center">
                          <select
                            value={filters.status}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, status: e.target.value }))
                            }
                            className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          >
                            {STATUS_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </th>
                        <th className="px-2 py-1.5 text-center">
                          <select
                            value={filters.manual}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, manual: e.target.value }))
                            }
                            className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          >
                            {MANUAL_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </th>
                        <th className="px-2 py-1.5 text-center">
                          <select
                            value={filters.exact}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, exact: e.target.value }))
                            }
                            className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          >
                            {EXACT_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </th>
                        <th className="px-2 py-1.5">
                          <select
                            value={filters.correction}
                            onChange={(e) =>
                              setFilters((prev) => ({ ...prev, correction: e.target.value }))
                            }
                            className="w-full text-[10px] px-1 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
                          >
                            {CORRECTION_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4C3A3]/20">
                      {sortedResults.map(({ entry, originalIndex }) => {
                        const exactMatchFlag = getExactMatchFlag(entry);
                        const hasCorrection =
                          entry.ai_verification.nikkud_correct === false &&
                          Boolean(entry.ai_verification.corrected_nikkud_word);

                        return (
                          <tr
                            key={originalIndex}
                            onClick={() => setSelectedWordIdx(originalIndex)}
                            className={`cursor-pointer hover:bg-[#FDFBF7] transition-colors ${
                              selectedWordIdx === originalIndex ? "bg-[#F6F1E6]" : ""
                            }`}
                          >
                            <td className="p-3 text-center text-[10px] font-bold opacity-25">{originalIndex + 1}</td>
                            <td className="p-3 text-right font-serif text-xl leading-loose" dir="rtl">
                              {hasCorrection
                                ? renderComparedWord(
                                    entry.word_with_nikkud,
                                    entry.ai_verification.corrected_nikkud_word || "",
                                    "original"
                                  )
                                : entry.word_with_nikkud}
                            </td>
                            <td className="p-3 text-[10px] leading-relaxed opacity-65">
                              <div className="line-clamp-3">{entry.dictionary?.meaning || "—"}</div>
                            </td>
                            <td className="p-3 text-[11px] truncate opacity-60">
                              {entry.french_meaning}
                            </td>
                            <td className="p-3 text-center">
                              {entry._status === "done" ? (
                                entry.ai_verification.nikkud_correct ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-700 mx-auto" />
                                )
                              ) : entry._status === "processing" ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#C4A35A]" />
                              ) : entry._status === "error" ? (
                                <span className="text-orange-500 font-bold">!</span>
                              ) : (
                                <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {getManualStatusOption(entry.manual_status) ? (
                                <span
                                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                                    getManualStatusOption(entry.manual_status)?.className
                                  }`}
                                  title={getManualStatusOption(entry.manual_status)?.label}
                                />
                              ) : (
                                <span
                                  className={`inline-block rounded-full ${
                                    entry.ai_verification.needs_ai_rerun
                                      ? "w-4 h-4 bg-blue-500"
                                      : "w-2 h-2 bg-[#D4C3A3]"
                                  }`}
                                  title={entry.ai_verification.needs_ai_rerun ? "Relance IA demandee" : ""}
                                />
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {exactMatchFlag === null ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
                              ) : exactMatchFlag ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-700 mx-auto" />
                              )}
                            </td>
                            <td
                              className="p-3 text-right font-serif text-lg font-bold text-green-800 leading-loose"
                              dir="rtl"
                            >
                              {entry._status === "done"
                                ? entry.ai_verification.nikkud_correct
                                  ? <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
                                  : entry.ai_verification.corrected_nikkud_word
                                  ? renderComparedWord(
                                      entry.ai_verification.corrected_nikkud_word,
                                      entry.word_with_nikkud,
                                      "corrected"
                                    )
                                  : "—"
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Controls — below the table */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-4 shadow-sm">
              <h2 className="font-serif text-sm font-bold mb-3 flex items-center gap-2 text-[#8B5E3C]">
                <Key className="w-3.5 h-3.5" /> Clés API Groq
              </h2>
              <div className="space-y-2">
                {apiKeyInputs.map((apiKey, index) => (
                  <div key={index} className="relative">
                    <input
                      type={showKeys ? "text" : "password"}
                      placeholder="gsk_..."
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(index, e.target.value)}
                      className="w-full pr-8 py-2 px-3 rounded border border-[#D4C3A3] text-xs font-mono bg-white focus:outline-none focus:border-[#C4A35A]"
                    />
                    {index === 0 && (
                      <button
                        onClick={() => setShowKeys((value) => !value)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                      >
                        {showKeys ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-[9px] opacity-40">
                  2 clés par mot. {keyGroups.length} file(s) parallèle(s).
                </p>
              </div>
            </section>

            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-4 shadow-sm space-y-3">
              <h2 className="font-serif text-sm font-bold flex items-center gap-2 text-[#8B5E3C]">
                <FileUp className="w-3.5 h-3.5" /> Importation & Actions
              </h2>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-2 bg-[#E8D5A8] hover:bg-[#D4BC80] border border-[#C4A35A] rounded text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 text-[#5C3D1E]"
              >
                <FileJson className="w-3.5 h-3.5" /> Charger JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={handleFile}
                accept=".json"
              />
              <button
                onClick={processing ? () => (abortRef.current = true) : handleStartProcess}
                disabled={!processing && results.length === 0}
                className={`w-full py-2.5 rounded font-serif text-sm font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md ${
                  processing
                    ? "bg-red-900 hover:bg-red-800 text-white"
                    : "bg-[#1F130B] hover:bg-[#3D2616] text-[#FDFBF7]"
                }`}
              >
                {processing ? (
                  <>
                    <Square className="w-4 h-4" /> Arrêter
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Lancer l'Analyse
                  </>
                )}
              </button>
              {results.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="py-2 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[10px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3" /> CSV
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="py-2 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[10px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3" /> JSON
                  </button>
                </div>
              )}
            </section>

            {processing && (
              <div className="bg-[#1F130B] text-white p-4 rounded-lg flex flex-col justify-center">
                <div className="flex justify-between text-[10px] mb-1 uppercase font-bold">
                  <span>Analyse…</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#3D2616] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#C4A35A]"
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {doneN > 0 && (
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-white border border-[#D4C3A3] rounded p-2">
                  <div className="font-bold text-base">{doneN}</div>
                  <div className="opacity-40 uppercase font-bold">Analysés</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded p-2">
                  <div className="font-bold text-base text-green-700">{corrN}</div>
                  <div className="opacity-40 uppercase font-bold">Corrects</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <div className="font-bold text-base text-red-700">{doneN - corrN}</div>
                  <div className="opacity-40 uppercase font-bold">À corriger</div>
                </div>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 bg-[#F6F1E6] rounded text-[10px] italic border-l-4 border-[#C4A35A] leading-relaxed md:col-span-2 lg:col-span-4">
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedWord && (
          <>
            {/* Mobile overlay backdrop — only visible below lg */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWordIdx(null)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            />
            {/* Mobile panel — fixed overlay below lg */}
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
            {/* Desktop panel — in-flow flex sibling, no overlay */}
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
