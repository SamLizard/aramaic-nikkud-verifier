import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, FileUp, Download, Play, Info, CheckCircle2, XCircle, Search, BookOpen, Layers, FileJson, X, Terminal } from "lucide-react";
import { verifyWithGemini, generatePrompt } from "./lib/gemini";
import { WordEntry } from "./types";

function rowsToCSV(rows: any[]) {
  if (!rows.length) return "";
  const allKeys = Object.keys(rows[0]);
  const escape = (v: any) => (String(v ?? "").includes(",") ? `"${v}"` : String(v ?? ""));
  return [allKeys.join(","), ...rows.map((r) => allKeys.map((k) => escape(r[k])).join(","))].join("\n");
}

export default function App() {
  const [results, setResults] = useState<WordEntry[]>([]);
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
        const json = JSON.parse(ev.target?.result as string) as WordEntry[];
        setResults(json.map(entry => ({ ...entry, _status: "pending" })));
        setStatusMsg("Fichier JSON chargé avec succès.");
      } catch (err) {
        alert("Erreur de lecture JSON.");
      }
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleStartProcess = async () => {
    if (results.length === 0) return;
    setProcessing(true);
    abortRef.current = false;
    setProgress(0);
    const total = results.length;
    
    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      setResults(prev => prev.map((r, k) => k === i ? { ...r, _status: "processing" } : r));
      try {
        const currentEntry = resultsRef.current[i];
        const res = await verifyWithGemini(currentEntry);
        setResults(prev => prev.map((r, k) => k === i ? { 
          ...r, 
          _status: "done", 
          ai_verification: { ...r.ai_verification, ...res } 
        } : r));
      } catch (err) {
        console.error(`Error processing word ${i}:`, err);
        setResults(prev => prev.map((r, k) => k === i ? { ...r, _status: "error" } : r));
      }
      setProgress(Math.round(((i + 1) / total) * 100));
      setStatusMsg(`Analyse en cours: ${i + 1} / ${total}`);
    }
    setProcessing(false);
    setStatusMsg(abortRef.current ? "Arrêté." : "Analyse terminée.");
  };

  const handleExportCSV = () => {
    const csvRows = results.map(r => ({
      "Mot (Nikkud)": r.word_with_nikkud,
      "Sens (Attendu)": r.french_meaning,
      "Correct?": r.ai_verification.nikkud_correct === true ? "✓" : r.ai_verification.nikkud_correct === false ? "✗" : "?",
      "Correction": r.ai_verification.corrected_nikkud_word || "-",
      "Notes": r.ai_verification.notes || ""
    }));
    const csv = rowsToCSV(csvRows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nikkud_report.csv`;
    a.click();
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(results.map(({ _status, ...rest }: any) => rest), null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nikkud_enriched.json`;
    a.click();
  };

  const selectedWord = selectedWordIdx !== null ? results[selectedWordIdx] : null;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D1B0E] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10 border-b-2 border-[#D4C3A3] pb-6">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#1F130B] mb-2 tracking-tight">מאגר ניקוד ארמי</h1>
          <p className="text-lg text-[#5C3D1E] font-medium opacity-80 uppercase tracking-widest text-xs">Vérificateur de Vocalisation IA</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-5 shadow-sm">
              <h2 className="font-serif text-lg font-bold mb-3 flex items-center gap-2 text-[#8B5E3C]"><FileUp className="w-4 h-4" /> Importation</h2>
              <button onClick={() => fileRef.current?.click()} className="w-full py-3 bg-[#E8D5A8] hover:bg-[#D4BC80] text-xs border border-[#C4A35A] rounded font-bold uppercase transition-all mb-4 flex items-center justify-center gap-2 shadow-sm">
                <FileJson className="w-4 h-4" /> Charger JSON
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".json" />
              <button 
                 onClick={handleStartProcess} 
                 disabled={processing || results.length === 0} 
                 className="w-full py-4 bg-[#1F130B] hover:bg-[#3D2616] text-[#FDFBF7] rounded font-serif text-lg font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md"
              >
                {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />} Lancer l'Analyse
              </button>
            </section>

            {results.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleExportCSV} className="py-2 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[10px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"><Download className="w-3 h-3" /> CSV</button>
                <button onClick={handleExportJSON} className="py-2 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[10px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"><Download className="w-3 h-3" /> JSON</button>
              </div>
            )}

            {processing && (
              <div className="bg-[#1F130B] text-white p-4 rounded-lg">
                <div className="flex justify-between text-[10px] mb-1 uppercase font-bold">
                  <span>Analyse...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#3D2616] rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#C4A35A]" animate={{ width: `${progress}%` }} />
                </div>
                <button onClick={() => abortRef.current = true} className="w-full mt-3 text-[9px] bg-red-900/80 hover:bg-red-800 py-1 rounded transition-colors uppercase font-bold">Arrêter</button>
              </div>
            )}
            {statusMsg && <div className="p-3 bg-[#F6F1E6] rounded text-[10px] italic border-l-4 border-[#C4A35A]">{statusMsg}</div>}
          </div>

          <div className="lg:col-span-9">
            <div className="bg-white border border-[#D4C3A3] rounded-lg shadow-sm overflow-hidden flex flex-col h-[70vh]">
              <div className="bg-[#1F130B] p-4 text-[#FDFBF7] flex justify-between items-center shrink-0">
                <span className="flex items-center gap-2 font-serif"><Layers className="w-4 h-4 text-[#C4A35A]" /> Table de Vérification</span>
                <span className="text-[10px] opacity-50 uppercase tracking-widest">{results.length} Mots</span>
              </div>
              <div className="overflow-auto flex-grow">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 bg-[#F6F1E6] z-10">
                    <tr className="border-b border-[#D4C3A3] text-[9px] font-bold text-[#8B5E3C] uppercase text-center">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3 w-40 font-serif">Original</th>
                      <th className="p-3 w-40">Sens</th>
                      <th className="p-3 w-20">Statut</th>
                      <th className="p-3 w-40">Détails</th>
                      <th className="p-3 w-40">Fix IA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4C3A3]/20">
                    {results.map((res, i) => (
                      <tr key={i} onClick={() => setSelectedWordIdx(i)} className={`cursor-pointer hover:bg-[#FDFBF7] transition-colors ${selectedWordIdx === i ? 'bg-[#F6F1E6]' : ''}`}>
                        <td className="p-4 text-center text-[10px] font-bold opacity-30">{i + 1}</td>
                        <td className="p-4 text-right font-serif text-2xl" dir="rtl">{res.word_with_nikkud}</td>
                        <td className="p-4 text-[11px] truncate">{res.french_meaning}</td>
                        <td className="p-4 text-center">
                          {res._status === "done" ? (
                            res.ai_verification.nikkud_correct ? <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" /> : <XCircle className="w-5 h-5 text-red-700 mx-auto" />
                          ) : res._status === "processing" ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#C4A35A]" /> : res._status === "error" ? "!" : "·"}
                        </td>
                        <td className="p-4 text-[9px]">{res.dictionary.suggestions[0]?.slice(0,25)}...</td>
                        <td className="p-4 text-right font-serif text-xl text-green-800" dir="rtl">{res.ai_verification.corrected_nikkud_word || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedWord && (
          <div className="fixed inset-0 z-50 pointer-events-none">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedWordIdx(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" />
            <motion.div 
              key="details-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-[90vw] lg:w-[70vw] bg-white border-l-2 border-[#1F130B] shadow-2xl pointer-events-auto flex flex-col"
            >
              <div className="bg-[#1F130B] text-white p-6 shrink-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                     <Layers className="w-4 h-4 text-[#C4A35A]" />
                     <span className="text-[10px] font-black tracking-widest uppercase">Expertise Linquistique</span>
                  </div>
                  <button onClick={() => setSelectedWordIdx(null)} className="p-1 hover:bg-white/10 rounded transition-colors text-white"><X className="w-6 h-6" /></button>
                </div>
                <div className="flex justify-between items-baseline gap-4 mb-2">
                  <p className="text-sm opacity-60 italic shrink-0">« {selectedWord.french_meaning} »</p>
                  <h3 className="font-serif text-3xl font-bold text-right" dir="rtl">{selectedWord.word_with_nikkud}</h3>
                </div>
                <div className="flex gap-3 mt-4">
                  <a href={selectedWord.dictionary.dict_url} target="_blank" rel="noreferrer" className="flex-1 py-3 bg-[#C4A35A] hover:bg-[#B3934A] text-white text-[11px] font-black rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-widest">
                    <Search className="w-3 h-3" /> Dictionnaire
                  </a>
                  <button onClick={() => setShowPrompt(!showPrompt)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white text-[11px] font-black rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-widest">
                    <Terminal className="w-3 h-3" /> {showPrompt ? "Cacher Prompt" : "Voir Prompt"}
                  </button>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto p-8 space-y-12 bg-[#FDFBF7]">
                {showPrompt && (
                  <div className="bg-gray-900 text-green-400 p-6 rounded-xl text-[11px] font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                    {generatePrompt(selectedWord)}
                  </div>
                )}

                {selectedWord._status === "done" && (
                  <section className="space-y-6">
                     <div className={`p-6 rounded-xl border-2 ${selectedWord.ai_verification.nikkud_correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} shadow-sm relative overflow-hidden`}>
                        <div className="flex justify-between items-center mb-4">
                           <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                             {selectedWord.ai_verification.nikkud_correct ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-700" />} Verdict IA
                           </h4>
                        </div>
                        <div className="font-serif text-3xl text-right mb-2" dir="rtl">
                          {selectedWord.ai_verification.nikkud_correct ? selectedWord.word_with_nikkud : selectedWord.ai_verification.corrected_nikkud_word}
                        </div>
                     </div>
                     <div className="bg-white border border-[#D4C3A3] p-6 rounded-xl shadow-sm">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 text-[#8B5E3C] border-b border-[#D4C3A3] pb-2"><Info className="w-4 h-4" /> Analyse Détaillée</h4>
                        <p className="text-base leading-relaxed text-[#2D1B0E] font-medium text-right" dir="rtl">{selectedWord.ai_verification.notes}</p>
                     </div>
                  </section>
                )}

                <section className="space-y-6">
                  <header className="border-b-2 border-[#1F130B]/10 pb-2 flex justify-between items-center">
                    <h4 className="font-serif text-xl text-[#1F130B]">Sources Gemara</h4>
                    <BookOpen className="w-5 h-5 opacity-10" />
                  </header>
                  {selectedWord.gemara_pages.length === 0 ? (
                    <div className="py-12 text-center bg-gray-50 border-2 border-dashed rounded-xl border-gray-100 italic text-[11px] text-gray-400">Aucune source trouvée.</div>
                  ) : (
                    selectedWord.gemara_pages.map((page, pIdx) => (
                      <div key={pIdx} className="space-y-4">
                        <div className="flex justify-between items-center bg-[#F6F1E6] p-3 rounded-lg border border-[#D4C3A3]/40">
                           <h5 className="font-serif text-lg font-bold" dir="rtl">{page.label}</h5>
                        </div>
                        {page.occurrences.map((occ, oIdx) => (
                          <div key={oIdx} className="bg-white border text-right font-serif text-xl leading-relaxed text-[#1F130B] p-4 rounded-lg shadow-sm" dir="rtl">
                             {occ.gemara.before.slice(-10).join(' ')} <span className="text-[#8B5E3C] font-black px-1.5 bg-amber-50 rounded border border-amber-200">{occ.gemara.word.replace(/…/g, ' ')}</span> {occ.gemara.after.slice(0,10).join(' ')}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
