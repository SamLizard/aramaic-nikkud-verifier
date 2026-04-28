#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_json.py  —  JSON patcher for Aramaic Nikkud Verifier
===========================================================
Takes an existing nikkud_data.json and repairs specific entries
WITHOUT touching anything else (e.g. dictionary results, ai_verification,
manual_status, or any other custom fields added to the JSON).

Two modes
---------

  --mode fix-multi-words
      Finds entries where:
        • is_ellipsis_entry = false  (not a "…" word)
        • base_consonants contains a space  (2+ words)
      These were incorrectly searched with Word1=X&Word2=Y (proximity),
      which returns false positives because both words appear independently
      anywhere on the page.  The correct search is Word1=<full+phrase>
      which finds only pages where the words appear CONSECUTIVELY.

      For each such entry: re-runs the Gemara search + page fetch,
      replaces only the gemara_pages field.  Dictionary is left untouched.

  --mode more-sources
      Finds entries where manual_status = "need_more_sources".
      Fetches up to --max-extra (default 10) additional Gemara pages
      beyond the ones already present, appending them to gemara_pages.
      Skips pages already in the entry.

Common behaviour
----------------
  • Never overwrites the input file — output is saved as <input>_patched.json,
    or _patched_2.json, _patched_3.json … if the file already exists.
  • Saves after every processed entry (safe to Ctrl-C).
  • Disk cache is shared with prepare_json.py (same ./cache/ folder).
  • Uses vt=3 for nikkud pages (not vt=4).

Usage
-----
  pip install curl_cffi beautifulsoup4
  python patch_json.py all_flashcards_nikkud_data.json --mode fix-multi-words
  python patch_json.py all_flashcards_nikkud_data.json --mode more-sources
  python patch_json.py all_flashcards_nikkud_data.json --mode more-sources --max-extra 15
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from urllib.parse import quote, quote_plus

from curl_cffi import requests as curl_requests
from bs4 import BeautifulSoup, NavigableString

# ──────────────────────────────────────────────────────────────────────────────
# Shared infrastructure  (mirrors prepare_json.py — keep in sync)
# ──────────────────────────────────────────────────────────────────────────────

BASE_URL  = "https://daf-yomi.com"
DAF_PAGE  = "DafYomi_Page.aspx"   # capital Y
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

_NIKKUD   = range(0x05B0, 0x05C8)
_CANTIL   = range(0x0591, 0x05B0)
_PUNC_HEB = range(0x05C1, 0x05C3)

_TEXT_SELECTORS = [
    "#PageText",
    "#ContentPlaceHolderMain_divText",
    "div[id*='Text']",
    "#textDiv", "#TextDiv",
    ".daf-text", ".page-text",
]

_HEB_TOKEN = re.compile(
    r"[\u05D0-\u05EA\uFB1D-\uFB4E]"
    r"[\u0591-\u05C7\u05D0-\u05EA\uFB1D-\uFB4E\"']*"
)

SESSION = curl_requests.Session(impersonate="chrome")
SESSION.headers.update(HEADERS)

# ── text helpers ──────────────────────────────────────────────────────────────

def strip_nikkud(text: str) -> str:
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
    return "".join(
        c for c in strip_nikkud(text)
        if "\u05D0" <= c <= "\u05EA" or "\uFB1D" <= c <= "\uFB4E"
    )


def is_ellipsis_word(word: str) -> bool:
    return "\u2026" in word or "..." in word


def get_query_parts(word: str) -> list[str]:
    """Consonant tokens from a word (handles … and ...)."""
    clean = word.replace("\u2026", " ").replace("...", " ")
    return [hebrew_only(p) for p in clean.split() if hebrew_only(p)]


# ── HTTP / cache ──────────────────────────────────────────────────────────────

def warm_up():
    try:
        print("Warming up session cookies...")
        SESSION.get("https://daf-yomi.com/", timeout=15)
    except Exception as e:
        print(f"  Warning: warm-up failed: {e}")


def get_cached(url: str, cache_key: str = None) -> str:
    """GET with disk cache. Always decodes UTF-8 explicitly."""
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


# ── page parsing ──────────────────────────────────────────────────────────────

