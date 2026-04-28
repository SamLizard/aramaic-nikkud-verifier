import React, { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2, FileUp, Download, Play, Square, Info, CheckCircle2,
  XCircle, Search, BookOpen, Layers, FileJson, X, Key, Eye, EyeOff,
  ArrowUpDown,
} from "lucide-react";
import {
  verifyWithGroq,
  generatePrompt,
  isRateLimitError,
  extractVerificationErrorDetails,
} from "./lib/groq";
import { AIVerification, AIVerificationTrial, WordEntry } from "./types";

const DELAY_BETWEEN_WORDS_MS = 600;
const RATE_LIMIT_BUFFER_MS = 1200;
const MAX_RATE_LIMIT_RETRIES_PER_WORD = 8;
const KEY_GROUP_SIZE = 2;
const HEBREW_MARK_REGEX = /[\u0591-\u05C7]/;

type SortKey =
  | "index"
  | "word"
  | "dictionary"
  | "meaning"
  | "status"
  | "exact"
  | "correction";
type SortDirection = "asc" | "desc";

const EMPTY_AI_VERIFICATION: AIVerification = {
  nikkud_correct: null,
  corrected_nikkud_word: null,
  notes: "",
  pages_same_meaning: [],
  model_used: null,
  failed_raw_ai_response: "",
  failed_raw_ai_model: null,
  failed_raw_ai_error: "",
  last_error: "",
  ai_trials: [],
};

const rowsToCSV = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const allKeys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const text = String(v ?? "");
    return text.includes(",") || text.includes("\n") ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };

  return [
    allKeys.join(","),
    ...rows.map((row) => allKeys.map((key) => escape(row[key])).join(",")),
  ].join("\n");
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeTrials = (trials?: AIVerificationTrial[]): AIVerificationTrial[] =>
  Array.isArray(trials) ? trials : [];

const normalizeAiVerification = (
  verification?: Partial<AIVerification> | null
): AIVerification => ({
  ...EMPTY_AI_VERIFICATION,
  ...verification,
  pages_same_meaning: Array.isArray(verification?.pages_same_meaning)
    ? verification?.pages_same_meaning
    : [],
  ai_trials: normalizeTrials(verification?.ai_trials),
});

const getImportedStatus = (entry: WordEntry): WordEntry["_status"] => {
  const verification = normalizeAiVerification(entry.ai_verification);
  const hasVerdict = verification.nikkud_correct !== null;
  const hasCorrection = Boolean(verification.corrected_nikkud_word);
  const hasNotes = Boolean(verification.notes?.trim());
  const hasPages = verification.pages_same_meaning.length > 0;

  return hasVerdict || hasCorrection || hasNotes || hasPages ? "done" : "pending";
};

const isEntryAlreadyAnalyzed = (entry: WordEntry): boolean =>
  getImportedStatus(entry) === "done";

const normalizeKeyInputs = (inputs: string[]): string[] => {
  const next = [...inputs];

  while (next.length > 1 && next[next.length - 1] === "" && next[next.length - 2] === "") {
    next.pop();
  }

  if (next.every((value) => value === "")) {
    return [""];
  }

  if (next[next.length - 1] !== "") {
    next.push("");
  }

  return next;
};

const getUsableApiKeys = (inputs: string[]): string[] =>
  inputs.map((key) => key.trim()).filter(Boolean);

const groupKeysByWord = (keys: string[]): string[][] => {
  const groups: string[][] = [];

  for (let i = 0; i < keys.length; i += KEY_GROUP_SIZE) {
    groups.push(keys.slice(i, i + KEY_GROUP_SIZE));
  }

  return groups;
};

const getExactMatchFlag = (entry: WordEntry): boolean | null => {
  if (entry.ai_verification.nikkud_correct !== false) {
    return null;
  }

  if (!entry.ai_verification.corrected_nikkud_word) {
    return null;
  }

  return entry.word_with_nikkud === entry.ai_verification.corrected_nikkud_word;
};

const splitVisualClusters = (text: string): string[] => {
  const clusters: string[] = [];
  let current = "";

  for (const char of Array.from((text || "").normalize("NFC"))) {
    if (!current) {
      current = char;
      continue;
    }

    if (HEBREW_MARK_REGEX.test(char)) {
      current += char;
      continue;
    }

    clusters.push(current);
    current = char;
  }

  if (current) {
    clusters.push(current);
  }

  return clusters;
};

