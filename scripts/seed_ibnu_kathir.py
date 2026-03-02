#!/usr/bin/env python3
"""
Seed tafsir_ibnu_kathir from quran.com API (Tafsir ID 169 - Ibn Kathir Abridged, English).
Fetches one verse at a time, strips HTML, stores in Supabase.
Resumable: skips verses that already have content.
"""

import os, sys, time, re, json
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
TAFSIR_ID    = 169          # Ibn Kathir Abridged, English — quran.com
DELAY        = 0.35         # seconds between quran.com requests (polite rate limit)
BATCH_SIZE   = 50           # rows per Supabase PATCH batch

if not SUPABASE_URL or not SERVICE_KEY:
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())
        SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
        SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")

assert SUPABASE_URL, "SUPABASE_URL not set"
assert SERVICE_KEY,  "SUPABASE_SERVICE_KEY not set"

HEADERS_SB = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def strip_html(text: str) -> str:
    """Remove HTML tags and decode basic entities."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    text = re.sub(r" {2,}", " ", text)
    return text.strip()

def fetch_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise

def sb_get(path: str) -> list:
    req = Request(f"{SUPABASE_URL}/rest/v1/{path}",
                  headers={**HEADERS_SB, "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def sb_patch(verse_id: str, text: str):
    payload = json.dumps({"tafsir_ibnu_kathir": text}).encode()
    req = Request(
        f"{SUPABASE_URL}/rest/v1/quran_verses?id=eq.{verse_id}",
        data=payload,
        method="PATCH",
        headers=HEADERS_SB,
    )
    with urlopen(req, timeout=15) as r:
        r.read()

# ── Surah verse counts (standard) ────────────────────────────────────────────
SURAH_LENGTHS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,
    98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,
    75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
    14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,22,33,30,26,24,
    22,26,33,24,35,19,17,45,11,16,17,19,26,30,20,15,21,11,8,8,19,5,8,
    8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
]

# ── Phase 1: find verses still needing tafsir_ibnu_kathir ─────────────────────
print("\n── Phase 1: Checking which verses need Ibnu Kathir tafsir ──────────────────")
existing = sb_get("quran_verses?select=id&tafsir_ibnu_kathir=not.is.null")
done_ids = {r["id"] for r in existing}
print(f"  Already populated: {len(done_ids)} / 6236")

# Build list of all verse IDs
todo = []
for s, length in enumerate(SURAH_LENGTHS, 1):
    for v in range(1, length + 1):
        vid = f"{s}:{v}"
        if vid not in done_ids:
            todo.append((s, v, vid))

print(f"  To fetch: {len(todo)} verses\n")

if not todo:
    print("  ✓ All verses already have Ibnu Kathir tafsir. Nothing to do.")
    sys.exit(0)

# ── Phase 2: Fetch from quran.com and update Supabase ────────────────────────
print("── Phase 2: Fetching from quran.com & updating Supabase ────────────────────")

total   = len(todo)
batch   = []
updated = 0
failed  = 0

for i, (surah, verse, vid) in enumerate(todo, 1):
    try:
        url  = f"https://api.quran.com/api/v4/tafsirs/{TAFSIR_ID}/by_ayah/{surah}:{verse}"
        data = fetch_json(url)
        raw  = data.get("tafsir", {}).get("text", "") or ""
        text = strip_html(raw).strip()
        if not text:
            text = None
        batch.append((vid, text))
    except Exception as e:
        print(f"  ✗ {vid}: fetch failed — {e}")
        failed += 1
        batch.append((vid, None))

    # Flush batch to Supabase
    if len(batch) >= BATCH_SIZE or i == total:
        flush_n = len(batch)
        sys.stdout.write(f"\r  {i}/{total} fetched, flushing {flush_n} to Supabase …")
        sys.stdout.flush()
        for bvid, btext in batch:
            if btext:
                try:
                    sb_patch(bvid, btext)
                    updated += 1
                except Exception as e:
                    print(f"\n  ✗ PATCH {bvid}: {e}")
                    failed += 1
        batch = []
        print(f"\r  {i}/{total} — {updated} updated, {failed} failed          ")

    time.sleep(DELAY)

print(f"\n  ✓ Done: {updated} verses updated, {failed} failed\n")
print("── Complete ─────────────────────────────────────────────────────────────────")
print("  Next: re-run reembed.py if you want Ibnu Kathir in embeddings too.\n")
