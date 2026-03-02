#!/usr/bin/env python3
"""
reembed.py
──────────
Re-embeds all verses using richer text:
  translation + tafsir_summary (Quraish Shihab)
            + tafsir_kemenag[:600]
            + tafsir_ibnu_kathir_id[:600]

Each successive run enriches the vectors further. Safe to re-run at any time.

Run once from the project root:

  python3 scripts/reembed.py

Reads credentials from .env.
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

OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

EMBED_MODEL  = "text-embedding-3-large"
EMBED_DIMS   = 1536   # keeps pgvector schema unchanged; large model is still better quality
FETCH_BATCH  = 500    # rows per Supabase SELECT
EMBED_BATCH  = 100    # verses per OpenAI embedding request
UPDATE_BATCH = 50     # rows per Supabase RPC call (large payloads)

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_env():
    missing = [k for k in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        sys.exit(1)

def http_post(url, headers, body):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None

def supabase_headers(key):
    return {
        "Content-Type":  "application/json",
        "apikey":        key,
        "Authorization": f"Bearer {key}",
    }

# ── Phase 1: Fetch all verses from Supabase ───────────────────────────────────

def fetch_all_verses():
    verses  = []
    offset  = 0
    headers = supabase_headers(SUPABASE_SERVICE_KEY)
    headers["Range-Unit"] = "items"

    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/quran_verses"
            f"?select=id,translation,tafsir_summary,tafsir_kemenag,tafsir_ibnu_kathir_id"
            f"&order=id"
            f"&offset={offset}&limit={FETCH_BATCH}"
        )
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            batch = json.loads(resp.read())
        if not batch:
            break
        verses.extend(batch)
        offset += len(batch)
        if len(batch) < FETCH_BATCH:
            break
        time.sleep(0.1)

    return verses

# ── Phase 2: Build richer embed text ─────────────────────────────────────────

def build_embed_text(v):
    """Build the richest possible embed text from all available tafsir sources.

    Layer               Typical chars   Adds to vector
    ──────────────────  ─────────────   ─────────────────────────────────────
    translation (EN)        ~100        Literal meaning
    tafsir_summary          ~300        Emotional / contextual resonance (QS)
    tafsir_kemenag[:600]    ~600        Broad official Indonesian commentary
    tafsir_ibnu_kathir_id   ~600        Classical depth: hadith, asbabun nuzul

    Total stays well under 8k tokens. Each layer is optional — if not yet
    populated (e.g. IK translation still pending) it is simply skipped.
    """
    text = v["translation"] or ""
    if v.get("tafsir_summary"):
        text += " " + v["tafsir_summary"]
    if v.get("tafsir_kemenag"):
        text += " " + v["tafsir_kemenag"][:600]
    if v.get("tafsir_ibnu_kathir_id"):
        text += " " + v["tafsir_ibnu_kathir_id"][:600]
    return text.strip()

# ── Phase 3: Embed in batches ─────────────────────────────────────────────────

def embed_batch(texts):
    headers = {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }
    body = {"model": EMBED_MODEL, "input": texts, "dimensions": EMBED_DIMS, "encoding_format": "float"}
    resp = http_post("https://api.openai.com/v1/embeddings", headers, body)
    return [item["embedding"] for item in sorted(resp["data"], key=lambda x: x["index"])]

def embed_all(verses):
    embeddings = []
    total = len(verses)
    for start in range(0, total, EMBED_BATCH):
        batch = verses[start : start + EMBED_BATCH]
        texts = [build_embed_text(v) for v in batch]
        end   = min(start + EMBED_BATCH, total)
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

# ── Phase 4: Update embeddings via RPC ───────────────────────────────────────

def update_batch(rows):
    """Call update_embedding_batch RPC — updates only the embedding column."""
    url  = f"{SUPABASE_URL}/rest/v1/rpc/update_embedding_batch"
    body = {"updates": rows}
    http_post(url, supabase_headers(SUPABASE_SERVICE_KEY), body)

def update_all(verses, embeddings):
    rows    = []
    skipped = 0
    for v, emb in zip(verses, embeddings):
        if emb is None:
            skipped += 1
            continue
        # pgvector accepts "[f1,f2,...]" text representation
        rows.append({"id": v["id"], "embedding": str(emb)})

    total   = len(rows)
    updated = 0
    for start in range(0, total, UPDATE_BATCH):
        batch = rows[start : start + UPDATE_BATCH]
        end   = min(start + UPDATE_BATCH, total)
        print(f"  Updating {start+1}–{end}/{total} … ", end="", flush=True)
        try:
            update_batch(batch)
            updated += len(batch)
            print("✓")
        except Exception as e:
            print(f"✗  {e}")
        time.sleep(0.2)

    return updated, skipped

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    check_env()

    print("\n── Phase 1: Fetching all verses from Supabase ───────────────────────────")
    verses = fetch_all_verses()
    has_qs  = sum(1 for v in verses if v.get("tafsir_summary"))
    has_km  = sum(1 for v in verses if v.get("tafsir_kemenag"))
    has_ik  = sum(1 for v in verses if v.get("tafsir_ibnu_kathir_id"))
    print(f"  ✓ Fetched {len(verses)} verses")
    print(f"    Quraish Shihab : {has_qs}")
    print(f"    Kemenag RI     : {has_km}")
    print(f"    Ibnu Kathir ID : {has_ik}\n")

    print("── Phase 2 + 3: Re-embedding with translation + tafsir ──────────────────")
    embeddings = embed_all(verses)
    ok = sum(1 for e in embeddings if e is not None)
    print(f"\n  ✓ Embedded {ok}/{len(verses)} verses\n")

    print("── Phase 4: Updating embeddings in Supabase ─────────────────────────────")
    updated, skipped = update_all(verses, embeddings)
    print(f"\n  ✓ Updated {updated} rows  ({skipped} skipped due to embed failure)\n")

    print("── Done ─────────────────────────────────────────────────────────────────")
    print(f"  Vectors now encode translation + Quraish Shihab + Kemenag RI + Ibnu Kathir")
    print(f"  for {updated} verses. Search relevancy is now at maximum richness.")

if __name__ == "__main__":
    main()
