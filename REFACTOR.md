# Goal
## Standards
- No component file should exceed 200-300 lines of code.
- Pure logic goes in `utils/`, types in `types.ts`, constants in `constants.ts`.
- JSX rendering helpers (functions returning JSX but not full components) go in `components/renderers.tsx`.
- Each UI panel/section should be its own component in `src/components/`.
- Custom hooks live in `src/hooks/`.

## Architecture

```
src/
├── App.tsx                      (152 lines) — layout composition only
├── constants.ts                 (112 lines) — config values, filter options, default objects
├── types.ts                     (92 lines)  — all TypeScript interfaces
├── utils/
│   ├── index.ts                 (36 lines)  — barrel re-export (keeps imports unchanged)
│   ├── general.ts               (17 lines)  — rowsToCSV, wait
│   ├── status.ts                (107 lines) — AI verification normalization, sort ranks, status helpers
│   ├── hebrew.ts                (67 lines)  — splitVisualClusters, countCorrectionChanges, normalize/extract
│   ├── filters.ts               (70 lines)  — entryMatchesFilters, filter value extractors
│   ├── api-keys.ts              (28 lines)  — normalizeKeyInputs, getUsableApiKeys, groupKeysByWord
│   └── occurrences.ts           (41 lines)  — flattenOccurrences
├── utils.test.ts                (607 lines) — 85 unit tests for all utils modules
├── hooks/
│   ├── useProcessingQueue.ts    (173 lines) — async AI processing worker logic
│   ├── useSortedResults.ts      (85 lines)  — sort + filter state & memoized computation
│   ├── useExport.ts             (55 lines)  — handleExportCSV, handleExportJSON
│   └── useFileImport.ts         (60 lines)  — handleFile (JSON import)
├── lib/
│   └── groq/
│       ├── index.ts             (260 lines) — verifyWithGroq + tryModel orchestration, barrel re-exports
│       ├── errors.ts            (103 lines) — error classes + helpers (isRateLimitError, extractVerificationErrorDetails, createFailureDetails)
│       ├── prompt.ts            (50 lines)  — generatePrompt, generateFallbackPrompt
│       ├── request.ts           (121 lines) — requestVerification, parseApiErrorMessage, parseRetryAfterMs, isRecoverableStatus, isPrimaryJsonValidationFailure
│       └── parse.ts             (73 lines)  — parseVerificationResponse, normalizeSurfaceWithoutNikkud, hasSameSurfaceWithoutNikkud, buildNotes
├── components/
│   ├── WordDetailPanel.tsx      (101 lines) — detail panel shell, composes sub-components
│   ├── OccurrenceCard.tsx       (67 lines)  — single Gemara occurrence card
│   ├── OccurrenceList.tsx       (128 lines) — grouped/ungrouped occurrence rendering
│   ├── ManualReviewSection.tsx  (81 lines)  — manual status buttons + textarea
│   ├── AiResultSection.tsx      (121 lines) — AI verdict grid + notes + pages_same_meaning
│   ├── TrialHistorySection.tsx  (35 lines)  — AI trials accordion
│   ├── VerificationTable.tsx    (290 lines) — table headers + filter row + body rows
│   ├── ControlsPanel.tsx        (159 lines) — API keys + import/actions + progress + stats
│   └── renderers.tsx            (123 lines) — JSX rendering helpers
└── main.tsx                     (9 lines)   — entry point
```

## Completed refactoring steps

### Step 1 — Extract utility functions & types (done)
- Moved all pure logic functions from App.tsx to `utils.ts`.
- Moved `DisplayOccurrence` interface to `types.ts`.
- Moved `flattenOccurrences` to `utils.ts`.

### Step 2 — Extract WordDetailPanel component (done)
- Created `src/components/WordDetailPanel.tsx` — the full detail/expertise panel.
- Created `src/components/renderers.tsx` — JSX rendering helpers (`renderComparedWord`, `renderOccurrenceContext`, `renderSteinsaltzContext`).
- Removed ~1000 lines of duplicate code from App.tsx.
- App.tsx reduced from ~1857 lines to 822 lines.

### Step 3 — Split WordDetailPanel into sub-components (done)
- Extracted `OccurrenceCard.tsx` — a single Gemara occurrence card (~72 lines).
- Extracted `ManualReviewSection.tsx` — manual status buttons + textarea (~80 lines).
- Extracted `AiResultSection.tsx` — AI verdict grid + notes + pages_same_meaning (~130 lines).
- Extracted `TrialHistorySection.tsx` — AI trials accordion (~47 lines).
- Extracted `OccurrenceList.tsx` — grouped/ungrouped occurrence rendering (~120 lines).
- `WordDetailPanel.tsx` reduced from 514 lines to 105 lines.

