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
├── App.tsx                      (150 lines) — layout composition only
├── constants.ts                 (131 lines) — config values, filter options, default objects
├── types.ts                     (99 lines)  — all TypeScript interfaces
├── utils/
│   ├── index.ts                 (40 lines)  — barrel re-export (keeps imports unchanged)
│   ├── general.ts               (20 lines)  — rowsToCSV, wait
│   ├── status.ts                (110 lines) — AI verification normalization, sort ranks, status helpers
│   ├── hebrew.ts                (75 lines)  — splitVisualClusters, countCorrectionChanges, normalize/extract
│   ├── filters.ts               (75 lines)  — entryMatchesFilters, filter value extractors
│   ├── api-keys.ts              (35 lines)  — normalizeKeyInputs, getUsableApiKeys, groupKeysByWord
│   └── occurrences.ts           (45 lines)  — flattenOccurrences
├── utils.test.ts                (450 lines) — 85 unit tests for all utils modules
├── hooks/
│   ├── useProcessingQueue.ts    (140 lines) — async AI processing worker logic
│   └── useSortedResults.ts      (90 lines)  — sort + filter state & memoized computation
├── lib/
│   └── groq.ts                  — AI verification API calls
├── components/
│   ├── WordDetailPanel.tsx      (105 lines) — detail panel shell, composes sub-components
│   ├── OccurrenceCard.tsx       (72 lines)  — single Gemara occurrence card
│   ├── OccurrenceList.tsx       (120 lines) — grouped/ungrouped occurrence rendering
│   ├── ManualReviewSection.tsx  (80 lines)  — manual status buttons + textarea
│   ├── AiResultSection.tsx      (130 lines) — AI verdict grid + notes + pages_same_meaning
│   ├── TrialHistorySection.tsx  (47 lines)  — AI trials accordion
│   ├── VerificationTable.tsx    (230 lines) — table headers + filter row + body rows
│   ├── ControlsPanel.tsx        (145 lines) — API keys + import/actions + progress + stats
│   └── renderers.tsx            (133 lines) — JSX rendering helpers
└── main.tsx                     — entry point
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

## Tests
- `src/utils.test.ts` — 85 tests covering all pure utility functions across all modules.
- All tests pass: `npm test` → 85 passed.

## Next steps (suggested)

### Step 10 — Extract export logic from App.tsx
`handleExportCSV` and `handleExportJSON` (~40 lines) could move into a `src/hooks/useExport.ts` hook or a `src/utils/export.ts` module, bringing App.tsx closer to ~120 lines of pure layout.

### Step 11 — Extract file import logic
The `handleFile` callback (~30 lines) could become a `useFileImport.ts` hook, making App.tsx purely a composition of hooks + JSX layout.

# Questions
## 11/05/2026
### Question 1
I see that the code is one file of about 2000 lines of code. It is a little too much. I don't think any component should be more than 200-300 lines of code. So find one thing (for the moment) that you can put in a different component, and split it. I think that you can also make types files and contants files. Pay attention that the website should work exactly the same. If this is a utils file that you do, write tests files as needed. Pay attention to have a good architecture of the project, and well structured in the files. The write me the next thing you think you can split to a component.
Update the REFACTOR.md file as needed.

### Question 2
Continue the refactoring. `WordDetailPanel.tsx` is still 514 lines — split it into smaller components (OccurrenceCard, ManualReviewSection, AiResultSection, OccurrenceList, etc.) so that no file exceeds 200-300 lines. Then do the same for `App.tsx` (extract the verification table and the controls panel). The website must work exactly the same after each split. Write unit tests for `utils.ts` pure functions. Update this REFACTOR.md file as you go, and write the next thing you think should be split.

### Question 3
Continue the refactoring. Extract the `handleStartProcess` async worker logic from `App.tsx` into a custom hook `src/hooks/useProcessingQueue.ts`, and the sort/filter logic (`sortedResults` useMemo + `handleSort`) into `src/hooks/useSortedResults.ts`. This should bring `App.tsx` down to ~150 lines of pure layout composition. Then look at `utils.ts` (390 lines) — if it exceeds 300 lines, split it into logical groups (e.g. `src/utils/hebrew.ts`, `src/utils/filters.ts`, `src/utils/api-keys.ts`) with a barrel `src/utils/index.ts` re-exporting everything so existing imports don't break. The website must work exactly the same after each step. Add unit tests for any new module. Update this REFACTOR.md file as you go (mark steps done, update the architecture diagram, and write the next thing you think should be split).

### Next question