import React from "react";
import type { AIVerificationTrial } from "../types";
import { normalizeTrials, getTrialTone } from "../utils";

interface TrialHistorySectionProps {
  trials?: AIVerificationTrial[];
}

const TrialHistorySection: React.FC<TrialHistorySectionProps> = ({ trials }) => {
  const normalizedTrials = normalizeTrials(trials);

  if (normalizedTrials.length === 0) return null;

  return (
    <div className="px-4 pb-4">
      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
        <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C]">
          Historique des essais IA
        </h4>
        {normalizedTrials.map((trial, index) => (
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
  );
};

export default TrialHistorySection;
