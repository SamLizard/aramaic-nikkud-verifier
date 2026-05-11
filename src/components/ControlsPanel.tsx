import React from "react";
import { motion } from "motion/react";
import {
  FileUp, Download, Play, Square, Key, Eye, EyeOff, FileJson,
} from "lucide-react";

interface ControlsPanelProps {
  layout: "vertical" | "horizontal";
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
  layout,
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
  const isVertical = layout === "vertical";

  return (
    <div
      className={
        isVertical
          ? "flex flex-col gap-4"
          : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
      }
    >
      {/* API Keys */}
      <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-3 shadow-sm">
        <h2 className="font-serif text-xs font-bold mb-2 flex items-center gap-2 text-[#8B5E3C]">
          <Key className="w-3 h-3" /> Clés API Groq
        </h2>
        <div className="space-y-1.5">
          {apiKeyInputs.map((apiKey, index) => (
            <div key={index} className="relative">
              <input
                type={showKeys ? "text" : "password"}
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => onApiKeyChange(index, e.target.value)}
                className="w-full pr-7 py-1.5 px-2 rounded border border-[#D4C3A3] text-[10px] font-mono bg-white focus:outline-none focus:border-[#C4A35A]"
              />
              {index === 0 && (
                <button
                  onClick={onToggleShowKeys}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                >
                  {showKeys ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          ))}
          <p className="text-[8px] opacity-40">
            2 clés par mot. {keyGroupsLength} file(s).
          </p>
        </div>
      </section>

      {/* Actions */}
      <section className="bg-white/40 border border-[#C4A35A]/30 rounded-lg p-3 shadow-sm space-y-2">
        <h2 className="font-serif text-xs font-bold flex items-center gap-2 text-[#8B5E3C]">
          <FileUp className="w-3 h-3" /> Actions
        </h2>
        <button
          onClick={onLoadFile}
          className="w-full py-1.5 bg-[#E8D5A8] hover:bg-[#D4BC80] border border-[#C4A35A] rounded text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 text-[#5C3D1E]"
        >
          <FileJson className="w-3 h-3" /> Charger JSON
        </button>
        <button
          onClick={onStartOrStop}
          disabled={!processing && !hasResults}
          className={`w-full py-2 rounded font-serif text-xs font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-sm ${
            processing
              ? "bg-red-900 hover:bg-red-800 text-white"
              : "bg-[#1F130B] hover:bg-[#3D2616] text-[#FDFBF7]"
          }`}
        >
          {processing ? (
            <>
              <Square className="w-3.5 h-3.5" /> Arrêter
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" /> Lancer
            </>
          )}
        </button>
        {hasResults && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onExportCSV}
              className="py-1.5 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[9px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"
            >
              <Download className="w-3 h-3" /> CSV
            </button>
            <button
              onClick={onExportJSON}
              className="py-1.5 bg-white border border-[#1F130B] text-[#1F130B] rounded text-[9px] font-bold hover:bg-gray-50 flex items-center justify-center gap-1"
            >
              <Download className="w-3 h-3" /> JSON
            </button>
          </div>
        )}
      </section>

      {/* Progress */}
      {processing && (
        <div className="bg-[#1F130B] text-white p-3 rounded-lg flex flex-col justify-center">
          <div className="flex justify-between text-[9px] mb-1 uppercase font-bold">
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
        <div className={`grid ${isVertical ? "grid-cols-3" : "grid-cols-3"} gap-1.5 text-center text-[9px]`}>
          <div className="bg-white border border-[#D4C3A3] rounded p-1.5">
            <div className="font-bold text-sm">{doneN}</div>
            <div className="opacity-40 uppercase font-bold">Analysés</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded p-1.5">
            <div className="font-bold text-sm text-green-700">{corrN}</div>
            <div className="opacity-40 uppercase font-bold">OK</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-1.5">
            <div className="font-bold text-sm text-red-700">{doneN - corrN}</div>
            <div className="opacity-40 uppercase font-bold">Fix</div>
          </div>
        </div>
      )}

      {/* Status message */}
      {statusMsg && (
        <div className={`p-2 bg-[#F6F1E6] rounded text-[9px] italic border-l-4 border-[#C4A35A] leading-relaxed ${!isVertical ? "md:col-span-2 lg:col-span-4" : ""}`}>
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export default ControlsPanel;
