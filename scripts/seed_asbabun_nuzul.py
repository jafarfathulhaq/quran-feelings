#!/usr/bin/env python3
"""
Seed asbabun_nuzul from spa5k/tafsir_api (Al-Wahidi, English).
Fetches surah-level JSON files, extracts per-ayah entries,
and stores the English text in quran_verses.asbabun_nuzul.

Resumable: skips verses that already have content.

Source: https://github.com/spa5k/tafsir_api
  Surah file: /{surah}.json → { ayahs: [{ayah, surah, text}, ...] }
  Surahs 78-114 have no file (404). Some surahs exist but have ayahs: null.

Usage:
  python3 scripts/seed_asbabun_nuzul.py
"""

import os, sys, json, time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# ── Load env ──────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]

SB_HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

BASE_URL = "https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/en-asbab-al-nuzul-by-al-wahidi"

# ── Helpers ───────────────────────────────────────────────────────────────────
def fetch_json(url: str, retries: int = 3):
    """Fetch JSON from URL. Returns None on 404."""
    for attempt in range(retries):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except HTTPError as e:
            if e.code == 404:
                return None
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
        except (URLError, TimeoutError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise

def sb_get(path: str) -> list:
    req = Request(f"{SUPABASE_URL}/rest/v1/{path}",
                  headers={**SB_HEADERS, "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def sb_patch(verse_id: str, text: str):
    payload = json.dumps({"asbabun_nuzul": text}).encode()
    req = Request(
        f"{SUPABASE_URL}/rest/v1/quran_verses?id=eq.{verse_id}",
        data=payload, method="PATCH", headers=SB_HEADERS,
    )
    with urlopen(req, timeout=15) as r:
        r.read()

# ── Phase 1: Check existing ──────────────────────────────────────────────────
print("\n── Phase 1: Checking which verses already have asbabun nuzul ─────────────────")
existing = sb_get("quran_verses?select=id&asbabun_nuzul=not.is.null")
done_ids = {r["id"] for r in existing}
print(f"  Already populated: {len(done_ids)}")

# ── Phase 2: Fetch from spa5k API ────────────────────────────────────────────
print("\n── Phase 2: Fetching from spa5k/tafsir_api ──────────────────────────────────")
total_fetched = 0
total_updated = 0
total_skipped = 0
total_failed  = 0

for surah_num in range(1, 115):
    url  = f"{BASE_URL}/{surah_num}.json"
    data = fetch_json(url)

    if data is None:
        # Surah file doesn't exist (surahs 78-114 mostly)
        continue

    ayahs = data.get("ayahs")
    if ayahs is None:
        # Surah file exists but has no data
        continue

    count = 0
    for entry in ayahs:
        ayah_num = entry.get("ayah")
        text     = entry.get("text", "").strip()
        if not text or not ayah_num:
            continue

        verse_id = f"{surah_num}:{ayah_num}"
        total_fetched += 1

        if verse_id in done_ids:
            total_skipped += 1
            continue

        try:
            sb_patch(verse_id, text)
            total_updated += 1
            count += 1
        except Exception as e:
            print(f"  ✗ PATCH {verse_id}: {e}")
            total_failed += 1

    if count > 0:
        print(f"  Surah {surah_num:>3}: {count} verses updated")

    # Small delay between surah requests
    time.sleep(0.2)

print(f"\n── Summary ──────────────────────────────────────────────────────────────────")
print(f"  Total entries found: {total_fetched}")
print(f"  Updated:  {total_updated}")
print(f"  Skipped (already exists): {total_skipped}")
print(f"  Failed:   {total_failed}")
print(f"\n── Complete ─────────────────────────────────────────────────────────────────")
print(f"  Next: run scripts/translate_asbabun_nuzul.py to translate to Indonesian.\n")