def extract_main_element(soup: BeautifulSoup):
    for sel in _TEXT_SELECTORS:
        el = soup.select_one(sel)
        if el and re.search(r"[\u05D0-\u05EA]", el.get_text(strip=True)):
            return el
    return soup.find("body") or soup


def build_tagged_tokens(html: str) -> list[dict]:
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


# ── occurrence finding ────────────────────────────────────────────────────────

def find_gemara_occurrences(
    tagged: list[dict],
    parts:  list[str],
    window: int = 25,
    context_size: int = 20,
) -> list[dict]:
    tokens  = [t["t"] for t in tagged]
    results = []

    for i in range(len(tokens)):
        if strip_nikkud(tokens[i]) != parts[0]:
            continue
        matched = [i]; cur = i; ok = True
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
        before = tokens[start : matched[0]]
        after  = tokens[matched[-1] + 1 : end]
        is_consecutive = (matched[-1] - matched[0] == len(parts) - 1)
        word_display   = (
            " ".join(tokens[m] for m in matched)
            if is_consecutive
            else " … ".join(tokens[m] for m in matched)
        )
        results.append({
            "matched_indices": matched,
            "word":         word_display,
            "before":       before,
            "after":        after,
            "before_bases": [hebrew_only(t) for t in before],
            "after_bases":  [hebrew_only(t) for t in after],
            "full_context": " ".join(tokens[start:end]),
        })
    return results


# ── Steinsaltz matching ───────────────────────────────────────────────────────

def score_steinsaltz_candidate(
    tagged: list[dict], pos: int,
    before_bases: list[str], after_bases: list[str],
    window: int = 25,
) -> float:
    bw = tagged[max(0, pos - window) : pos]
    aw = tagged[pos : min(len(tagged), pos + window)]
    bb       = {t["base"] for t in bw}
    ab_bold  = {t["base"] for t in aw if t["b"]}
    ab_any   = {t["base"] for t in aw}
    s  = sum(1 for b in before_bases if b and b in bb)
    s += sum(3 for a in after_bases  if a and a in ab_bold)
    s += sum(1 for a in after_bases  if a and a in ab_any and a not in ab_bold)
    return float(s)


def match_steinsaltz_to_gemara(
    stein_tagged: list[dict],
    gemara_occs:  list[dict],
    parts: list[str],
    context_size: int = 20,
) -> list[dict | None]:
    if not gemara_occs:
        return []

    # Candidates: positions where first part appears (exact or substring)
    first = parts[0]
    cands = [
        i for i, t in enumerate(stein_tagged)
        if t["base"] and (first in t["base"] or t["base"] in first)
    ]

    scored = []
    for gi, gocc in enumerate(gemara_occs):
        for pos in cands:
            s = score_steinsaltz_candidate(
                stein_tagged, pos, gocc["before_bases"], gocc["after_bases"]
            )
            if s > 0:
                scored.append((s, gi, pos))
    scored.sort(key=lambda x: -x[0])

    ag = set(); ast = set()
    results: list[dict | None] = [None] * len(gemara_occs)

    for score, gi, pos in scored:
        if gi in ag:
            continue
        if any(abs(pos - ap) < 15 for ap in ast):
            continue
        ag.add(gi); ast.add(pos)

        start = max(0, pos - context_size)
        end   = min(len(stein_tagged), pos + context_size + 1)
        win   = stein_tagged[start:end]

        nearby = stein_tagged[pos : min(len(stein_tagged), pos + 10)]
        word_is_bold = any(
            t["b"] for t in nearby
            if any(p in t["base"] or t["base"] in p for p in parts)
        )

        results[gi] = {
            "steinsaltz_pos": pos,
            "word_is_bold":   word_is_bold,
            "match_score":    score,
            "before": [t["t"] for t in win[:pos - start]],
            "after":  [t["t"] for t in win[pos - start + 1:]],
            "full_context": " ".join(t["t"] for t in win),
        }
    return results


# ── Gemara search ─────────────────────────────────────────────────────────────

