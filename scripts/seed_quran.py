#!/usr/bin/env python3
"""
seed_quran.py
─────────────
Fetches all 6,236 Quran verses from alquran.cloud, embeds them with
OpenAI text-embedding-3-small, and inserts them into Supabase.

Run once locally (takes ~3-5 minutes):

  OPENAI_API_KEY=sk-...          \\
  SUPABASE_URL=https://xxx.supabase.co  \\
  SUPABASE_SERVICE_KEY=eyJ...    \\
  python3 scripts/seed_quran.py

Re-running is safe: upsert on primary key conflict (ignores duplicates).
"""

import json, os, sys, time, urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────

OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

EMBED_MODEL   = "text-embedding-3-small"
EMBED_BATCH   = 100    # verses per OpenAI embedding request
INSERT_BATCH  = 50     # rows per Supabase insert request
MATCH_COUNT   = 15     # top-K for similarity search (used in api/get-ayat.js)

# Indonesian surah names (overrides the englishName from alquran.cloud)
SURAH_NAMES = {
  1:"Al-Fatihah", 2:"Al-Baqarah", 3:"Ali Imran", 4:"An-Nisa",
  5:"Al-Maidah", 6:"Al-An'am", 7:"Al-A'raf", 8:"Al-Anfal",
  9:"At-Taubah", 10:"Yunus", 11:"Hud", 12:"Yusuf",
  13:"Ar-Ra'd", 14:"Ibrahim", 15:"Al-Hijr", 16:"An-Nahl",
  17:"Al-Isra", 18:"Al-Kahfi", 19:"Maryam", 20:"Taha",
  21:"Al-Anbiya", 22:"Al-Hajj", 23:"Al-Mu'minun", 24:"An-Nur",
  25:"Al-Furqan", 26:"Asy-Syu'ara", 27:"An-Naml", 28:"Al-Qashash",
  29:"Al-Ankabut", 30:"Ar-Rum", 31:"Luqman", 32:"As-Sajdah",
  33:"Al-Ahzab", 34:"Saba", 35:"Fatir", 36:"Yasin",
  37:"Ash-Shaffat", 38:"Shad", 39:"Az-Zumar", 40:"Ghafir",
  41:"Fushshilat", 42:"Asy-Syura", 43:"Az-Zukhruf", 44:"Ad-Dukhan",
  45:"Al-Jatsiyah", 46:"Al-Ahqaf", 47:"Muhammad", 48:"Al-Fath",
  49:"Al-Hujurat", 50:"Qaf", 51:"Adz-Dzariyat", 52:"Ath-Thur",
  53:"An-Najm", 54:"Al-Qamar", 55:"Ar-Rahman", 56:"Al-Waqi'ah",
  57:"Al-Hadid", 58:"Al-Mujadila", 59:"Al-Hasyr", 60:"Al-Mumtahanah",
  61:"Ash-Shaff", 62:"Al-Jumu'ah", 63:"Al-Munafiqun", 64:"At-Taghabun",
  65:"At-Talaq", 66:"At-Tahrim", 67:"Al-Mulk", 68:"Al-Qalam",
  69:"Al-Haqqah", 70:"Al-Ma'arij", 71:"Nuh", 72:"Al-Jinn",
  73:"Al-Muzzammil", 74:"Al-Muddatstsir", 75:"Al-Qiyamah", 76:"Al-Insan",
  77:"Al-Mursalat", 78:"An-Naba", 79:"An-Nazi'at", 80:"'Abasa",
  81:"At-Takwir", 82:"Al-Infithar", 83:"Al-Muthaffifin", 84:"Al-Insyiqaq",
  85:"Al-Buruj", 86:"Ath-Thariq", 87:"Al-A'la", 88:"Al-Ghasyiyah",
  89:"Al-Fajr", 90:"Al-Balad", 91:"Asy-Syams", 92:"Al-Lail",
  93:"Ad-Duha", 94:"Al-Insyirah", 95:"At-Tin", 96:"Al-'Alaq",
  97:"Al-Qadr", 98:"Al-Bayyinah", 99:"Az-Zalzalah", 100:"Al-'Adiyat",
  101:"Al-Qari'ah", 102:"At-Takatsur", 103:"Al-'Ashr", 104:"Al-Humazah",
  105:"Al-Fil", 106:"Quraisy", 107:"Al-Ma'un", 108:"Al-Kautsar",
  109:"Al-Kafirun", 110:"An-Nashr", 111:"Al-Masad", 112:"Al-Ikhlas",
  113:"Al-Falaq", 114:"An-Nas",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_env():
    missing = [k for k in ("OPENAI_API_KEY","SUPABASE_URL","SUPABASE_SERVICE_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        sys.exit(1)

def http_post(url, headers, body):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def http_get(url):
    with urllib.request.urlopen(url, timeout=20) as resp:
        return json.loads(resp.read().decode())

# ── Phase 1: Fetch all verses ─────────────────────────────────────────────────

def load_tafsir_map():
    """Load tafsir_summary for the 64 curated verses."""
    path = os.path.join(os.path.dirname(__file__), "../data/verses.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        curated = json.load(f)
    return {v["id"]: v.get("tafsir_summary") for v in curated}

def fetch_surah(n):
    url  = f"https://api.alquran.cloud/v1/surah/{n}/editions/quran-simple,id.indonesian"
    data = http_get(url)
    if data.get("code") != 200:
        raise ValueError(f"alquran.cloud error for surah {n}: {data.get('status')}")
    arabic_ayahs = data["data"][0]["ayahs"]
    indo_ayahs   = data["data"][1]["ayahs"]
    return arabic_ayahs, indo_ayahs

def fetch_all_verses(tafsir_map):
    verses = []
    for n in range(1, 115):
        print(f"  [{n:3}/114] Fetching {SURAH_NAMES[n]} … ", end="", flush=True)
        try:
            arabic_ayahs, indo_ayahs = fetch_surah(n)
            for ar, id_ in zip(arabic_ayahs, indo_ayahs):
                verse_id = f"{n}:{ar['numberInSurah']}"
                verses.append({
                    "id":             verse_id,
                    "surah_number":   n,
                    "surah_name":     SURAH_NAMES[n],
                    "verse_number":   ar["numberInSurah"],
                    "arabic":         ar["text"],
                    "translation":    id_["text"],
                    "tafsir_summary": tafsir_map.get(verse_id),
                })
            print(f"✓ ({len(arabic_ayahs)} ayat)")
        except Exception as e:
            print(f"✗  {e}")
        time.sleep(0.4)
    return verses

# ── Phase 2: Build embed texts ────────────────────────────────────────────────

def build_embed_text(v):
    text = f"{v['surah_name']} ayat {v['verse_number']}. {v['translation']}"
    # For curated verses, append tafsir so their embeddings are richer
    if v.get("tafsir_summary"):
        text += f" {v['tafsir_summary']}"
    return text

# ── Phase 3: Embed in batches ─────────────────────────────────────────────────

def embed_batch(texts):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }
    body = {"model": EMBED_MODEL, "input": texts, "encoding_format": "float"}
    resp = http_post("https://api.openai.com/v1/embeddings", headers, body)
    # Sort by index to match input order
    return [item["embedding"] for item in sorted(resp["data"], key=lambda x: x["index"])]

def embed_all(verses):
    embeddings = []
    total = len(verses)
    for start in range(0, total, EMBED_BATCH):
        batch  = verses[start : start + EMBED_BATCH]
        texts  = [build_embed_text(v) for v in batch]
        end    = min(start + EMBED_BATCH, total)
        print(f"  Embedding {start+1}–{end}/{total} … ", end="", flush=True)
        try:
            vecs = embed_batch(texts)
            embeddings.extend(vecs)
            print("✓")
        except Exception as e:
            print(f"✗  {e}")
            embeddings.extend([None] * len(batch))
        time.sleep(0.3)
    return embeddings

# ── Phase 4: Insert to Supabase ───────────────────────────────────────────────

def insert_batch(rows):
    url = f"{SUPABASE_URL}/rest/v1/quran_verses"
    headers = {
        "Content-Type": "application/json",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Prefer":        "resolution=ignore-duplicates",  # idempotent re-runs
    }
    http_post(url, headers, rows)

def insert_all(verses, embeddings):
    rows    = []
    skipped = 0
    for v, emb in zip(verses, embeddings):
        if emb is None:
            skipped += 1
            continue
        rows.append({
            "id":             v["id"],
            "surah_number":   v["surah_number"],
            "surah_name":     v["surah_name"],
            "verse_number":   v["verse_number"],
            "arabic":         v["arabic"],
            "translation":    v["translation"],
            "tafsir_summary": v["tafsir_summary"],
            "embedding":      emb,
        })

    total = len(rows)
    inserted = 0
    for start in range(0, total, INSERT_BATCH):
        batch = rows[start : start + INSERT_BATCH]
        end   = min(start + INSERT_BATCH, total)
        print(f"  Inserting {start+1}–{end}/{total} … ", end="", flush=True)
        try:
            insert_batch(batch)
            inserted += len(batch)
            print("✓")
        except Exception as e:
            print(f"✗  {e}")
        time.sleep(0.2)

    return inserted, skipped

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    check_env()

    print("\n── Phase 1: Fetching verses from alquran.cloud ─────────────────────────")
    tafsir_map = load_tafsir_map()
    print(f"  Loaded tafsir_summary for {len(tafsir_map)} curated verses")
    verses = fetch_all_verses(tafsir_map)
    print(f"\n  ✓ Fetched {len(verses)} verses across 114 surahs\n")

    print("── Phase 2 + 3: Embedding with text-embedding-3-small ──────────────────")
    embeddings = embed_all(verses)
    ok_count = sum(1 for e in embeddings if e is not None)
    print(f"\n  ✓ Embedded {ok_count}/{len(verses)} verses\n")

    print("── Phase 4: Inserting into Supabase ─────────────────────────────────────")
    inserted, skipped = insert_all(verses, embeddings)
    print(f"\n  ✓ Inserted {inserted} rows  ({skipped} skipped due to embed failure)\n")

    print("── Done ─────────────────────────────────────────────────────────────────")
    print(f"  {inserted} verses now in Supabase.")
    print("  Next: run the IVFFlat index SQL in Supabase SQL Editor:")
    print()
    print("    create index on quran_verses")
    print("      using ivfflat (embedding vector_cosine_ops)")
    print("      with (lists = 100);")
    print()

if __name__ == "__main__":
    main()
