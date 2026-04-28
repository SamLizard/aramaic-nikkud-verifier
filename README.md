# Aramaic Nikkud Verifier

Small review app for checking the vocalization of Aramaic words and expressions against:

- a target French meaning
- dictionary data
- real Gemara occurrences with nikkud and Steinsaltz context
- an AI verifier running through Groq

The goal is not to rewrite the Aramaic text itself. The verifier only checks whether the nikkud is correct for the intended meaning, and if needed suggests a corrected vocalization for the exact same underlying text.

## What the app does

- loads a JSON file of words/expressions to review
- sends entries to Groq for AI verification
- uses `openai/gpt-oss-120b` first
- falls back to `qwen/qwen3-32b` when the main model fails to return usable JSON
- supports multiple Groq API keys
- processes words in parallel by grouping keys two-by-two
- keeps AI trial history per row
- lets you manually review rows with:
  - `Good`
  - `To fix`
  - `Need more sources`
  - `To ask`
- stores manual notes in the exported JSON
- supports rerunning AI on selected rows with `needs_ai_rerun`

## Run locally

Prerequisites:

- Node.js 20+ recommended

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

This starts the local Express + Vite server on:

```text
http://localhost:3000
```

Useful scripts:

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Groq API keys

You enter Groq keys directly in the UI.

Behavior:

- one key per input field
- when one field is filled, a new empty one appears below it
- keys are grouped by 2
- each group handles 1 word at a time

Examples:

- 1 key -> 1 word at a time
- 2 keys -> 1 word at a time, with failover inside that pair
- 4 keys -> 2 words in parallel
- 6 keys -> 3 words in parallel

For each word:

1. try key 1 with `openai/gpt-oss-120b`
2. if that model fails to return valid JSON, try `qwen/qwen3-32b` on the same key
3. if the key fails with a recoverable API error, move to the second key of the pair

## Expected JSON format

The app expects either:

- an array of entries
- or a single entry object

Minimal real structure:

```json
[
  {
    "word_with_nikkud": "אוּרְתָא",
    "base_consonants": "אורתא",
    "french_meaning": "Le soir",
    "is_ellipsis_entry": false,
    "dictionary": {
      "query_used": "אורתא",
      "suggestions": ["אוּרְתָא"],
      "meaning": "אוּרְתָא - תְּחִילַת הַלַּיְלָה",
      "dict_url": "https://..."
    },
    "gemara_pages": [
      {
        "label": "ברכות ג ע\"א",
        "page_id": "2-5",
        "url_nikud": "https://...",
        "url_explain": "https://...",
        "occurrences": [
          {
            "gemara": {
              "word": "אוּרְתָּא",
              "before": ["רִאשׁוֹנָה", "סִימָנָא"],
              "after": ["הוּא", "אִי"],
              "full_context": "רִאשׁוֹנָה סִימָנָא לְמָה לִי אוּרְתָּא הוּא אִי..."
            },
            "steinsaltz": {
              "steinsaltz_pos": 0,
              "word_is_bold": false,
              "match_score": 0,
              "before": [],
              "after": [],
              "full_context": "..."
            }
          }
        ]
      }
    ],
    "ai_verification": {
      "nikkud_correct": null,
      "pages_same_meaning": [],
      "corrected_nikkud_word": null,
      "notes": ""
    }
  }
]
```

## Import / export behavior

Exported JSON keeps the working data you need to reopen the file later, including:

- `ai_verification`
- manual review status
- manual note
- AI trial history
- rerun flag

The local UI `_status` field is not exported.

### `needs_ai_rerun`

If an entry has:

```json
"ai_verification": {
  "needs_ai_rerun": true
}
```

then clicking `Lancer l'Analyse` will re-run AI for that row even if it already has an older AI result.

After a successful rerun, the app sets:

```json
"needs_ai_rerun": false
```

The app also tolerates legacy imported files where `needs_ai_rerun` may be present outside `ai_verification`.

## Review workflow

### Table

The table shows:

- word with nikkud
- dictionary meaning
- French target meaning
- AI status
- manual review status
- exact-match indicator between the original word and the AI correction
- AI correction

The table is sortable.

### Detail panel

Click a row to open the detail panel. It includes:

- dictionary info
- manual review controls
- free note field
- AI verdict
- AI correction
- grammar note
- pages judged to have the same meaning
- AI trial history with:
  - model tried
  - status
  - message
  - full raw response/message
- grouped Gemara resources when AI proposes a different nikkud:
  - `Comme mon nikkud`
  - `Comme la correction IA`
  - `Autres nikkudim`

If the dictionary definition contains a real vocalized headword, matching resource groups/occurrences get a green chip with that exact dictionary form.

## Manual review fields

Each row can store:

- `manual_status`
- `manual_note`

Allowed manual statuses:

- `good`
- `to_fix`
- `need_more_sources`
- `to_ask`

These values are persisted in the JSON export.

## AI trial history

Every AI run can store per-attempt history in `ai_verification.ai_trials`, including:

- model name
- status
- message
- raw response

This helps debug:

- invalid JSON
- API validation errors
- fallback behavior
- key failover behavior

## Notes about the AI contract

The prompt instructs the model to:

- preserve the exact Aramaic surface text
- only change nikkud / dagesh / related vocalization marks
- never shorten the expression
- never replace it with a lemma
- use the French meaning as the target sense
- use the Gemara sources only as evidence

The code also rejects AI corrections that change the underlying non-nikkud text.

## Project structure

Main files:

- [src/App.tsx](./src/App.tsx) - main UI
- [src/lib/groq.ts](./src/lib/groq.ts) - Groq client, fallback logic, AI parsing
- [src/types.ts](./src/types.ts) - shared types
- [server.ts](./server.ts) - local Express server + scraping endpoints

## Current limitations

- live Groq behavior still depends on your account/model access and quotas
- sorting is UI-side only
- AI quality is only as good as the source data and prompt constraints
- dictionary chip detection depends on the dictionary meaning containing a real vocalized headword

## Suggested workflow

1. Generate your JSON file.
2. Load it in the app.
3. Run AI analysis.
4. Manually review suspicious rows.
5. Mark some rows for rerun if needed.
6. Export JSON.
7. Reopen later and continue from where you stopped.