### Step 4 — Extract VerificationTable component (done)
- Created `src/components/VerificationTable.tsx` (~230 lines) — table headers, filter row, body rows.
- App.tsx reduced from 822 lines to ~272 lines.

### Step 5 — Extract ControlsPanel component (done)
- Created `src/components/ControlsPanel.tsx` (~145 lines) — API keys, import/actions, progress bar, stats.
- App.tsx now only contains state management, processing logic, and layout composition.

### Step 6 — Unit tests for utils.ts (done)
- Created `src/utils.test.ts` with 53 tests covering all pure functions.
- Added `vitest` as dev dependency and `"test": "vitest --run"` script.

### Step 7 — Extract processing logic from App.tsx (done)
- Created `src/hooks/useProcessingQueue.ts` (~140 lines) — the `handleStartProcess` async worker logic, progress/status state, abort control.
- App.tsx no longer contains any async processing logic.

### Step 8 — Extract sort/filter logic into a custom hook (done)
- Created `src/hooks/useSortedResults.ts` (~90 lines) — `sortedResults` useMemo, `handleSort`, filter state.
- App.tsx reduced from ~272 lines to ~150 lines of pure layout composition.

### Step 9 — Split utils.ts into logical modules (done)
- Deleted monolithic `src/utils.ts` (390 lines).
- Created `src/utils/` directory with:
  - `general.ts` — `rowsToCSV`, `wait`
  - `status.ts` — AI verification normalization, sort ranks, status helpers
  - `hebrew.ts` — `splitVisualClusters`, `countCorrectionChanges`, Hebrew text normalization
  - `filters.ts` — `entryMatchesFilters`, filter value extractors
  - `api-keys.ts` — `normalizeKeyInputs`, `getUsableApiKeys`, `groupKeysByWord`
  - `occurrences.ts` — `flattenOccurrences`
  - `index.ts` — barrel re-export (all existing imports unchanged)
- Added 32 new unit tests (total: 85 tests, all passing).

### Step 10 — Extract export/import logic from App.tsx (done)
- Created `src/hooks/useExport.ts` (55 lines) — `handleExportCSV`, `handleExportJSON`.
- Created `src/hooks/useFileImport.ts` (60 lines) — `handleFile` JSON import logic.
- App.tsx reduced to 152 lines of pure layout composition with zero business logic.

### Step 11 — Split groq.ts into smaller modules (done)
- Deleted monolithic `src/lib/groq.ts` (637 lines).
- Created `src/lib/groq/` directory with:
  - `errors.ts` (103 lines) — `GroqRequestError`, `GroqRateLimitError`, `GroqInvalidJsonError`, `GroqAllKeysFailedError`, `isRateLimitError`, `extractVerificationErrorDetails`, `createFailureDetails`.
  - `prompt.ts` (50 lines) — `generatePrompt`, `generateFallbackPrompt`.
  - `request.ts` (121 lines) — `requestVerification`, `parseApiErrorMessage`, `parseRetryAfterMs`, `isRecoverableStatus`, `isPrimaryJsonValidationFailure`.
  - `parse.ts` (73 lines) — `parseVerificationResponse`, `normalizeSurfaceWithoutNikkud`, `hasSameSurfaceWithoutNikkud`, `buildNotes`.
  - `index.ts` (260 lines) — barrel re-exports + `verifyWithGroq` and `tryModel` orchestration logic.
- All existing imports (`from "../lib/groq"`) continue to work unchanged.
- No file exceeds 300 lines.

### Step 12 — Final cleanup (done)
- Verified no source file in `src/` exceeds 300 lines (largest: `VerificationTable.tsx` at 290).
- `npm run lint` — passes (0 errors).
- `npm test` — 85 tests pass.
- `npm run build` — production build succeeds.
- Architecture diagram updated.

## Tests
- `src/utils.test.ts` — 85 tests covering all pure utility functions across all modules.
- All tests pass: `npm test` → 85 passed.

## Refactoring complete ✓

All 12 steps have been completed. The codebase is now well-structured with:
- No source file exceeding 300 lines
- Clear separation of concerns (utils, hooks, components, lib)
- App.tsx is 152 lines of pure layout composition
- All business logic extracted into dedicated hooks and utility modules
- The `lib/groq/` module cleanly separated into errors, prompt, request, parse, and orchestration
