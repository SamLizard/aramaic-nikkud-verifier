#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepare_json.py  —  Aramaic Nikkud Verifier — data preparation
==============================================================
Fetches daf-yomi.com data for every flashcard word and builds a JSON
file ready for AI nikkud-verification.

Key features:
  • Smart Gemara ↔ Steinsaltz matching by context overlap (not word identity)
  • Handles … / ... ellipsis-type entries (multi-part words)
  • Disk cache for fetched pages
  • Never overwrites existing output JSON (appends _2, _3, …)
  • Saves after every word — safe to Ctrl-C

Usage
-----
  pip install curl_cffi beautifulsoup4
  python prepare_json.py all_flashcards.csv
  python prepare_json.py all_flashcards.csv --limit 20
"""

import argparse
import csv
import json
import os
import re
import unicodedata
from urllib.parse import quote, quote_plus

from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup, NavigableString

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

BASE_URL  = "https://daf-yomi.com"
DAF_PAGE  = "DafYomi_Page.aspx"          # capital Y — matches server's actual URL
CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "X-Requested-With": "XMLHttpRequest",
}

# Hebrew Unicode ranges
_NIKKUD   = range(0x05B0, 0x05C8)
_CANTIL   = range(0x0591, 0x05B0)
_PUNC_HEB = range(0x05C1, 0x05C3)

# Gemara text container selectors, tried in order
_TEXT_SELECTORS = [
    "#PageText",                          # nikkud pages (vt=3/4)
    "#ContentPlaceHolderMain_divText",    # Steinsaltz pages (vt=5)
    "div[id*='Text']",
    "#textDiv", "#TextDiv",
    ".daf-text", ".page-text",
]

# ──────────────────────────────────────────────────────────────────────────────
# Text utilities
# ──────────────────────────────────────────────────────────────────────────────

def strip_nikkud(text: str) -> str:
    """Remove nikkud, cantillation, and all combining diacritics."""
    out = []
    for ch in text:
        cp = ord(ch)
        if cp in _NIKKUD or cp in _CANTIL or cp in _PUNC_HEB:
            continue
        if unicodedata.category(ch) == "Mn":
            continue
        out.append(ch)
    return "".join(out).strip()


def hebrew_only(text: str) -> str:
    """Keep only Hebrew letter characters (strip punctuation, etc.)."""
    return "".join(
        c for c in strip_nikkud(text)
        if "\u05D0" <= c <= "\u05EA" or "\uFB1D" <= c <= "\uFB4E"
    )


_HEB_TOKEN = re.compile(
    r"[\u05D0-\u05EA\uFB1D-\uFB4E]"
    r"[\u0591-\u05C7\u05D0-\u05EA\uFB1D-\uFB4E\"']*"
)


def tokenize_hebrew(text: str) -> list[str]:
    return _HEB_TOKEN.findall(text)


def get_query_parts(word: str) -> list[str]:
    """
    Split flashcard word into consonant search tokens.
      "אַדְּהָכִי וְהָכִי"  →  ['אדהכי', 'והכי']
      "אֶחָד… וְאֶחָד"    →  ['אחד', 'ואחד']
    Handles both Unicode … (U+2026) and ASCII ...
    """
    clean = word.replace("\u2026", " ").replace("...", " ")
    return [hebrew_only(p) for p in clean.split() if hebrew_only(p)]


def is_ellipsis_word(word: str) -> bool:
    return "\u2026" in word or "..." in word


def token_contains(token_base: str, part: str) -> bool:
    """
    Fuzzy match: does the token's consonant base contain `part`,
    or does `part` contain the token?
    This handles Steinsaltz augmenting a Gemara word with extra letters.
    """
    return part in token_base or token_base in part


# ──────────────────────────────────────────────────────────────────────────────
# File naming
# ──────────────────────────────────────────────────────────────────────────────

def get_next_filename(base_path: str) -> str:
    if not os.path.exists(base_path):
        return base_path
    name, ext = os.path.splitext(base_path)
    counter = 2
    while os.path.exists(f"{name}_{counter}{ext}"):
        counter += 1
    return f"{name}_{counter}{ext}"


# ──────────────────────────────────────────────────────────────────────────────
# HTTP session
# ──────────────────────────────────────────────────────────────────────────────

SESSION = curl_requests.Session(impersonate="chrome")
SESSION.headers.update(HEADERS)


def warm_up():
    try:
        print("Warming up session cookies...")
        SESSION.get("https://daf-yomi.com/", timeout=15)
    except Exception as e:
        print(f"  Warning: warm-up failed: {e}")


def get_cached(url: str, cache_key: str = None) -> str:
    """GET with disk cache. Always decodes as UTF-8 explicitly."""
    if cache_key:
        path = os.path.join(CACHE_DIR, f"{cache_key}.html")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return f.read()
    try:
        r = SESSION.get(url, timeout=20)
        if r.status_code != 200:
            print(f"    HTTP {r.status_code}: {url}")
            return ""
        html = r.content.decode("utf-8", errors="replace")
        if cache_key:
            with open(path, "w", encoding="utf-8") as f:
                f.write(html)
        return html
    except Exception as e:
        print(f"    Request error: {e}")
        return ""


# ──────────────────────────────────────────────────────────────────────────────
# Page text extraction
# ──────────────────────────────────────────────────────────────────────────────

def extract_main_element(soup: BeautifulSoup):
    """Return the DOM element containing the main Gemara text."""
    for sel in _TEXT_SELECTORS:
        el = soup.select_one(sel)
        if el and re.search(r"[\u05D0-\u05EA]", el.get_text(strip=True)):
            return el
    return soup.find("body") or soup


def build_tagged_tokens(html: str) -> list[dict]:
    """
    Parse a page's HTML and return a list of
    {"t": token_with_nikkud, "b": is_bold, "base": consonants_only}
    for every Hebrew word token in the main text element.
    """
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    el   = extract_main_element(soup)
    tagged: list[dict] = []

    def _walk(node, bold: bool = False):
        if isinstance(node, NavigableString):
            for m in _HEB_TOKEN.finditer(str(node)):
                tagged.append({
                    "t":    m.group(),
                    "b":    bold,
                    "base": hebrew_only(m.group()),
                })
        else:
            is_b = bold or node.name in ("b", "strong")
            for child in node.children:
                _walk(child, is_b)

    _walk(el)
    return tagged


# ──────────────────────────────────────────────────────────────────────────────
# Gemara occurrence finding  (nikkud page)
# ──────────────────────────────────────────────────────────────────────────────

def find_gemara_occurrences(
    tagged: list[dict],
    parts: list[str],
    window: int = 25,
    context_size: int = 20,
) -> list[dict]:
    """
    Find every occurrence of `parts` (in order, within `window` tokens)
    in the Gemara nikkud page token list.

    Returns list of:
      {
        "matched_indices": [i, j, ...],   # absolute positions of each part
        "word":     "אַדְּהָכִי … וְהָכִי",
        "before":   [...10 tokens...],    # with nikkud
        "after":    [...10 tokens...],    # with nikkud
        "before_bases": [...],            # consonants only, for scoring
        "after_bases":  [...],
        "full_context": "..."
      }
    """
    tokens = [t["t"] for t in tagged]
    results = []

    for i in range(len(tokens)):
        if strip_nikkud(tokens[i]) != parts[0]:
            continue
        matched = [i]
        cur = i
        ok  = True
        for p in parts[1:]:
            found = False
            for j in range(cur + 1, min(len(tokens), cur + window + 1)):
                if strip_nikkud(tokens[j]) == p:
                    matched.append(j); cur = j; found = True; break
            if not found:
                ok = False; break
        if not ok:
            continue

        start = max(0, matched[0] - context_size)
        end   = min(len(tokens), matched[-1] + context_size + 1)

        before_tokens = tokens[start : matched[0]]
        after_tokens  = tokens[matched[-1] + 1 : end]

        # Use a simple space when parts are consecutive (gap = len(parts)-1).
        # Only use ' … ' when there are actual words between the parts (ellipsis entries).
        is_consecutive = (matched[-1] - matched[0] == len(parts) - 1)
        word_display   = (
            " ".join(tokens[m] for m in matched)
            if is_consecutive
            else " … ".join(tokens[m] for m in matched)
        )

        results.append({
            "matched_indices": matched,
            "word":         word_display,
            "before":       before_tokens,
            "after":        after_tokens,
            "before_bases": [hebrew_only(t) for t in before_tokens],
            "after_bases":  [hebrew_only(t) for t in after_tokens],
            "full_context": " ".join(tokens[start:end]),
        })

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Steinsaltz matching (context-based, tolerant of augmented/split bold words)
# ──────────────────────────────────────────────────────────────────────────────

def score_steinsaltz_candidate(
    tagged:  list[dict],
    pos:     int,
    before_bases: list[str],
    after_bases:  list[str],
    window:  int = 25,
) -> float:
    """
    Score how well position `pos` in the Steinsaltz token list matches
    a Gemara occurrence with the given before/after context.

    Scoring rationale (verified experimentally):
    • The Gemara text that comes AFTER the matched word continues as BOLD
      tokens in Steinsaltz — this is the strongest signal (weight 3).
    • The Gemara text BEFORE the word may appear in bold or plain depending
      on whether it is being quoted or paraphrased — weaker signal (weight 1).
    • Non-bold matches in the after window still help disambiguate (weight 1).
    """
    before_window = tagged[max(0, pos - window) : pos]
    after_window  = tagged[pos : min(len(tagged), pos + window)]

    before_bases_set   = {t["base"] for t in before_window}
    after_bold_set     = {t["base"] for t in after_window if t["b"]}
    after_any_set      = {t["base"] for t in after_window}

    score = 0.0
    score += sum(1 for b in before_bases if b and b in before_bases_set)
    score += sum(3 for a in after_bases  if a and a in after_bold_set)
    score += sum(1 for a in after_bases  if a and a in after_any_set
                                           and a not in after_bold_set)
    return score


def find_steinsaltz_candidates(
    tagged: list[dict],
    parts:  list[str],
) -> list[int]:
    """
    Return all positions in `tagged` where the first part of the search
    word plausibly appears (exact OR partial consonant match, bold OR plain).

    Rationale: Steinsaltz sometimes
      • augments a bold Gemara word with extra letters
      • splits a Gemara word across two bold spans
      • leaves the word itself plain and bolds the surrounding clause
    So we cast a wide net and let context scoring pick the winner.
    """
    first_part = parts[0]
    candidates = []
    for i, tok in enumerate(tagged):
        base = tok["base"]
        if not base:
            continue
        # Exact match OR one is a substring of the other (augmented/partial)
        if first_part in base or base in first_part:
            candidates.append(i)
    return candidates


def match_steinsaltz_to_gemara(
    stein_tagged: list[dict],
    gemara_occurrences: list[dict],
    parts: list[str],
    context_size: int = 20,
) -> list[dict]:
    """
    For each Gemara occurrence, find the best matching position in the
    Steinsaltz token list, then extract the enriched context.

    Uses a greedy 1-to-1 matching: best score first, then each Steinsaltz
    position can only be assigned to one Gemara occurrence.

    Returns a list (same length as gemara_occurrences) of dicts:
      {
        "steinsaltz_pos": int,           # index in stein_tagged
        "word_is_bold":   bool,
        "match_score":    float,
        "before":         [...],         # tokens before in Steinsaltz
        "after":          [...],         # tokens after in Steinsaltz
        "full_context":   "..."
      }
      or None if no match found.
    """
    if not gemara_occurrences:
        return []

    # Build candidate pool once
    candidate_positions = find_steinsaltz_candidates(stein_tagged, parts)

    # Score every (gemara_occurrence, candidate_position) pair
    scored = []
    for g_idx, gocc in enumerate(gemara_occurrences):
        for pos in candidate_positions:
            score = score_steinsaltz_candidate(
                stein_tagged, pos,
                gocc["before_bases"],
                gocc["after_bases"],
            )
            if score > 0:
                scored.append((score, g_idx, pos))

    # Sort by score descending — greedy assignment
    scored.sort(key=lambda x: -x[0])

    assigned_gemara   = set()
    assigned_stein    = set()
    results           = [None] * len(gemara_occurrences)

    for score, g_idx, pos in scored:
        if g_idx in assigned_gemara:
            continue
        # Allow reuse of nearby Steinsaltz positions only if the score is
        # very different (prevents two Gemara hits mapping to the same place).
        # Simple approach: block a window of ±15 around each assigned pos.
        if any(abs(pos - ap) < 15 for ap in assigned_stein):
            continue

        assigned_gemara.add(g_idx)
        assigned_stein.add(pos)

        start = max(0, pos - context_size)
        end   = min(len(stein_tagged), pos + context_size + 1)
        win   = stein_tagged[start:end]

        # word_is_bold: is the matched position (or any of the subsequent
        # parts within 10 tokens) tagged bold?
        nearby = stein_tagged[pos : min(len(stein_tagged), pos + 10)]
        word_is_bold = any(
            t["b"] for t in nearby
            if any(token_contains(t["base"], p) for p in parts)
        )

        results[g_idx] = {
            "steinsaltz_pos": pos,
            "word_is_bold":   word_is_bold,
            "match_score":    score,
            "before":         [t["t"] for t in win[:pos - start]],
            "after":          [t["t"] for t in win[pos - start + 1:]],
            "full_context":   " ".join(t["t"] for t in win),
        }

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Dictionary lookup
# ──────────────────────────────────────────────────────────────────────────────

def fetch_dictionary_meaning(word_label: str) -> str:
    encoded = quote(word_label, safe="")
    url = f"{BASE_URL}/AramicDictionary.aspx?lang=arc&tab=search&word={encoded}"
    html = get_cached(url)
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    el = soup.find(class_="translation-result")
    if el:
        return el.get_text(separator=" ", strip=True)
    # Fallback: dash-separated definition
    for el in soup.find_all(["span", "div", "td"]):
        txt = el.get_text(strip=True)
        if re.search(r"[\u05D0-\u05EA].{1,30}[-–—]", txt) and len(txt) < 200:
            if not re.search(r"מפעל|תולדות|לוח", txt):
                return txt
    return ""


def lookup_dictionary(word_nikkud: str, parts: list[str]) -> dict:
    """
    Try progressively shorter queries until autocomplete returns something.
    For ellipsis words, try first part alone first.
    """
    queries = [parts[0]] if is_ellipsis_word(word_nikkud) else []
    for n in range(len(parts), 0, -1):
        q = " ".join(parts[:n])
        if q not in queries:
            queries.append(q)

    for query in queries:
        encoded = quote(query, safe="")
        url = f"{BASE_URL}/AramicDictionary_Autocomplete.ashx?term={encoded}&lang=arc"
        try:
            r   = SESSION.get(url, timeout=15)
            raw = json.loads(r.content.decode("utf-8", errors="replace"))
        except Exception:
            raw = []

        if raw and isinstance(raw, list):
            labels  = [s.get("label", "") for s in raw]
            meaning = fetch_dictionary_meaning(labels[0])
            print(f"    → Dict via '{query}': {len(labels)} result(s)")
            for lbl in labels[:3]:
                suffix = f"  —  {meaning}" if lbl == labels[0] and meaning else ""
                print(f"       • {lbl}{suffix}")
            return {
                "query_used":  query,
                "suggestions": labels,
                "meaning":     meaning,
                "dict_url": (
                    f"{BASE_URL}/AramicDictionary.aspx"
                    f"?lang=arc&tab=search&word={quote(labels[0], safe='')}"
                ),
            }

    print("    → No dictionary results.")
    return {"query_used": "", "suggestions": [], "meaning": "", "dict_url": ""}


# ──────────────────────────────────────────────────────────────────────────────
# Gemara page search
# ──────────────────────────────────────────────────────────────────────────────

def search_gemara(parts: list[str], is_ellipsis: bool = False) -> list[dict]:
    """
    Search daf-yomi.com for Gemara pages containing the word/phrase.

    Two different search strategies:

    REGULAR multi-word  (e.g. "אי לימא", "אדהכי והכי"):
      → Word1=<full phrase with spaces encoded as +>
      → Finds only EXACT consecutive occurrences of the whole phrase.
      → Using Word1+Word2 instead would return ~10× more false positives
        because the two words appear independently anywhere on the page.

    ELLIPSIS words  (e.g. "אחד … ואחד"):
      → Word1=אחד  &  Word2=ואחד  &  CharDistance=100
      → The … means "some words in between", so we search for the two
        parts in proximity but NOT necessarily adjacent.
    """
    if not parts:
        return []

    if is_ellipsis:
        # Parts appear with words between them — use Word1+Word2+CharDistance
        params = "&".join(f"Word{i+1}={quote_plus(p)}" for i, p in enumerate(parts))
        url = (
            f"{BASE_URL}/PageSearchPlain.aspx?"
            f"{params}&SearchType=2&Relationship=1"
            f"&CharDistance=100&Source=1"
        )
    else:
        # Exact phrase — pass the whole phrase (with spaces) as a single Word1
        # quote_plus encodes spaces as +, which the server treats as phrase search
        full_phrase = " ".join(parts)
        url = (
            f"{BASE_URL}/PageSearchPlain.aspx?"
            f"Word1={quote_plus(full_phrase)}&SearchType=2&Relationship=1"
            f"&CharDistance=100&Source=1"
        )
    html = get_cached(url)
    if not html:
        return []

    results = []
    seen    = set()
    soup    = BeautifulSoup(html, "html.parser")

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "dafyomi_page.aspx" not in href.lower():
            continue
        m = re.search(r"\bid=(\d+)\b", href, re.I)
        if not m:
            continue
        pid = m.group(1)
        if pid in seen:
            continue
        label = a.get_text(strip=True)
        if len(label) > 40:          # skip snippet labels, keep page refs
            continue
        seen.add(pid)
        results.append({
            "page_id":     pid,
            "label":       label,
            "url_nikud":   f"{BASE_URL}/{DAF_PAGE}?vt=3&id={pid}",
            "url_explain": f"{BASE_URL}/{DAF_PAGE}?vt=5&id={pid}",
            "search_url":  url,
        })

    return results[:10]


# ──────────────────────────────────────────────────────────────────────────────
# Core: process one word
# ──────────────────────────────────────────────────────────────────────────────

def process_word(word_nikkud: str, french_meaning: str) -> dict:
    parts    = get_query_parts(word_nikkud)
    ellipsis = is_ellipsis_word(word_nikkud)
    # Ellipsis: parts far apart → large window. Non-ellipsis multi-word: must be consecutive → window=1.
    occ_win  = 100 if ellipsis else 1

    print(f"\n  ▸ {word_nikkud} | {french_meaning}")

    # 1. Dictionary
    print("    [1/3] Dictionary…")
    dictionary = lookup_dictionary(word_nikkud, parts)

    # 2. Search Gemara
    print("    [2/3] Searching Gemara…")
    refs = search_gemara(parts, is_ellipsis=ellipsis)
    print(f"    → {len(refs)} reference(s)")

    # 3. Fetch pages, extract occurrences, match Gemara ↔ Steinsaltz
    gemara_pages = []
    if refs:
        print("    [3/3] Fetching pages…")
        verified = 0
        for ref in refs:
            if verified >= 3:
                break

            label = ref["label"] or f"id={ref['page_id']}"
            print(f"      {label}…", end="", flush=True)

            # --- Nikkud page (vt=3) ---
            html_n      = get_cached(ref["url_nikud"],   f"p{ref['page_id']}_v3")
            tagged_n    = build_tagged_tokens(html_n)
            gemara_occs = find_gemara_occurrences(tagged_n, parts, window=occ_win)

            # --- Steinsaltz page (vt=5) ---
            html_e   = get_cached(ref["url_explain"], f"p{ref['page_id']}_v5")
            tagged_e = build_tagged_tokens(html_e)

            # --- Match each Gemara occurrence to its Steinsaltz counterpart ---
            stein_matches = match_steinsaltz_to_gemara(tagged_e, gemara_occs, parts)

            # Build per-occurrence dicts
            paired = []
            for gocc, smatch in zip(gemara_occs, stein_matches):
                paired.append({
                    "gemara": {
                        "word":         gocc["word"],
                        "before":       gocc["before"],
                        "after":        gocc["after"],
                        "full_context": gocc["full_context"],
                    },
                    "steinsaltz": smatch,   # None if no match found
                })

            n_g = len(gemara_occs)
            n_s = sum(1 for m in stein_matches if m is not None)
            print(f" gemara:{n_g}  stein_matched:{n_s}")

            # Skip pages where the word was not actually found
            # (false positives from the proximity search)
            if n_g == 0 and len(parts) > 1:
                print(f"        ↳ Skipped (false positive — word not on page)")
                continue

            gemara_pages.append({
                "label":       label,
                "page_id":     ref["page_id"],
                "url_nikud":   ref["url_nikud"],
                "url_explain": ref["url_explain"],
                "occurrences": paired,
            })
            verified += 1

    return {
        "word_with_nikkud":  word_nikkud,
        "base_consonants":   " ".join(parts),
        "french_meaning":    french_meaning,
        "is_ellipsis_entry": ellipsis,
        "dictionary":        dictionary,
        "gemara_pages":      gemara_pages,
        # AI fills these:
        "ai_verification": {
            "nikkud_correct":        None,
            "pages_same_meaning":    [],
            "corrected_nikkud_word": None,
            "notes":                 "",
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Prepare Aramaic nikkud verification JSON from a flashcard CSV"
    )
    parser.add_argument("csv_file")
    parser.add_argument("--sep",   default=",",
                        help="CSV column separator (default: comma)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only process first N rows (0 = all)")
    args = parser.parse_args()

    sep = args.sep.replace("\\t", "\t")

    output_base = args.csv_file.replace(".csv", "_nikkud_data.json")
    output_file = get_next_filename(output_base)
    print(f"Output: {output_file}")

    warm_up()

    with open(args.csv_file, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=sep)
        next(reader, [])
        rows = list(reader)

    if args.limit:
        rows = rows[:args.limit]

    total   = len(rows)
    results = []
    print(f"Words: {total}")

    for idx, row in enumerate(rows):
        if not row:
            continue
        word    = row[0].strip()
        meaning = row[1].strip() if len(row) > 1 else ""
        if not word:
            continue

        print(f"\n[{idx+1}/{total}]")
        try:
            res = process_word(word, meaning)
        except KeyboardInterrupt:
            print("\n\nInterrupted — saving progress…")
            break
        except Exception as e:
            import traceback
            print(f"  ⚠  Error: {e}")
            traceback.print_exc()
            res = {
                "word_with_nikkud": word,
                "base_consonants":  " ".join(get_query_parts(word)),
                "french_meaning":   meaning,
                "error":            str(e),
                "dictionary":       {},
                "gemara_pages":     [],
                "ai_verification": {
                    "nikkud_correct": None,
                    "pages_same_meaning": [],
                    "corrected_nikkud_word": None,
                    "notes": "",
                },
            }

        results.append(res)
        with open(output_file, "w", encoding="utf-8") as out:
            json.dump(results, out, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"Done. {len(results)} word(s) → {output_file}")


if __name__ == "__main__":
    main()