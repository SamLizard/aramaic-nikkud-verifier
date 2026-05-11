import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { WordEntry } from "./types";
import { normalizeKeyInputs } from "./utils";
import { useProcessingQueue } from "./hooks/useProcessingQueue";
import { useSortedResults } from "./hooks/useSortedResults";
import { useExport } from "./hooks/useExport";
import { useFileImport } from "./hooks/useFileImport";
import VerificationTable from "./components/VerificationTable";
import ControlsPanel from "./components/ControlsPanel";
import WordDetailPanel from "./components/WordDetailPanel";

const App = () => {
  const [results, setResults] = useState<WordEntry[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<string[]>([""]);
  const [showKeys, setShowKeys] = useState(false);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const {
    processing,
    progress,
    statusMsg,
    setStatusMsg,
    keyGroups,
    handleStartProcess,
    handleStop,
  } = useProcessingQueue({ apiKeyInputs, results, setResults });

  const { sortedResults, filters, setFilters, handleSort } =
    useSortedResults(results);

  const { handleExportCSV, handleExportJSON } = useExport(sortedResults);

  const { handleFile } = useFileImport({
    setResults,
    setStatusMsg,
    setSelectedWordIdx,
  });

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

  const selectedWord =
    selectedWordIdx !== null ? results[selectedWordIdx] : null;
  const doneN = results.filter((entry) => entry._status === "done").length;
  const corrN = results.filter(
    (entry) =>
      entry._status === "done" && entry.ai_verification.nikkud_correct === true
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
            onStartOrStop={processing ? handleStop : handleStartProcess}
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
