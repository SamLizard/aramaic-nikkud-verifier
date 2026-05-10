# Questions
## 07/05/2026
### Question 1 ✅ Done (10/05/2026)
There are few bugs, and UI improvements I need.
Bugs:
- When there is a "..." word, the resources display it with "...". It should display regularly the text that is between, and put each word with it own highlight.
- The nikkud ressource is displaying few words before & after the word, but this is not happening in the explanations. So we are just seeing words that are a lot before, and sometimes we see the real word at the end. I want it to start displaying from the first bold word that is displayed in the nikkud, until the last bold word that is displayed in the nikkud. So do in the script to fix json a possibility to fix explanations, and make the regular script directly generate it in the new way.

Features:
- The explanations are not enough understandable when I read them from the front. I think the text should be displayed exactly like it is in website. So the python script should put in the json the explanation in a way that the web will be able to display it in the same way as the real website.
- I would like a possibility to filter rows, by the column header.
- I would like to be able to export only the rows that are displayed (by the filter).
- I don't like the UI of the panel when I am in computer. Maybe you can use 100% of the screen, so the regular table is still displayed with the same size, and the panel is taking the same part at right, but without bluring the whole screen. So I can see both at the same time.
- In the panel, I would like the french explanation of the word to be a little bit bigger, and the words in the comment and in the dictionary to also be bigger (if possible).

**Implementation notes:**
- Python `prepare_json_last_claude_v5.py` now emits per-occurrence `words`, `full_context_tokens`, `matched_positions` for Gemara and `full_context_tokens` (with per-token bold flag) for Steinsaltz. The Steinsaltz context is anchored between the first and last bold token in the neighbourhood (with small padding), so the matched word is always visible.
- Python `patch_json.py` gained a new `--mode fix-explanations` that re-fetches each vt=5 page and rewrites the Steinsaltz context with the new shape, and upgrades legacy Gemara occurrences in place (the `…` goes away without refetching Gemara pages).
- Frontend `src/App.tsx`: ellipsis entries are now rendered word-by-word via `matched_positions`; Steinsaltz context is rendered with bold highlighting like daf-yomi.com.
- Frontend table now has a per-column filter row (text inputs for free-text columns, selects for status/manual/exact) with a clear-filters × button.
- CSV/JSON exports now emit only the currently visible (filtered + sorted) rows.
- On `lg+` screens the detail panel is docked to the right without blurring the rest of the page (main content gets `lg:pr-[640px]` padding); on smaller screens the blurred overlay is preserved.
- French meaning in the panel header bumped to `text-sm`, dictionary/manual-note/AI-notes bumped to `text-base`.

## 10/05/2026
### Question 2
Thanks. Could you just do the front without the margins between the table and the panel, and the left part and the right border. I don't need it, and I don't like the table to be shrinked.
Also, the correction IA filter should be like no correction, correction but 0 changes, 1 change, 2 changes ect...