const renderComparedWord = (
  text: string,
  otherText: string,
  tone: "original" | "corrected"
) => {
  const sourceTokens = splitVisualClusters(text);
  const otherTokens = splitVisualClusters(otherText);
  const maxLen = Math.max(sourceTokens.length, otherTokens.length);

  return (
    <>
      {Array.from({ length: maxLen }, (_, index) => {
        const token = sourceTokens[index] || "";
        const otherToken = otherTokens[index] || "";
        const isDifferent = token !== otherToken;
        const className = isDifferent
          ? tone === "original"
            ? "bg-red-100 text-red-900 rounded px-0.5"
            : "bg-amber-100 text-[#8B5E3C] rounded px-0.5"
          : "";

        return (
          <span key={`${tone}-${index}`} className={className}>
            {token || "\u200b"}
          </span>
        );
      })}
    </>
  );
};

const getEffectiveModelUsed = (verification: AIVerification): string | null => {
  if (verification.model_used) {
    return verification.model_used;
  }

  const successTrial = [...normalizeTrials(verification.ai_trials)]
    .reverse()
    .find((trial) => trial.status === "success");

  return successTrial?.model || verification.failed_raw_ai_model || null;
};

const getStatusRank = (status?: WordEntry["_status"]): number => {
  switch (status) {
    case "done":
      return 3;
    case "processing":
      return 2;
    case "error":
      return 1;
    default:
      return 0;
  }
};

const getTrialTone = (trial: AIVerificationTrial): string => {
  if (trial.status === "success") {
    return "text-green-700 border-green-200 bg-green-50";
  }

  if (trial.status === "invalid_json") {
    return "text-amber-800 border-amber-200 bg-amber-50";
  }

  return "text-red-700 border-red-200 bg-red-50";
};

