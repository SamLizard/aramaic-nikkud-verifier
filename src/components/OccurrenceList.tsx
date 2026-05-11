import React from "react";
import { BookOpen } from "lucide-react";
import type { WordEntry, DisplayOccurrence } from "../types";
import { hasSameDisplayedNikkud, flattenOccurrences, extractDictionaryNikkudWord } from "../utils";
import OccurrenceCard from "./OccurrenceCard";

interface OccurrenceGroup {
  key: string;
  title: string;
  dictionaryMatch: boolean;
  occurrences: DisplayOccurrence[];
}

interface OccurrenceListProps {
  word: WordEntry;
}

const OccurrenceList: React.FC<OccurrenceListProps> = ({ word }) => {
  const dictionaryNikkudWord = extractDictionaryNikkudWord(word);
  const occurrences = flattenOccurrences(word);

  const shouldGroupOccurrences = Boolean(
    word.ai_verification.nikkud_correct === false &&
    word.ai_verification.corrected_nikkud_word
  );

  const occurrenceGroups: OccurrenceGroup[] = shouldGroupOccurrences
    ? [
        {
          key: "mine",
          title: "Comme mon nikkud",
          dictionaryMatch: dictionaryNikkudWord
            ? hasSameDisplayedNikkud(word.word_with_nikkud, dictionaryNikkudWord)
            : false,
          occurrences: occurrences.filter((occ) =>
            hasSameDisplayedNikkud(occ.gemaraWord, word.word_with_nikkud)
          ),
        },
        {
          key: "ai",
          title: "Comme la correction IA",
          dictionaryMatch: dictionaryNikkudWord
            ? hasSameDisplayedNikkud(
                word.ai_verification.corrected_nikkud_word || "",
                dictionaryNikkudWord
              )
            : false,
          occurrences: occurrences.filter((occ) =>
            hasSameDisplayedNikkud(
              occ.gemaraWord,
              word.ai_verification.corrected_nikkud_word || ""
            )
          ),
        },
        {
          key: "other",
          title: "Autres nikkudim",
          dictionaryMatch: false,
          occurrences: occurrences.filter(
            (occ) =>
              !hasSameDisplayedNikkud(occ.gemaraWord, word.word_with_nikkud) &&
              !hasSameDisplayedNikkud(
                occ.gemaraWord,
                word.ai_verification.corrected_nikkud_word || ""
              )
          ),
        },
      ]
    : [];

  return (
    <div className="p-4 pt-0">
      <header className="border-b-2 border-[#1F130B]/10 pb-2 flex justify-between items-center mb-3">
        <h4 className="font-serif text-base text-[#1F130B]">
          Sources Guemara ({occurrences.length})
        </h4>
        <BookOpen className="w-4 h-4 opacity-10" />
      </header>

      {occurrences.length === 0 ? (
        <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-xl italic text-[11px] text-gray-400">
          Aucune source trouvée.
        </div>
      ) : shouldGroupOccurrences ? (
        <div className="space-y-4">
          {occurrenceGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h5 className="font-serif text-sm text-[#1F130B]">
                    {group.title}
                  </h5>
                  {group.dictionaryMatch && dictionaryNikkudWord ? (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 font-bold">
                      {dictionaryNikkudWord}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] uppercase font-bold opacity-40">
                  {group.occurrences.length} ressource(s)
                </span>
              </div>

              {group.occurrences.length === 0 ? (
                <div className="py-4 text-center border border-dashed border-[#D4C3A3] rounded-lg italic text-[11px] text-gray-400 bg-white">
                  Aucune occurrence dans cette catégorie.
                </div>
              ) : (
                <div className="space-y-3">
                  {group.occurrences.map((occurrence, occurrenceIndex) => (
                    <OccurrenceCard
                      key={`${group.key}-${occurrence.pageLabel}-${occurrenceIndex}`}
                      occurrence={occurrence}
                      dictionaryNikkudWord={dictionaryNikkudWord}
                      baseWord={word.base_consonants}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {occurrences.map((occurrence, occurrenceIndex) => (
            <OccurrenceCard
              key={`${occurrence.pageLabel}-${occurrenceIndex}`}
              occurrence={occurrence}
              dictionaryNikkudWord={dictionaryNikkudWord}
              baseWord={word.base_consonants}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default OccurrenceList;
