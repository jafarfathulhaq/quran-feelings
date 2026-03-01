#!/usr/bin/env python3
"""
update_tafsir.py
────────────────
Fetches Tafsir Muntakhab (Muhammad Quraish Shihab et al.) for all 6,236
verses from alquran.cloud and updates the tafsir_summary column in Supabase.

The verses + embeddings are already in the DB — this script only patches
the tafsir_summary column, leaving everything else untouched.

Run once from the project root:

  python3 scripts/update_tafsir.py

Reads credentials from .env (same file used by seed_quran.py).
Re-running is safe: upsert on primary key just overwrites tafsir_summary.
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
TAFSIR_EDITION       = "id.muntakhab"   # Quraish Shihab et al.
INSERT_BATCH         = 100              # rows per Supabase upsert

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_env():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        sys.exit(1)

def http_get(url):
    with urllib.request.urlopen(url, timeout=20) as resp:
        return json.loads(resp.read().decode())

def upsert_batch(rows):
    """Call update_tafsir_batch RPC — pure UPDATE, leaves all other columns untouched."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/update_tafsir_batch"
    data = json.dumps({"updates": rows}).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp.read()   # 200/204 — body may be empty
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:200]}")

# ── Phase 1: Fetch tafsir per surah ───────────────────────────────────────────

def fetch_tafsir(surah_number):
    url = f"https://api.alquran.cloud/v1/surah/{surah_number}/{TAFSIR_EDITION}"
    data = http_get(url)
    if data.get("code") != 200:
        raise ValueError(f"alquran.cloud error for surah {surah_number}: {data.get('status')}")
    return data["data"]["ayahs"]   # list of {numberInSurah, text, ...}

# ── Phase 2: Upsert into Supabase ─────────────────────────────────────────────

def update_all():
    check_env()

    all_rows = []
    total_surahs = 114

    print(f"\n── Fetching tafsir ({TAFSIR_EDITION}) from alquran.cloud ─────────────────")
    for n in range(1, total_surahs + 1):
        print(f"  [{n:3}/114] Surah {n} … ", end="", flush=True)
        try:
            ayahs = fetch_tafsir(n)
            for ayah in ayahs:
                all_rows.append({
                    "id":             f"{n}:{ayah['numberInSurah']}",
                    "tafsir_summary": ayah["text"],
                })
            print(f"✓ ({len(ayahs)} ayat)")
        except Exception as e:
            print(f"✗  {e}")
        time.sleep(0.3)

    print(f"\n  ✓ Fetched tafsir for {len(all_rows)} verses\n")

    print("── Upserting tafsir_summary into Supabase ───────────────────────────────")
    total     = len(all_rows)
    updated   = 0
    failed    = 0

    for start in range(0, total, INSERT_BATCH):
        batch = all_rows[start : start + INSERT_BATCH]
        end   = min(start + INSERT_BATCH, total)
        print(f"  Updating {start+1}–{end}/{total} … ", end="", flush=True)
        try:
            upsert_batch(batch)
            updated += len(batch)
            print("✓")
        except Exception as e:
            failed += len(batch)
            print(f"✗  {e}")
        time.sleep(0.15)

    print(f"\n  ✓ Updated {updated} rows  ({failed} failed)\n")
    print("── Done ─────────────────────────────────────────────────────────────────")
    print(f"  tafsir_summary (Quraish Shihab) now set for {updated} verses.")

if __name__ == "__main__":
    update_all()
