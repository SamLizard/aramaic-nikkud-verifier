import React from "react";
import { motion } from "motion/react";
import {
  FileUp, Download, Play, Square, Key, Eye, EyeOff, FileJson,
} from "lucide-react";

interface ControlsPanelProps {
  apiKeyInputs: string[];
  showKeys: boolean;
  processing: boolean;
  progress: number;
  statusMsg: string;
  doneN: number;
  corrN: number;
  hasResults: boolean;
  keyGroupsLength: number;
  onApiKeyChange: (index: number, value: string) => void;
  onToggleShowKeys: () => void;
  onLoadFile: () => void;
  onStartOrStop: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
}

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  apiKeyInputs,
  showKeys,
  processing,
  progress,
  statusMsg,
  doneN,
  corrN,
  hasResults,
  keyGroupsLength,
  onApiKeyChange,
  onToggleShowKeys,
  onLoadFile,
  onStartOrStop,
  onExportCSV,
  onExportJSON,
}) => {
  return (
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
                onChange={(e) => onApiKeyChange(index, e.target.value)}
                className="w-full pr-8 py-2 px-3 rounded border border-[#D4C3A3] text-xs font-mono bg-white focus:outline-none focus:border-[#C4A35A]"
              />
              {index === 0 && (
                <button
                  onClick={onToggleShowKeys}
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
            2 clés par mot. {keyGroupsLength} file(s) parallèle(s).
          </p>
        </div>
      </section>

      <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-4 shadow-sm space-y-3">
        <h2 className="font-serif text-sm font-bold flex items-center gap-2 text-[#8B5E3C]">
          <FileUp className="w-3.5 h-3.5" /> Importation & Actions
        </h2>
        <button
          onClick={onLoadFile}
          className="w-full py-2 bg-[#E8D5A8] hover:bg-[#D4BC80] border border-[#C4A35A] rounded text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 text-[#5C3D1E]"
        >
          <FileJson className="w-3.5 h-3.5" /> Charger JSON
        </button>
        <button
          onClick={onStartOrStop}
          disabled={!processing && !hasResults}
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
        {hasResults && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExportCSV}
              className="py-2 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[10px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"
            >
              <Download className="w-3 h-3" /> CSV
            </button>
            <button
              onClick={onExportJSON}
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
  );
};

export default ControlsPanel;
