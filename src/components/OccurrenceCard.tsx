import React from "react";
import type { DisplayOccurrence } from "../types";
import { hasSameDisplayedNikkud } from "../utils";
import { renderOccurrenceContext, renderSteinsaltzContext } from "./renderers";

interface OccurrenceCardProps {
  occurrence: DisplayOccurrence;
  dictionaryNikkudWord: string | null;
}

const OccurrenceCard: React.FC<OccurrenceCardProps> = ({ occurrence, dictionaryNikkudWord }) => (
  <div className="border border-[#D4C3A3] rounded-lg overflow-hidden bg-white">
    <div className="flex justify-between items-center bg-[#F6F1E6] px-3 py-2 border-b border-[#D4C3A3]/40">
      <div className="flex items-center gap-2">
        <span className="text-[8px] opacity-35 font-bold uppercase">
          occ. {occurrence.occurrenceIndex + 1}
        </span>
        {dictionaryNikkudWord &&
        hasSameDisplayedNikkud(occurrence.gemaraWord, dictionaryNikkudWord) ? (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 font-bold">
            {dictionaryNikkudWord}
          </span>
        ) : null}
      </div>
      <h5 className="font-serif text-sm font-bold" dir="rtl">
        {occurrence.pageLabel}
      </h5>
    </div>

    <div className="px-3 py-2.5">
      <p className="text-right font-serif text-lg leading-loose" dir="rtl">
        {renderOccurrenceContext(occurrence)}
      </p>
      {(occurrence.steinsaltzContext ||
        occurrence.steinsaltzContextTokens.length > 0) && (
        <p
          className="text-right font-serif text-sm text-gray-600 mt-2 leading-relaxed border-t border-dashed border-[#D4C3A3]/40 pt-2"
          dir="rtl"
        >
          {renderSteinsaltzContext(occurrence)}
        </p>
      )}
    </div>

    {(occurrence.urlNikud || occurrence.urlExplain) && (
      <div className="flex gap-4 px-3 py-1.5 bg-gray-50/60 border-t border-[#D4C3A3]/30">
        {occurrence.urlNikud && (
          <a
            href={occurrence.urlNikud}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-[#C4A35A] font-bold uppercase tracking-wide hover:underline"
          >
            ↗ Texte vocalisé
          </a>
        )}
        {occurrence.urlExplain && (
          <a
            href={occurrence.urlExplain}
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
);

export default OccurrenceCard;
