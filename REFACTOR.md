# Goal
## Standards
- No component file should exceed 200-300 lines of code.
- Pure logic goes in `utils.ts`, types in `types.ts`, constants in `constants.ts`.
- JSX rendering helpers (functions returning JSX but not full components) go in `components/renderers.tsx`.
- Each UI panel/section should be its own component in `src/components/`.

## Architecture

```
src/
├── App.tsx                      (272 lines) — main layout, state, processing logic
├── constants.ts                 (131 lines) — config values, filter options, default objects
├── types.ts                     (99 lines)  — all TypeScript interfaces
├── utils.ts                     (390 lines) — pure logic helpers (no JSX)
├── utils.test.ts                (310 lines) — unit tests for utils.ts
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
- Created `src/utils.test.ts` with 53 tests covering:
  - `splitVisualClusters`
  - `normalizeKeyInputs`
  - `getExactMatchFlag`
  - `flattenOccurrences`
  - `entryMatchesFilters`
  - `normalizeAiVerification`
  - `coerceBoolean`
  - `matchesTextFilter`
  - `hasSameDisplayedNikkud`
  - `extractDictionaryNikkudWord`
  - `countCorrectionChanges`
  - `getStatusSortRank`
  - `getManualStatusSortRank`
  - `getTrialTone`
  - `getEffectiveModelUsed`
  - `rowsToCSV`
- Added `vitest` as dev dependency and `"test": "vitest --run"` script.

## Next steps (suggested)

### Step 7 — Extract processing logic from App.tsx
App.tsx still contains the `handleStartProcess` async worker logic (~80 lines). This could be extracted into a custom hook `useProcessingQueue.ts` in a `src/hooks/` folder, bringing App.tsx down to ~200 lines and making the processing logic independently testable.

### Step 8 — Extract sort logic into a custom hook
The `sortedResults` useMemo and `handleSort` could become `useSortedResults.ts`, further simplifying App.tsx.

## Tests
- `utils.ts` contains pure functions that are good candidates for unit tests.
- Priority test targets: `splitVisualClusters`, `entryMatchesFilters`, `normalizeKeyInputs`, `getExactMatchFlag`, `flattenOccurrences`.
- All priority targets now have tests (53 tests, all passing).

# Questions
## 11/05/2026
### Question 1
I see that the code is one file of about 2000 lines of code. It is a little too much. I don't think any component should be more than 200-300 lines of code. So find one thing (for the moment) that you can put in a different component, and split it. I think that you can also make types files and contants files. Pay attention that the website should work exactly the same. If this is a utils file that you do, write tests files as needed. Pay attention to have a good architecture of the project, and well structured in the files. The write me the next thing you think you can split to a component.
Update the REFACTOR.md file as needed.

### Question 2
Continue the refactoring. `WordDetailPanel.tsx` is still 514 lines — split it into smaller components (OccurrenceCard, ManualReviewSection, AiResultSection, OccurrenceList, etc.) so that no file exceeds 200-300 lines. Then do the same for `App.tsx` (extract the verification table and the controls panel). The website must work exactly the same after each split. Write unit tests for `utils.ts` pure functions. Update this REFACTOR.md file as you go, and write the next thing you think should be split.

### Next question
Continue the refactoring. Extract the `handleStartProcess` async worker logic from `App.tsx` into a custom hook `src/hooks/useProcessingQueue.ts`, and the sort/filter logic (`sortedResults` useMemo + `handleSort`) into `src/hooks/useSortedResults.ts`. This should bring `App.tsx` down to ~150 lines of pure layout composition. Then look at `utils.ts` (390 lines) — if it exceeds 300 lines, split it into logical groups (e.g. `src/utils/hebrew.ts`, `src/utils/filters.ts`, `src/utils/api-keys.ts`) with a barrel `src/utils/index.ts` re-exporting everything so existing imports don't break. The website must work exactly the same after each step. Add unit tests for any new module. Update this REFACTOR.md file as you go (mark steps done, update the architecture diagram, and write the next thing you think should be split).