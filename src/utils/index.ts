// Barrel re-export — keeps all existing `import { … } from "./utils"` working.

export { rowsToCSV, wait } from "./general";

export {
  normalizeTrials,
  normalizeAiVerification,
  coerceBoolean,
  getImportedNeedsAiRerun,
  normalizeImportedEntry,
  prepareWordEntryForExport,
  getImportedStatus,
  isEntryAlreadyAnalyzed,
  getExactMatchFlag,
  getStatusSortRank,
  getManualStatusSortRank,
  getEffectiveModelUsed,
  getTrialTone,
} from "./status";

export {
  normalizeKeyInputs,
  getUsableApiKeys,
  groupKeysByWord,
} from "./api-keys";

export {
  getStatusFilterValue,
  getExactFilterValue,
  getCorrectionFilterValue,
  getEditedFilterValue,
  matchesTextFilter,
  getManualStatusOption,
  entryMatchesFilters,
} from "./filters";

export {
  splitVisualClusters,
  countCorrectionChanges,
  normalizeDisplayedHebrew,
  extractDictionaryNikkudWord,
  hasSameDisplayedNikkud,
} from "./hebrew";

export { flattenOccurrences } from "./occurrences";

export {
  hasManualWordEdit,
  getOriginalWord,
  normalizeManualWordEdit,
  applyManualWordEdit,
  revertManualWordEdit,
  acknowledgeManualWordEdit,
  getManualWordEditSortRank,
  isAiVerdictOutdated,
  getAiVerdictWord,
} from "./manual-word-edit";