def search_gemara(parts: list[str], is_ellipsis: bool,
                  page: int = 1) -> list[dict]:
    """
    Regular words  → Word1=<full phrase> (exact consecutive search).
    Ellipsis words → Word1=X&Word2=Y&CharDistance=100 (proximity search).
    page parameter allows fetching result pages 2, 3, … for more-sources mode.
    """
    if not parts:
        return []

    if is_ellipsis:
        params = "&".join(f"Word{i+1}={quote_plus(p)}" for i, p in enumerate(parts))
        url = (
            f"{BASE_URL}/PageSearchPlain.aspx?"
            f"{params}&SearchType=2&Relationship=1"
            f"&CharDistance=100&Source=1&page={page}"
        )
    else:
        full_phrase = " ".join(parts)
        url = (
            f"{BASE_URL}/PageSearchPlain.aspx?"
            f"Word1={quote_plus(full_phrase)}&SearchType=2"
            f"&Relationship=1&CharDistance=100&Source=1&page={page}"
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
        pid   = m.group(1)
        label = a.get_text(strip=True)
        if pid in seen or len(label) > 40:
            continue
        seen.add(pid)
        results.append({
            "page_id":     pid,
            "label":       label,
            # !! vt=3 for nikkud pages (user confirmed this works)
            "url_nikud":   f"{BASE_URL}/{DAF_PAGE}?vt=3&id={pid}",
            "url_explain": f"{BASE_URL}/{DAF_PAGE}?vt=5&id={pid}",
            "search_url":  url,
        })

    return results[:10]


# ── fetch one Gemara page and return an occurrences list ─────────────────────

def fetch_page_occurrences(ref: dict, parts: list[str], occ_window: int) -> dict | None:
    """
    Fetch both the nikkud (vt=3) and explanation (vt=5) pages for `ref`,
    find occurrences of `parts`, match them, and return a gemara_pages entry.
    Returns None if the word is not found on the page (false positive).
    """
    label = ref["label"] or f"id={ref['page_id']}"
    print(f"      {label}…", end="", flush=True)

    html_n    = get_cached(ref["url_nikud"],   f"p{ref['page_id']}_v3")
    tagged_n  = build_tagged_tokens(html_n)
    gemara_occs = find_gemara_occurrences(tagged_n, parts, window=occ_window)

    html_e    = get_cached(ref["url_explain"], f"p{ref['page_id']}_v5")
    tagged_e  = build_tagged_tokens(html_e)
    matches   = match_steinsaltz_to_gemara(tagged_e, gemara_occs, parts)

    n_g = len(gemara_occs)
    n_s = sum(1 for m in matches if m is not None)
    print(f" gemara:{n_g}  stein:{n_s}")

    # Skip false positives for multi-word queries
    if n_g == 0 and len(parts) > 1:
        print(f"        ↳ Skipped (false positive)")
        return None

    paired = [
        {
            "gemara": {
                "word":         gocc["word"],
                "before":       gocc["before"],
                "after":        gocc["after"],
                "full_context": gocc["full_context"],
            },
            "steinsaltz": smatch,
        }
        for gocc, smatch in zip(gemara_occs, matches)
    ]

    return {
        "label":       label,
        "page_id":     ref["page_id"],
        "url_nikud":   ref["url_nikud"],
        "url_explain": ref["url_explain"],
        "occurrences": paired,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Mode 1: fix-multi-words
# ──────────────────────────────────────────────────────────────────────────────

def needs_fix(entry: dict) -> bool:
    """
    An entry needs fixing if:
      - is_ellipsis_entry is False (or absent)
      - base_consonants has more than one word (contains a space)
    These entries were searched with Word1+Word2 format, which is wrong for
    regular phrases — only ellipsis entries should use that format.
    """
    if entry.get("is_ellipsis_entry", False):
        return False
    base = entry.get("base_consonants", "")
    return " " in base.strip()


def fix_multi_words(entries: list[dict]) -> list[dict]:
    """Re-fetch gemara_pages for all entries that need fixing."""
    to_fix = [e for e in entries if needs_fix(e)]
    print(f"\nEntries needing fix: {len(to_fix)} / {len(entries)}")

    for idx, entry in enumerate(entries):
        if not needs_fix(entry):
            continue

        word    = entry["word_with_nikkud"]
        meaning = entry.get("french_meaning", "")
        parts   = get_query_parts(word)
        occ_win = 1    # not ellipsis: parts must be strictly consecutive

        print(f"\n[fix {idx+1}] {word}  |  {meaning}")
        print(f"  parts: {parts}  (phrase search)")

        refs = search_gemara(parts, is_ellipsis=False)
        print(f"  → {len(refs)} reference(s)")

        new_pages = []
        verified  = 0
        for ref in refs:
            if verified >= 3:
                break
            page = fetch_page_occurrences(ref, parts, occ_win)
            if page is not None:
                new_pages.append(page)
                verified += 1

        # Replace ONLY gemara_pages — leave everything else untouched
        entry["gemara_pages"] = new_pages
        entry["needs_ai_rerun"] = True

    return entries


# ──────────────────────────────────────────────────────────────────────────────
# Mode 2: more-sources
# ──────────────────────────────────────────────────────────────────────────────

def more_sources(entries: list[dict], max_extra: int = 10) -> list[dict]:
    """
    For entries with manual_status = "need_more_sources":
    fetch additional Gemara pages (up to max_extra new verified pages)
    and APPEND them to gemara_pages.  Existing pages are not touched.
    """
    to_expand = [e for e in entries if e.get("manual_status") == "need_more_sources"]
    print(f"\nEntries needing more sources: {len(to_expand)} / {len(entries)}")

    for idx, entry in enumerate(entries):
        if entry.get("manual_status") != "need_more_sources":
            continue

        word    = entry["word_with_nikkud"]
        meaning = entry.get("french_meaning", "")
        parts   = get_query_parts(word)
        ellipsis = is_ellipsis_word(word)
        occ_win  = 100 if ellipsis else 1

        existing_ids = {p["page_id"] for p in entry.get("gemara_pages", [])}
        print(f"\n[expand {idx+1}] {word}  |  {meaning}")
        print(f"  existing pages: {len(existing_ids)}  target: +{max_extra}")

        added = 0
        # Try result pages 1, 2, 3 … until we have enough or run out
        for search_page in range(1, 6):
            if added >= max_extra:
                break

            refs = search_gemara(parts, is_ellipsis=ellipsis, page=search_page)
            if not refs:
                break

            new_refs = [r for r in refs if r["page_id"] not in existing_ids]
            if not new_refs:
                # All results on this search page are already known — try next
                continue

            print(f"  Search page {search_page}: {len(new_refs)} new refs")
            for ref in new_refs:
                if added >= max_extra:
                    break
                page = fetch_page_occurrences(ref, parts, occ_win)
                if page is not None:
                    entry["gemara_pages"].append(page)
                    existing_ids.add(ref["page_id"])
                    added += 1

        print(f"  → Added {added} page(s)")
        if added > 0:
            entry["needs_ai_rerun"] = True

    return entries


# ──────────────────────────────────────────────────────────────────────────────
# Output file naming (never overwrite)
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
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Patch an existing nikkud_data.json without touching other fields"
    )
    parser.add_argument("json_file",
                        help="Path to the existing *_nikkud_data.json file")
    parser.add_argument("--mode", required=True,
                        choices=["fix-multi-words", "more-sources"],
                        help=(
                            "fix-multi-words: re-fetch pages for multi-word "
                            "non-ellipsis entries that were wrongly searched. "
                            "more-sources: add more Gemara pages to entries "
                            "tagged manual_status=need_more_sources."
                        ))
    parser.add_argument("--max-extra", type=int, default=10,
                        help="[more-sources] Max new pages to add per entry (default: 10)")
    args = parser.parse_args()

    # Load input JSON
    print(f"Loading {args.json_file}…")
    try:
        with open(args.json_file, encoding="utf-8") as f:
            entries = json.load(f)
    except FileNotFoundError:
        sys.exit(f"ERROR: File not found: {args.json_file}")
    except json.JSONDecodeError as e:
        sys.exit(f"ERROR: Invalid JSON: {e}")

    print(f"Loaded {len(entries)} entries.")

    # Output path — never overwrites
    base = args.json_file.replace(".json", f"_{args.mode.replace('-','_')}.json")
    output_file = get_next_filename(base)
    print(f"Output will be saved to: {output_file}")

    warm_up()

    try:
        if args.mode == "fix-multi-words":
            entries = fix_multi_words(entries)
        elif args.mode == "more-sources":
            entries = more_sources(entries, max_extra=args.max_extra)
    except KeyboardInterrupt:
        print("\n\nInterrupted — saving progress…")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"\nDone. Saved to: {output_file}")


if __name__ == "__main__":
    main()