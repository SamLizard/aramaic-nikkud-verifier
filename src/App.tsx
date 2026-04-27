import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2, FileUp, Download, Play, Square, Info, CheckCircle2,
  XCircle, Search, BookOpen, Layers, FileJson, X, Key, Eye, EyeOff,
} from "lucide-react";
import { verifyWithGemini, generatePrompt, isRateLimitError } from "./lib/gemini";
import { WordEntry } from "./types";

const DELAY_BETWEEN_WORDS_MS = 4500;
const RATE_LIMIT_BUFFER_MS = 1200;
const MAX_RATE_LIMIT_RETRIES_PER_WORD = 8;
const EMPTY_AI_VERIFICATION = {
  nikkud_correct: null,
  corrected_nikkud_word: null,
  notes: "",
  pages_same_meaning: [],
};

const rowsToCSV = (rows: any[]) => {
  if (!rows.length) return "";
  const allKeys = Object.keys(rows[0]);
  const escape = (v: any) =>
    String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "");
  return [
    allKeys.join(","),
    ...rows.map((r) => allKeys.map((k) => escape(r[k])).join(",")),
  ].join("\n");
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getImportedStatus = (entry: WordEntry): WordEntry["_status"] => {
  const verification = entry.ai_verification;
  if (!verification) {
    return "pending";
  }

  const hasVerdict = verification.nikkud_correct !== null;
  const hasCorrection = Boolean(verification.corrected_nikkud_word);
  const hasNotes = Boolean(verification.notes?.trim());
  const hasPages = (verification.pages_same_meaning || []).length > 0;

  return hasVerdict || hasCorrection || hasNotes || hasPages ? "done" : "pending";
};

const isEntryAlreadyAnalyzed = (entry: WordEntry): boolean =>
  getImportedStatus(entry) === "done";

