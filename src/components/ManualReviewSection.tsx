import React from "react";
import type { WordEntry } from "../types";
import { MANUAL_STATUS_OPTIONS } from "../constants";
import { normalizeAiVerification, getManualStatusOption } from "../utils";

interface ManualReviewSectionProps {
  word: WordEntry;
  onUpdate: (updater: (entry: WordEntry) => WordEntry) => void;
}

const ManualReviewSection: React.FC<ManualReviewSectionProps> = ({ word, onUpdate }) => {
  const manualStatus = getManualStatusOption(word.manual_status);

  return (
    <div className="p-4 pb-0">
      <div className="bg-white border border-[#D4C3A3] p-3 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[9px] font-black uppercase tracking-widest text-[#8B5E3C]">
            Revue manuelle
          </h4>
          {manualStatus ? (
            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${manualStatus.className}`}>
              {manualStatus.label}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {MANUAL_STATUS_OPTIONS.map((option) => {
            const isActive = word.manual_status === option.value;
            return (
              <button
                key={option.value}
                onClick={() =>
                  onUpdate((entry) => ({
                    ...entry,
                    manual_status: entry.manual_status === option.value ? null : option.value,
                  }))
                }
                className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${
                  option.className
                } ${isActive ? "ring-2 ring-offset-1 ring-[#8B5E3C]/25" : "opacity-75"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() =>
            onUpdate((entry) => ({
              ...entry,
              ai_verification: {
                ...normalizeAiVerification(entry.ai_verification),
                needs_ai_rerun: !normalizeAiVerification(entry.ai_verification).needs_ai_rerun,
              },
            }))
          }
          className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase w-fit ${
            word.ai_verification.needs_ai_rerun
              ? "bg-blue-100 text-blue-800 border-blue-200"
              : "bg-white text-[#8B5E3C] border-[#D4C3A3]"
          }`}
        >
          {word.ai_verification.needs_ai_rerun
            ? "Relance IA activée"
            : "Marquer pour relance IA"}
        </button>
        <textarea
          value={word.manual_note || ""}
          onChange={(e) =>
            onUpdate((entry) => ({
              ...entry,
              manual_note: e.target.value,
            }))
          }
          placeholder="Note libre pour cette entrée…"
          rows={4}
          className="w-full py-2 px-3 rounded border border-[#D4C3A3] text-base leading-relaxed bg-[#FDFBF7] focus:outline-none focus:border-[#C4A35A] resize-y"
        />
      </div>
    </div>
  );
};

export default ManualReviewSection;