const App = () => {
  const [results, setResults] = useState<WordEntry[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<string[]>([""]);
  const [showKeys, setShowKeys] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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
            const aiVerification = normalizeAiVerification(entry.ai_verification);
            return {
              ...entry,
              ai_verification: aiVerification,
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
    const rows = results.map((entry, originalIndex) => ({ entry, originalIndex }));

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
          leftValue = getStatusRank(left.entry._status);
          rightValue = getStatusRank(right.entry._status);
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
  }, [results, sortDirection, sortKey]);

  const handleExportCSV = () => {
    const csvRows = results.map((entry) => {
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
    const dataStr = JSON.stringify(
      results.map(({ _status, ...rest }: WordEntry) => rest),
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
  const selectedExactMatch = selectedWord ? getExactMatchFlag(selectedWord) : null;
  const selectedModelUsed = selectedWord
    ? getEffectiveModelUsed(selectedWord.ai_verification)
    : null;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D1B0E] font-sans">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <header className="text-center mb-8 border-b-2 border-[#D4C3A3] pb-6">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#1F130B] mb-1 tracking-tight">
            מאגר ניקוד ארמי
          </h1>
          <p className="text-xs text-[#5C3D1E] font-bold opacity-50 uppercase tracking-widest">
            Vérificateur de Vocalisation IA
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-3 space-y-5">
            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-5 shadow-sm">
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
              <p className="text-[9px] opacity-35 mt-1.5">
                Remplissez une clé, puis un nouveau champ apparaît automatiquement.
              </p>
            </section>

            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-5 shadow-sm space-y-3">
              <h2 className="font-serif text-sm font-bold flex items-center gap-2 text-[#8B5E3C]">
                <FileUp className="w-3.5 h-3.5" /> Importation
              </h2>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-2.5 bg-[#E8D5A8] hover:bg-[#D4BC80] border border-[#C4A35A] rounded text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 text-[#5C3D1E]"
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
                className={`w-full py-3.5 rounded font-serif text-base font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md ${
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
            </section>

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

            {processing && (
              <div className="bg-[#1F130B] text-white p-4 rounded-lg">
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
              <div className="p-3 bg-[#F6F1E6] rounded text-[10px] italic border-l-4 border-[#C4A35A] leading-relaxed">
                {statusMsg}
              </div>
            )}
          </div>

          <div className="lg:col-span-9">
            <div className="bg-white border border-[#D4C3A3] rounded-lg shadow-sm overflow-hidden flex flex-col h-[70vh]">
              <div className="bg-[#1F130B] p-4 text-[#FDFBF7] flex justify-between items-center shrink-0">
                <span className="flex items-center gap-2 font-serif text-sm">
                  <Layers className="w-4 h-4 text-[#C4A35A]" /> Table de Vérification
                </span>
                <span className="text-[10px] opacity-40 uppercase tracking-widest">
                  {results.length} Mots
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
        </div>
      </div>

      <AnimatePresence>
        {selectedWord && (
          <div className="fixed inset-0 z-50 pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWordIdx(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div
              key="details-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-[92vw] lg:w-[620px] bg-white border-l-2 border-[#1F130B] shadow-2xl pointer-events-auto flex flex-col"
            >
              <div className="bg-[#1F130B] text-white p-4 shrink-0">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] font-black tracking-widest uppercase opacity-35">
                    Expertise Linguistique
                  </span>
                  <button
                    onClick={() => setSelectedWordIdx(null)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex justify-between items-baseline gap-3 mb-3">
                  <p className="text-xs opacity-40 italic max-w-[45%] leading-relaxed">
                    « {selectedWord.french_meaning} »
                  </p>
                  <h3 className="font-serif text-2xl font-bold text-right" dir="rtl">
                    {selectedWord.word_with_nikkud}
                  </h3>
                </div>
                <div className="flex gap-2">
                  {selectedWord.dictionary.dict_url && (
                    <a
                      href={selectedWord.dictionary.dict_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2 bg-[#C4A35A] hover:bg-[#B3934A] text-white text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors uppercase tracking-widest"
                    >
                      <Search className="w-3 h-3" /> Dictionnaire
                    </a>
                  )}
                  <button
                    onClick={() => setShowPrompt((value) => !value)}
                    className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors uppercase tracking-widest"
                  >
                    {showPrompt ? "Masquer Prompt" : "Voir Prompt"}
                  </button>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto bg-[#FDFBF7]">
                {showPrompt && (
                  <pre className="m-4 p-4 bg-gray-900 text-green-400 text-[10px] font-mono whitespace-pre-wrap leading-relaxed rounded-lg shadow-inner">
                    {generatePrompt(selectedWord)}
                  </pre>
                )}

                <div className="p-4 pb-0">
                  <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
                    <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
                      <BookOpen className="w-3 h-3" /> Dictionnaire
                    </h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-bold">Requête :</span> {selectedWord.dictionary.query_used || "—"}</p>
                      <p><span className="font-bold">Définition :</span> {selectedWord.dictionary.meaning || "—"}</p>
                      <p>
                        <span className="font-bold">Suggestions :</span>{" "}
                        {selectedWord.dictionary.suggestions?.length
                          ? selectedWord.dictionary.suggestions.join(", ")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedWord._status === "done" && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-[10px] uppercase font-bold text-[#8B5E3C]">
                      <span>Modèle utilisé : {selectedModelUsed || "—"}</span>
                      {selectedExactMatch !== null && (
                        <span className={selectedExactMatch ? "text-green-700" : "text-red-700"}>
                          Même exact ? {selectedExactMatch ? "true" : "false"}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className={`p-3 rounded-lg border-2 ${
                          selectedWord.ai_verification.nikkud_correct
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          {selectedWord.ai_verification.nikkud_correct ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                          )}
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-50">
                            {selectedWord.ai_verification.nikkud_correct ? "Correct" : "À corriger"}
                          </span>
                        </div>
                        <div className="font-serif text-xl text-right leading-loose" dir="rtl">
                          {!selectedWord.ai_verification.nikkud_correct &&
                          selectedWord.ai_verification.corrected_nikkud_word
                            ? renderComparedWord(
                                selectedWord.word_with_nikkud,
                                selectedWord.ai_verification.corrected_nikkud_word,
                                "original"
                              )
                            : selectedWord.word_with_nikkud}
                        </div>
                      </div>

                      <div
                        className={`p-3 rounded-lg border-2 flex flex-col justify-center ${
                          !selectedWord.ai_verification.nikkud_correct &&
                          selectedWord.ai_verification.corrected_nikkud_word
                            ? "bg-amber-50 border-amber-200"
                            : "bg-[#F6F1E6] border-[#D4C3A3]"
                        }`}
                      >
                        {!selectedWord.ai_verification.nikkud_correct &&
                        selectedWord.ai_verification.corrected_nikkud_word ? (
                          <>
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-[8px] font-black uppercase tracking-widest opacity-50">
                                Correction IA
                              </span>
                            </div>
                            <div className="font-serif text-xl text-right font-bold text-green-800 leading-loose" dir="rtl">
                              {renderComparedWord(
                                selectedWord.ai_verification.corrected_nikkud_word,
                                selectedWord.word_with_nikkud,
                                "corrected"
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic text-center">
                            {selectedWord.ai_verification.nikkud_correct
                              ? "Vocalisation correcte ✓"
                              : "Aucune correction fournie"}
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedWord.ai_verification.notes && (
                      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
                        <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
                          <Info className="w-3 h-3" /> Analyse Grammaticale
                        </h4>
                        <p className="text-sm leading-relaxed text-[#2D1B0E]">
                          {selectedWord.ai_verification.notes}
                        </p>
                      </div>
                    )}

                    {selectedWord.ai_verification.pages_same_meaning.length > 0 && (
                      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
                        <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
                          <BookOpen className="w-3 h-3" /> Même sens —{" "}
                          {selectedWord.ai_verification.pages_same_meaning.length} page(s)
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedWord.ai_verification.pages_same_meaning.map((page, index) => (
                            <span
                              key={index}
                              className="text-xs px-2.5 py-0.5 rounded-full bg-[#F6F1E6] border border-[#D4C3A3] font-serif"
                              dir="rtl"
                            >
                              {page}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {normalizeTrials(selectedWord.ai_verification.ai_trials).length > 0 && (
                  <div className="px-4 pb-4">
                    <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C]">
                        Historique des essais IA
                      </h4>
                      {normalizeTrials(selectedWord.ai_verification.ai_trials).map((trial, index) => (
                        <div
                          key={`${trial.model}-${index}`}
                          className={`border rounded-lg p-3 space-y-2 ${getTrialTone(trial)}`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] uppercase font-bold">
                            <span>{trial.model}</span>
                            <span>{trial.status}</span>
                          </div>
                          <p className="text-xs leading-relaxed">{trial.message}</p>
                          <pre className="text-[10px] whitespace-pre-wrap break-words bg-white/70 border border-current/15 rounded p-3 font-mono">
                            {trial.raw_response || trial.message}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedWord._status === "error" && (
                  <div className="m-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 space-y-2">
                    <p>{selectedWord.ai_verification.last_error || "Erreur lors de l'analyse. Relancez l'analyse pour réessayer."}</p>
                  </div>
                )}

                {(selectedWord._status === "pending" || selectedWord._status === "processing") && (
                  <div className="m-4 p-3 rounded-lg border border-[#D4C3A3] bg-[#F6F1E6] text-sm text-[#8B5E3C] italic text-center flex items-center justify-center gap-2">
                    {selectedWord._status === "processing" && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {selectedWord._status === "processing" ? "Analyse en cours…" : "En attente d'analyse…"}
                  </div>
                )}

                <div className="p-4 pt-0">
                  <header className="border-b-2 border-[#1F130B]/10 pb-2 flex justify-between items-center mb-3">
                    <h4 className="font-serif text-base text-[#1F130B]">
                      Sources Guemara ({selectedWord.gemara_pages.length})
                    </h4>
                    <BookOpen className="w-4 h-4 opacity-10" />
                  </header>

                  {selectedWord.gemara_pages.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-xl italic text-[11px] text-gray-400">
                      Aucune source trouvée.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedWord.gemara_pages.map((page, pageIndex) => (
                        <div
                          key={pageIndex}
                          className="border border-[#D4C3A3] rounded-lg overflow-hidden bg-white"
                        >
                          <div className="flex justify-between items-center bg-[#F6F1E6] px-3 py-2 border-b border-[#D4C3A3]/40">
                            <span className="text-[8px] opacity-35 font-bold uppercase">
                              {page.occurrences.length} occ.
                            </span>
                            <h5 className="font-serif text-sm font-bold" dir="rtl">
                              {page.label}
                            </h5>
                          </div>

                          {page.occurrences.map((occ, occurrenceIndex) => (
                            <div
                              key={occurrenceIndex}
                              className={`px-3 py-2.5 ${
                                occurrenceIndex < page.occurrences.length - 1
                                  ? "border-b border-[#D4C3A3]/30"
                                  : ""
                              }`}
                            >
                              <p
                                className="text-right font-serif text-lg leading-loose"
                                dir="rtl"
                              >
                                {occ.gemara.before.slice(-5).length > 0 && (
                                  <span className="opacity-40">
                                    {occ.gemara.before.slice(-5).join(" ")}{" "}
                                  </span>
                                )}
                                <span className="text-[#8B5E3C] font-black px-1.5 bg-amber-50 rounded border border-amber-200">
                                  {occ.gemara.word}
                                </span>
                                {occ.gemara.after.slice(0, 5).length > 0 && (
                                  <span className="opacity-40">
                                    {" "}{occ.gemara.after.slice(0, 5).join(" ")}
                                  </span>
                                )}
                              </p>
                              {occ.steinsaltz?.full_context && (
                                <p
                                  className="text-right font-serif text-xs text-gray-400 italic mt-1 leading-relaxed"
                                  dir="rtl"
                                >
                                  {occ.steinsaltz.full_context.slice(0, 120)}
                                  {occ.steinsaltz.full_context.length > 120 ? "…" : ""}
                                </p>
                              )}
                            </div>
                          ))}

                          {(page.url_nikud || page.url_explain) && (
                            <div className="flex gap-4 px-3 py-1.5 bg-gray-50/60 border-t border-[#D4C3A3]/30">
                              {page.url_nikud && (
                                <a
                                  href={page.url_nikud}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] text-[#C4A35A] font-bold uppercase tracking-wide hover:underline"
                                >
                                  ↗ Texte vocalisé
                                </a>
                              )}
                              {page.url_explain && (
                                <a
                                  href={page.url_explain}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] text-[#C4A35A] font-bold uppercase tracking-wide hover:underline"
                                >
                                  ↗ Explication
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
