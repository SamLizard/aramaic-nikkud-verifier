# Goal
## Standards
- No component file should exceed 200-300 lines of code.
- Pure logic goes in `utils.ts`, types in `types.ts`, constants in `constants.ts`.
- JSX rendering helpers (functions returning JSX but not full components) go in `components/renderers.tsx`.
- Each UI panel/section should be its own component in `src/components/`.

## Architecture

```
src/
├── App.tsx                      (822 lines) — main layout, table, controls, processing logic
├── constants.ts                 (131 lines) — config values, filter options, default objects
├── types.ts                     (99 lines)  — all TypeScript interfaces
├── utils.ts                     (390 lines) — pure logic helpers (no JSX)
├── lib/
│   └── groq.ts                  — AI verification API calls
├── components/
│   ├── WordDetailPanel.tsx      (514 lines) — detail panel for selected word
│   └── renderers.tsx            (133 lines) — JSX rendering helpers (compared word, occurrence context)
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

## Next steps (suggested)

### Step 3 — Split WordDetailPanel further
`WordDetailPanel.tsx` is still 514 lines. It can be split into:
- `OccurrenceCard.tsx` — already defined inline, can be its own file (~60 lines)
- `ManualReviewSection.tsx` — the manual status buttons + textarea (~60 lines)
- `AiResultSection.tsx` — the AI verdict grid + notes + pages_same_meaning (~100 lines)
- `TrialHistorySection.tsx` — the AI trials accordion (~40 lines)
- `OccurrenceList.tsx` — the grouped/ungrouped occurrence rendering (~120 lines)

### Step 4 — Extract table as its own component
App.tsx is still 822 lines. The verification table (headers + filter row + body rows) could become `VerificationTable.tsx` (~300 lines), bringing App.tsx down to ~500 lines.

### Step 5 — Extract ControlsPanel
The API keys + import/actions + progress + stats section could become `ControlsPanel.tsx` (~150 lines).

## Tests
- `utils.ts` contains pure functions that are good candidates for unit tests.
- Priority test targets: `splitVisualClusters`, `entryMatchesFilters`, `normalizeKeyInputs`, `getExactMatchFlag`, `flattenOccurrences`.

# Questions
## 11/05/2026
### Question 1
I see that the code is one file of about 2000 lines of code. It is a little too much. I don't think any component should be more than 200-300 lines of code. So find one thing (for the moment) that you can put in a different component, and split it. I think that you can also make types files and contants files. Pay attention that the website should work exactly the same. If this is a utils file that you do, write tests files as needed. Pay attention to have a good architecture of the project, and well structured in the files. The write me the next thing you think you can split to a component.
Update the REFACTOR.md file as needed.

### Next question
Continue the refactoring. `WordDetailPanel.tsx` is still 514 lines — split it into smaller components (OccurrenceCard, ManualReviewSection, AiResultSection, OccurrenceList, etc.) so that no file exceeds 200-300 lines. Then do the same for `App.tsx` (extract the verification table and the controls panel). The website must work exactly the same after each split. Write unit tests for `utils.ts` pure functions. Update this REFACTOR.md file as you go, and write the next thing you think should be split.