const App = () => {
  const [results, setResults] = useState<WordEntry[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const resultsRef = useRef<WordEntry[]>([]);
  resultsRef.current = results;

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
            ai_verification: entry.ai_verification || EMPTY_AI_VERIFICATION,
            _status: getImportedStatus(entry),
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
    if (!apiKey.trim()) {
      setStatusMsg("⚠️ Entrez votre clé API Gemini d'abord.");
      return;
    }

    const entriesToProcess = resultsRef.current.filter(
      (entry) => !isEntryAlreadyAnalyzed(entry)
    );

    if (entriesToProcess.length === 0) {
      setProgress(100);
      setStatusMsg("✓ Tous les mots de ce fichier ont déjà une analyse IA.");
      return;
    }

    setProcessing(true);
    abortRef.current = false;
    const total = entriesToProcess.length;
    let processedCount = 0;

    for (let i = 0; i < resultsRef.current.length; i++) {
      if (abortRef.current) break;
      if (isEntryAlreadyAnalyzed(resultsRef.current[i])) {
        continue;
      }

      setResults((prev) =>
        prev.map((r, k) => (k === i ? { ...r, _status: "processing" } : r))
      );
      let currentWordDone = false;
      let rateLimitRetries = 0;

      while (!currentWordDone && !abortRef.current) {
        setStatusMsg(
          `${processedCount + 1}/${total} — ${resultsRef.current[i]?.word_with_nikkud}`
        );
        try {
          const currentEntry = resultsRef.current[i];
          const res = await verifyWithGemini(currentEntry, apiKey.trim());
          setResults((prev) =>
            prev.map((r, k) =>
              k === i
                ? { ...r, _status: "done", ai_verification: { ...r.ai_verification, ...res } }
                : r
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
              `Quota Gemini atteinte. Pause ${Math.ceil(waitMs / 1000)}s avant reprise (${processedCount + 1}/${total}).`
            );
            await wait(waitMs);
            continue;
          }

          console.error(`Error processing word ${i}:`, err);
          setStatusMsg(`❌ ${err.message}`);
          setResults((prev) =>
            prev.map((r, k) => (k === i ? { ...r, _status: "error" } : r))
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
    setProcessing(false);
    setStatusMsg(abortRef.current ? "Analyse interrompue." : "✓ Analyse terminée.");
  };

  const handleExportCSV = () => {
    const csvRows = results.map((r) => ({
      "Mot (Nikkud)": r.word_with_nikkud,
      "Sens (Attendu)": r.french_meaning,
      "Correct?":
        r.ai_verification.nikkud_correct === true
          ? "✓"
          : r.ai_verification.nikkud_correct === false
          ? "✗"
          : "?",
      Correction: r.ai_verification.corrected_nikkud_word || "-",
      Notes: r.ai_verification.notes || "",
    }));
    const csv = rowsToCSV(csvRows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nikkud_rapport.csv`;
    a.click();
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(
      results.map(({ _status, ...rest }: any) => rest),
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nikkud_enrichi.json`;
    a.click();
  };

  const selectedWord = selectedWordIdx !== null ? results[selectedWordIdx] : null;
  const doneN = results.filter((e) => e._status === "done").length;
  const corrN = results.filter(
    (e) => e._status === "done" && e.ai_verification?.nikkud_correct === true
  ).length;
  const errN = results.filter((e) => e._status === "error").length;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D1B0E] font-sans">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* ── Header ── */}
        <header className="text-center mb-8 border-b-2 border-[#D4C3A3] pb-6">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#1F130B] mb-1 tracking-tight">
            מאגר ניקוד ארמי
          </h1>
          <p className="text-xs text-[#5C3D1E] font-bold opacity-50 uppercase tracking-widest">
            Vérificateur de Vocalisation IA
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── Left sidebar ── */}
          <div className="lg:col-span-3 space-y-5">
            {/* API Key */}
            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-5 shadow-sm">
              <h2 className="font-serif text-sm font-bold mb-3 flex items-center gap-2 text-[#8B5E3C]">
                <Key className="w-3.5 h-3.5" /> Clé API Gemini
              </h2>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="AIza..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full pr-8 py-2 px-3 rounded border border-[#D4C3A3] text-xs font-mono bg-white focus:outline-none focus:border-[#C4A35A]"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                >
                  {showKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[9px] opacity-35 mt-1.5">
                Votre clé n'est envoyée qu'à Google.
              </p>
            </section>

            {/* File + Launch */}
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

            {/* Export */}
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

            {/* Progress */}
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

            {/* Stats */}
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

          {/* ── Table ── */}
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
                        <th className="p-3 w-40">Mot (Nikkud)</th>
                        <th className="p-3">Sens français</th>
                        <th className="p-3 w-16 text-center">Statut</th>
                        <th className="p-3 w-36">Correction IA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D4C3A3]/20">
                      {results.map((res, i) => (
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
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {selectedWord && (
          <div className="fixed inset-0 z-50 pointer-events-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWordIdx(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />
            {/* Panel */}
            <motion.div
              key="details-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-[90vw] lg:w-[480px] bg-white border-l-2 border-[#1F130B] shadow-2xl pointer-events-auto flex flex-col"
            >
              {/* Panel header */}
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
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors uppercase tracking-widest"
                  >
                    {showPrompt ? "Masquer Prompt" : "Voir Prompt"}
                  </button>
                </div>
              </div>

              {/* Panel body */}
              <div className="flex-grow overflow-y-auto bg-[#FDFBF7]">
                {showPrompt && (
                  <pre className="m-4 p-4 bg-gray-900 text-green-400 text-[10px] font-mono whitespace-pre-wrap leading-relaxed rounded-lg shadow-inner">
                    {generatePrompt(selectedWord)}
                  </pre>
                )}

                {/* AI result */}
                {selectedWord._status === "done" && (
                  <div className="p-4 space-y-3">
                    {/* Verdict + Correction: 2 columns */}
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
                        <div className="font-serif text-xl text-right" dir="rtl">
                          {selectedWord.word_with_nikkud}
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
                            <div
                              className="font-serif text-xl text-right font-bold text-green-800"
                              dir="rtl"
                            >
                              {selectedWord.ai_verification.corrected_nikkud_word}
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

                    {/* Notes */}
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

                    {/* Pages same meaning */}
                    {(selectedWord.ai_verification as any).pages_same_meaning?.length > 0 && (
                      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg">
                        <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 text-[#8B5E3C]">
                          <BookOpen className="w-3 h-3" /> Même sens —{" "}
                          {(selectedWord.ai_verification as any).pages_same_meaning.length} page(s)
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {(selectedWord.ai_verification as any).pages_same_meaning.map(
                            (p: string, i: number) => (
                              <span
                                key={i}
                                className="text-xs px-2.5 py-0.5 rounded-full bg-[#F6F1E6] border border-[#D4C3A3] font-serif"
                                dir="rtl"
                              >
                                {p}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedWord._status === "error" && (
                  <div className="m-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                    Erreur lors de l'analyse. Relancez l'analyse pour réessayer.
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

                {/* Gemara sources */}
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
                          {/* Page header */}
                          <div className="flex justify-between items-center bg-[#F6F1E6] px-3 py-2 border-b border-[#D4C3A3]/40">
                            <span className="text-[8px] opacity-35 font-bold uppercase">
                              {page.occurrences.length} occ.
                            </span>
                            <h5 className="font-serif text-sm font-bold" dir="rtl">
                              {page.label}
                            </h5>
                          </div>

                          {/* Occurrences */}
                          {page.occurrences.map((occ, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-3 py-2.5 ${
                                oIdx < page.occurrences.length - 1
                                  ? "border-b border-[#D4C3A3]/30"
                                  : ""
                              }`}
                            >
                              {/* Gemara text — display as-is from JSON, no ellipsis stripping */}
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
                              {/* Steinsaltz */}
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

                          {/* Links */}
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
