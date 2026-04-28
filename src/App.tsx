import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2, FileUp, Download, Play, Square, Info, CheckCircle2,
  XCircle, Search, BookOpen, Layers, FileJson, X, Key, Eye, EyeOff,
} from "lucide-react";
import {
  verifyWithGroq,
  generatePrompt,
  isRateLimitError,
  extractVerificationErrorDetails,
} from "./lib/groq";
import { AIVerification, WordEntry } from "./types";

const DELAY_BETWEEN_WORDS_MS = 600;
const RATE_LIMIT_BUFFER_MS = 1200;
const MAX_RATE_LIMIT_RETRIES_PER_WORD = 8;
const KEY_GROUP_SIZE = 2;
const HEBREW_MARK_REGEX = /[\u0591-\u05C7]/;
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
    ...rows.map((r) => allKeys.map((k) => escape(r[k])).join(",")),
  ].join("\n");
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAiVerification = (
  verification?: Partial<AIVerification> | null
): AIVerification => ({
  ...EMPTY_AI_VERIFICATION,
  ...verification,
  pages_same_meaning: Array.isArray(verification?.pages_same_meaning)
    ? verification?.pages_same_meaning
    : [],
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

const parseApiKeys = (value: string): string[] =>
  value
    .split(/[\n,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

const maskApiKeys = (value: string): string =>
  parseApiKeys(value)
    .map((key) => `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`)
    .join("\n");

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

const App = () => {
  const [results, setResults] = useState<WordEntry[]>([]);
  const [apiKeysText, setApiKeysText] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const resultsRef = useRef<WordEntry[]>([]);
  resultsRef.current = results;

  const parsedApiKeys = parseApiKeys(apiKeysText);
  const keyGroups = groupKeysByWord(parsedApiKeys);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const list: WordEntry[] = Array.isArray(raw) ? raw : [raw];
        setResults(
          list.map((entry) => ({
            ...entry,
            ai_verification: normalizeAiVerification(entry.ai_verification),
            _status: getImportedStatus({
              ...entry,
              ai_verification: normalizeAiVerification(entry.ai_verification),
            }),
          }))
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

  const handleStartProcess = async () => {
    if (results.length === 0) return;
    if (parsedApiKeys.length === 0) {
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

  const handleExportCSV = () => {
    const csvRows = results.map((r) => ({
      "Mot (Nikkud)": r.word_with_nikkud,
      "Sens (Attendu)": r.french_meaning,
      Dictionnaire: r.dictionary?.meaning || "",
      "Correct?":
        r.ai_verification.nikkud_correct === true
          ? "✓"
          : r.ai_verification.nikkud_correct === false
          ? "✗"
          : "?",
      "Meme exact?":
        getExactMatchFlag(r) === null ? "-" : getExactMatchFlag(r) ? "true" : "false",
      Correction: r.ai_verification.corrected_nikkud_word || "-",
      Modele: r.ai_verification.model_used || "",
      Notes: r.ai_verification.notes || "",
    }));
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
    (entry) => entry._status === "done" && entry.ai_verification?.nikkud_correct === true
  ).length;
  const selectedExactMatch = selectedWord ? getExactMatchFlag(selectedWord) : null;
  const displayedKeysText = showKeys ? apiKeysText : maskApiKeys(apiKeysText);

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
                <textarea
                  value={displayedKeysText}
                  onChange={(e) => showKeys && setApiKeysText(e.target.value)}
                  readOnly={!showKeys}
                  placeholder={"gsk_...\ngsk_..."}
                  rows={Math.max(4, Math.min(8, parsedApiKeys.length || 4))}
                  className="w-full py-2 px-3 rounded border border-[#D4C3A3] text-xs font-mono bg-white focus:outline-none focus:border-[#C4A35A] resize-y"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] opacity-40">
                    2 clés par mot. {keyGroups.length} file(s) parallèle(s).
                  </p>
                  <button
                    onClick={() => setShowKeys((value) => !value)}
                    className="text-[10px] font-bold uppercase text-[#8B5E3C] flex items-center gap-1"
                  >
                    {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showKeys ? "Masquer" : "Afficher"}
                  </button>
                </div>
              </div>
              <p className="text-[9px] opacity-35 mt-1.5">
                Une clé par ligne ou séparée par des virgules.
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
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3 w-36">Mot (Nikkud)</th>
                        <th className="p-3 w-32">Dictionnaire</th>
                        <th className="p-3">Sens français</th>
                        <th className="p-3 w-16 text-center">Statut</th>
                        <th className="p-3 w-32 text-center">Même exact ?</th>
                        <th className="p-3 w-36">Correction IA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4C3A3]/20">
                      {results.map((res, i) => {
                        const exactMatchFlag = getExactMatchFlag(res);
                        return (
                          <tr
                            key={i}
                            onClick={() => setSelectedWordIdx(i)}
                            className={`cursor-pointer hover:bg-[#FDFBF7] transition-colors ${
                              selectedWordIdx === i ? "bg-[#F6F1E6]" : ""
                            }`}
                          >
                            <td className="p-3 text-center text-[10px] font-bold opacity-25">{i + 1}</td>
                            <td className="p-3 text-right font-serif text-2xl" dir="rtl">
                              {res.word_with_nikkud}
                            </td>
                            <td className="p-3 text-[10px] leading-relaxed opacity-65">
                              <div className="line-clamp-3">{res.dictionary?.meaning || "—"}</div>
                            </td>
                            <td className="p-3 text-[11px] truncate opacity-60">
                              {res.french_meaning}
                            </td>
                            <td className="p-3 text-center">
                              {res._status === "done" ? (
                                res.ai_verification.nikkud_correct ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-700 mx-auto" />
                                )
                              ) : res._status === "processing" ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#C4A35A]" />
                              ) : res._status === "error" ? (
                                <span className="text-orange-500 font-bold">!</span>
                              ) : (
                                <span className="inline-block w-2 h-2 rounded-full bg-[#D4C3A3]" />
                              )}
                            </td>
                            <td className="p-3 text-center text-[10px] font-bold">
                              {exactMatchFlag === null ? (
                                <span className="opacity-30">—</span>
                              ) : exactMatchFlag ? (
                                <span className="text-green-700">true</span>
                              ) : (
                                <span className="text-red-700">false</span>
                              )}
                            </td>
                            <td
                              className="p-3 text-right font-serif text-xl font-bold text-green-800"
                              dir="rtl"
                            >
                              {res._status === "done"
                                ? res.ai_verification.nikkud_correct
                                  ? <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
                                  : res.ai_verification.corrected_nikkud_word || "—"
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
              className="absolute right-0 top-0 h-full w-[92vw] lg:w-[560px] bg-white border-l-2 border-[#1F130B] shadow-2xl pointer-events-auto flex flex-col"
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
                      <span>Modèle utilisé : {selectedWord.ai_verification.model_used || "—"}</span>
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

                    {selectedWord.ai_verification.pages_same_meaning?.length > 0 && (
                      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
                        <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
                          <BookOpen className="w-3 h-3" /> Même sens —{" "}
                          {selectedWord.ai_verification.pages_same_meaning.length} page(s)
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedWord.ai_verification.pages_same_meaning.map((page, i) => (
                            <span
                              key={i}
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

                {selectedWord.ai_verification.failed_raw_ai_response && (
                  <div className="px-4 pb-4">
                    <div className="bg-[#FFF8E7] border border-amber-200 p-3 rounded-lg">
                      <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 text-[#8B5E3C]">
                        Réponse brute non JSON ({selectedWord.ai_verification.failed_raw_ai_model || "IA"})
                      </h4>
                      {selectedWord.ai_verification.failed_raw_ai_error && (
                        <p className="text-xs text-amber-800 mb-2">
                          {selectedWord.ai_verification.failed_raw_ai_error}
                        </p>
                      )}
                      <pre className="text-[10px] whitespace-pre-wrap break-words bg-white border border-amber-100 rounded p-3 font-mono text-[#5C3D1E]">
                        {selectedWord.ai_verification.failed_raw_ai_response}
                      </pre>
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
                      {selectedWord.gemara_pages.map((page, pIdx) => (
                        <div
                          key={pIdx}
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

                          {page.occurrences.map((occ, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-3 py-2.5 ${
                                oIdx < page.occurrences.length - 1
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
