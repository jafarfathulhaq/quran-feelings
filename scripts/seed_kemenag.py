#!/usr/bin/env python3
"""
seed_kemenag.py
───────────────
Fetches Kemenag tafsir for all 6,236 verses from equran.id and stores
it in the tafsir_kemenag column of quran_verses in Supabase.

The Kemenag tafsir is multi-paragraph, averaging ~2,300 chars/verse —
far richer than the existing Quraish Shihab summaries. It will be used:
  1. For embedding enrichment (first 600 chars appended to translation)
  2. For the "Tafsir Lengkap" on-demand detail feature in the UI

Run once from the project root:

  python3 scripts/seed_kemenag.py

Reads credentials from .env. Safe to re-run (skips already-populated rows).
"""

import json, os, sys, time, urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────

def load_env():
    path = os.path.join(os.path.dirname(__file__), "../.env")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

load_env()

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
EQURAN_BASE          = "https://equran.id/api/v2/tafsir"

UPDATE_BATCH = 50   # rows per Supabase PATCH call
SURAH_DELAY  = 0.4  # seconds between equran.id calls

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_env():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        sys.exit(1)

def http_get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def supabase_headers():
    return {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Prefer":        "return=minimal",
    }

# ── Phase 1: Fetch tafsir from equran.id ─────────────────────────────────────

def fetch_surah_tafsir(n):
    """Returns list of {id, tafsir_kemenag} for all verses in surah n."""
    data = http_get(f"{EQURAN_BASE}/{n}")
    if data.get("code") != 200:
        raise ValueError(f"equran.id error for surah {n}: {data.get('message')}")
    rows = []
    for t in data["data"]["tafsir"]:
        verse_id = f"{n}:{t['ayat']}"
        rows.append({"id": verse_id, "tafsir_kemenag": t["teks"]})
    return rows

def fetch_all(skip_populated=True):
    """Fetch tafsir for all 114 surahs. Returns flat list of rows."""
    # Check which ids already have tafsir_kemenag populated to allow resuming
    populated = set()
    if skip_populated:
        url = (f"{SUPABASE_URL}/rest/v1/quran_verses"
               f"?select=id&tafsir_kemenag=not.is.null&limit=10000")
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            existing = json.loads(resp.read())
        populated = {r["id"] for r in existing}
        if populated:
            print(f"  ↳ {len(populated)} verses already populated — will skip")

    all_rows = []
    for n in range(1, 115):
        print(f"  [{n:3}/114] Fetching surah {n} … ", end="", flush=True)
        try:
            rows = fetch_surah_tafsir(n)
            new  = [r for r in rows if r["id"] not in populated]
            all_rows.extend(new)
            print(f"✓ ({len(rows)} ayat, {len(new)} new)")
        except Exception as e:
            print(f"✗  {e}")
        time.sleep(SURAH_DELAY)

    return all_rows

# ── Phase 2: Upsert into Supabase ────────────────────────────────────────────

def update_batch(rows):
    """PATCH tafsir_kemenag for a batch of verse ids."""
    # Supabase REST: PATCH with id=in.(...) filter
    # We send individual updates because PATCH with IN filter sets same value.
    # Use bulk RPC or individual calls.
    # For simplicity: POST to a helper endpoint or use individual PATCHes.
    # We'll use a loop but group by surah to stay efficient.
    for row in rows:
        url = (f"{SUPABASE_URL}/rest/v1/quran_verses"
               f"?id=eq.{urllib.parse.quote(row['id'])}")
        body = json.dumps({"tafsir_kemenag": row["tafsir_kemenag"]}).encode()
        req  = urllib.request.Request(
            url, data=body, headers=supabase_headers(), method="PATCH"
        )
        try:
            with urllib.request.urlopen(req, timeout=30):
                pass
        except Exception as e:
            print(f"\n    ✗ Failed to update {row['id']}: {e}")

def update_all(rows):
    total   = len(rows)
    updated = 0
    for start in range(0, total, UPDATE_BATCH):
        batch = rows[start : start + UPDATE_BATCH]
        end   = min(start + UPDATE_BATCH, total)
        print(f"  Updating {start+1}–{end}/{total} … ", end="", flush=True)
        update_batch(batch)
        updated += len(batch)
        print("✓")
        time.sleep(0.1)
    return updated

# ── Main ──────────────────────────────────────────────────────────────────────

# Import urllib.parse (used in update_batch)
import urllib.parse

def main():
    check_env()

    print("\n── Phase 1: Fetching Kemenag tafsir from equran.id ──────────────────────")
    rows = fetch_all(skip_populated=True)
    print(f"\n  ✓ {len(rows)} verses to update\n")

    if not rows:
        print("  Nothing to do — all verses already populated.")
        return

    print("── Phase 2: Updating tafsir_kemenag in Supabase ─────────────────────────")
    updated = update_all(rows)
    print(f"\n  ✓ Updated {updated} rows\n")

    print("── Done ─────────────────────────────────────────────────────────────────")
    print("  Next: run scripts/reembed.py to re-embed with the richer text.")

if __name__ == "__main__":
    main()
