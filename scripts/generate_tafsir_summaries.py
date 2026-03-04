#!/usr/bin/env python3
"""
generate_tafsir_summaries.py
────────────────────────────
Generates structured tafsir summaries for all verses that don't have one yet,
using the OpenAI Batch API (gpt-4o-mini).

Flow:
  1. Fetch verses WHERE tafsir_summary IS NULL from Supabase
  2. Build JSONL request file for OpenAI Batch API
  3. Upload file, create batch, poll until complete
  4. Download results, validate, update Supabase
  5. Save request + result files to scripts/batch_output/ for debugging

Run from the project root:

  python3 scripts/generate_tafsir_summaries.py

Re-running is safe: only processes verses with tafsir_summary IS NULL.
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
OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")

FETCH_BATCH    = 1000   # rows per Supabase REST fetch
UPDATE_BATCH   = 100    # rows per Supabase PATCH cycle
UPDATE_SLEEP   = 0.15   # seconds between PATCH batches
POLL_INTERVAL  = 60     # seconds between batch status polls

BATCH_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "batch_output")

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Kamu adalah penyusun ringkasan tafsir untuk aplikasi TemuQuran. Tugasmu: membuat ringkasan terstruktur yang mudah dipahami, HANYA berdasarkan sumber tafsir yang diberikan.

═══════════════════════════════════════
GAYA PENULISAN
═══════════════════════════════════════

Gunakan gaya Tafsir Muntakhab (Quraish Shihab): sederhana, hangat, langsung ke inti. Jangan meniru retorika panjangnya — ambil kejelasan dan kehangatannya saja.

Aturan kalimat:
- Maksimal 20 kata per kalimat
- Batas karakter per field adalah acuan UTAMA — jika karakter sudah cukup, berhenti
- Kalimat harus natural dan mengalir, jangan terpotong paksa

Hindari pembuka generik:
❌ "Ayat ini mengajarkan bahwa..."
❌ "Ayat ini menjelaskan bahwa..."
❌ "Dalam ayat ini, Allah..."
✅ Langsung ke makna. Contoh: "Allah sangat dekat dengan hamba-Nya."

═══════════════════════════════════════
ATURAN SUMBER — WAJIB DIPATUHI
═══════════════════════════════════════

1. HANYA gunakan informasi dari sumber yang diberikan (Kemenag, Ibnu Katsir, Quraish Shihab, Asbabun Nuzul). JANGAN menambahkan:
   - Hadits yang tidak ada dalam sumber
   - Pendapat ulama di luar sumber
   - Penafsiran atau opinimu sendiri
   - Referensi eksternal apa pun

2. ATURAN KETAT: Jika suatu informasi TIDAK tertulis secara eksplisit atau implisit dalam sumber tafsir yang diberikan, JANGAN masukkan — meskipun informasi itu benar secara umum dalam Islam. Contoh yang DILARANG:
   ❌ "Dalam Islam, doa adalah ibadah yang sangat dianjurkan"
   ❌ "Sebagai umat Muslim, kita diajarkan untuk..."
   ❌ "Al-Qur'an menekankan pentingnya..."
   Kalimat-kalimat ini terdengar benar tapi BUKAN dari sumber — jangan gunakan.

3. Jika sumber mengutip hadits, ambil PELAJARAN-nya saja:
   ❌ "Rasulullah bersabda: 'Tidak ada seorang Muslim yang berdoa...'"
   ✅ "Setiap doa yang tulus pasti mendapat respons dari Allah."

4. Jika sumber memiliki penekanan yang BERBEDA, sebutkan ringkas:
   ✅ "Quraish Shihab menekankan kedekatan Allah, sementara Kemenag menyoroti syarat doa."

5. Sumber kosong → ABAIKAN. Jangan menyebut bahwa sumber tidak tersedia.

6. Asbabun nuzul bergaya mistis/puitis → ambil INTI SEJARAH saja (siapa, apa, kapan, mengapa).

7. Jika Quraish Shihab tersedia, gunakan sebagai acuan kesederhanaan bahasa — bukan untuk ditiru kata per kata.

═══════════════════════════════════════
ATURAN ANTI-OVERLAP ANTAR FIELD
═══════════════════════════════════════

Setiap field HARUS memiliki fokus yang berbeda. Jangan mengulang ide atau kalimat yang sudah muncul di field lain.

- makna_utama → DESKRIPTIF: Apa yang Allah sampaikan dalam ayat ini?
- hidup_kita → APLIKATIF: Bagaimana penerapannya dalam kehidupan sehari-hari? Jangan mengulang ringkasan makna.
- konteks_turun → HISTORIS: Apa latar belakang turunnya ayat? (atau null)
- penjelasan_penting → NUANSA BARU: Detail yang belum disebut di atas — makna kata kunci, perbedaan penekanan antar sumber, sudut pandang tambahan. Jangan mengulang isi field lain.

Jika kamu mendapati dirimu menulis hal yang mirip dengan field sebelumnya, BERHENTI dan cari sudut pandang baru dari sumber.

═══════════════════════════════════════
FORMAT OUTPUT
═══════════════════════════════════════

JSON saja. Tanpa markdown, tanpa backtick, tanpa preamble.

{
  "makna_utama": {
    "text": "...",
    "sources": [...]
  },
  "hidup_kita": {
    "text": "...",
    "sources": [...]
  },
  "konteks_turun": {
    "text": "..." atau null,
    "sources": [...]
  },
  "penjelasan_penting": {
    "text": "..." atau null,
    "sources": [...]
  }
}

Aturan per field:

makna_utama (WAJIB, 150–250 karakter):
- 2-3 kalimat deskriptif tentang inti ayat
- Langsung ke makna, tanpa pembuka generik

hidup_kita (WAJIB, 200–350 karakter):
- 2-3 poin aplikatif: "Pertama,... Kedua,... Ketiga,..."
- Harus bersifat PRAKTIS — apa yang bisa dilakukan pembaca?
- Untuk ayat naratif/kisah: ambil hikmah yang bisa diterapkan
- Untuk ayat hukum: jelaskan relevansinya dalam kehidupan
- JANGAN mengulang isi makna_utama dengan kata berbeda

konteks_turun (150–250 karakter, atau null):
- 2-3 kalimat tentang latar belakang turunnya ayat
- null jika asbabun nuzul kosong atau tidak tersedia
- Jangan memaksakan konteks jika data tidak ada

penjelasan_penting (150–250 karakter, atau null):
- Isi jika ada SALAH SATU dari:
  • Makna kata kunci Arab yang memperdalam pemahaman
  • Perbedaan penekanan atau sudut pandang antar sumber tafsir
  • Detail tafsir yang belum tercakup di makna_utama dan hidup_kita
- null HANYA jika benar-benar tidak ada tambahan signifikan
- JANGAN mengulang isi field lain

"sources": hanya sumber yang BENAR-BENAR digunakan. Pilihan: "kemenag", "ibnu_kathir", "quraish_shihab", "asbabun_nuzul"

═══════════════════════════════════════
STABILITAS UNTUK SEMUA JENIS AYAT
═══════════════════════════════════════

Prompt ini harus bekerja stabil untuk SEMUA jenis ayat:

Ayat hukum (misal: tentang puasa, zakat, nikah):
- makna_utama: jelaskan ketentuan yang ditetapkan
- hidup_kita: relevansi hukum tersebut dalam kehidupan modern
- penjelasan_penting: perbedaan penafsiran jika ada

Ayat kisah/naratif (misal: kisah Nabi, kaum terdahulu):
- makna_utama: ringkasan inti kisah
- hidup_kita: hikmah dan pelajaran dari kisah tersebut
- penjelasan_penting: detail nama/tempat/peristiwa penting

Ayat akidah (misal: sifat Allah, hari akhir):
- makna_utama: konsep yang ditegaskan
- hidup_kita: dampak keyakinan ini pada perilaku sehari-hari
- penjelasan_penting: makna kata kunci terkait akidah

Ayat sangat singkat (misal: surat pendek di Juz Amma):
- Tetap isi minimal makna_utama dan hidup_kita
- Jika sumber tafsir juga singkat, ringkasan boleh lebih pendek dari batas karakter — jangan memaksakan panjang

Ayat tanpa asbabun nuzul:
- konteks_turun = null (jangan fabrikasi)

═══════════════════════════════════════
KESALAHAN YANG HARUS DIHINDARI
═══════════════════════════════════════

❌ Menambahkan informasi yang tidak ada dalam sumber — termasuk pengetahuan umum Islam
❌ Mengutip teks hadits secara langsung
❌ Menggunakan pembuka "Ayat ini mengajarkan/menjelaskan bahwa..."
❌ Mengulang ide yang sama di field berbeda dengan kata berbeda
❌ Mengisi konteks_turun jika asbabun nuzul kosong
❌ Menulis kalimat lebih dari 20 kata
❌ Melebihi batas karakter per field
❌ Menggunakan bahasa terlalu akademis atau terlalu santai
❌ Menyebutkan bahwa sumber "tidak tersedia"
❌ Menyalin kalimat langsung dari sumber tanpa parafrasa
❌ Mengabaikan Quraish Shihab ketika tersedia
❌ Memaksakan penjelasan_penting = null ketika ada nuansa yang layak diangkat
❌ Menggeneralisasi berlebihan untuk ayat naratif atau hukum"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_env():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}")
        sys.exit(1)

def supabase_get(path):
    """GET request to Supabase REST API."""
    url = f"{SUPABASE_URL}{path}"
    req = urllib.request.Request(url, method="GET", headers={
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def supabase_patch(path, body):
    """PATCH request to Supabase REST API."""
    url = f"{SUPABASE_URL}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Prefer":        "return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:200]}")

def openai_request(method, path, body=None, file_upload=None):
    """Make a request to the OpenAI API. Returns parsed JSON for JSON responses, raw bytes otherwise."""
    url = f"https://api.openai.com{path}"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}

    if file_upload:
        # multipart/form-data upload
        boundary = "----BatchUploadBoundary"
        parts = []
        for key, val in file_upload.items():
            if key == "file":
                filename, filedata = val
                parts.append(
                    f"--{boundary}\r\n"
                    f"Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
                    f"Content-Type: application/jsonl\r\n\r\n".encode() + filedata + b"\r\n"
                )
            else:
                parts.append(
                    f"--{boundary}\r\n"
                    f"Content-Disposition: form-data; name=\"{key}\"\r\n\r\n"
                    f"{val}\r\n".encode()
                )
        data = b"".join(p if isinstance(p, bytes) else p.encode() for p in parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        data = None

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    # Use longer timeout for file uploads (102MB JSONL)
    req_timeout = 600 if file_upload else 120
    try:
        with urllib.request.urlopen(req, timeout=req_timeout) as resp:
            raw = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return json.loads(raw.decode())
            return raw
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI HTTP {e.code}: {e.read().decode()[:500]}")

def ensure_output_dir():
    os.makedirs(BATCH_OUTPUT_DIR, exist_ok=True)

# ── Phase 1: Fetch verses from Supabase ──────────────────────────────────────

def fetch_verses():
    """Fetch all verses where tafsir_summary IS NULL, paginated."""
    columns = "id,surah_number,surah_name,verse_number,arabic,translation,tafsir_kemenag,tafsir_ibnu_kathir_id,tafsir_quraish_shihab,asbabun_nuzul_id"
    all_verses = []
    offset = 0

    print("\n── Phase 1: Fetching verses (tafsir_summary IS NULL) ──────────────────")

    while True:
        path = (
            f"/rest/v1/quran_verses"
            f"?select={columns}"
            f"&tafsir_summary=is.null"
            f"&order=id"
            f"&offset={offset}"
            f"&limit={FETCH_BATCH}"
        )
        batch = supabase_get(path)
        if not batch:
            break
        all_verses.extend(batch)
        print(f"  Fetched {len(all_verses)} verses so far …", flush=True)
        if len(batch) < FETCH_BATCH:
            break
        offset += FETCH_BATCH

    print(f"  ✓ Total verses to process: {len(all_verses)}\n")
    return all_verses

# ── Phase 2: Build JSONL file ────────────────────────────────────────────────

def build_user_message(v):
    """Build the user message for a single verse."""
    return (
        f"Surat: {v['surah_name']} ({v['surah_number']}), Ayat: {v['verse_number']}\n"
        f"\n"
        f"Teks Arab:\n"
        f"{v['arabic']}\n"
        f"\n"
        f"Terjemahan Indonesia:\n"
        f"{v['translation']}\n"
        f"\n"
        f"Tafsir Kemenag:\n"
        f"{v['tafsir_kemenag'] or '(tidak tersedia)'}\n"
        f"\n"
        f"Tafsir Ibnu Katsir (Indonesia):\n"
        f"{v['tafsir_ibnu_kathir_id'] or '(tidak tersedia)'}\n"
        f"\n"
        f"Tafsir Quraish Shihab:\n"
        f"{v['tafsir_quraish_shihab'] or '(tidak tersedia)'}\n"
        f"\n"
        f"Asbabun Nuzul:\n"
        f"{v['asbabun_nuzul_id'] or '(tidak tersedia)'}"
    )

def build_jsonl(verses):
    """Build JSONL content for OpenAI Batch API and save to file."""
    print("── Phase 2: Building JSONL request file ────────────────────────────────")

    lines = []
    for v in verses:
        request_obj = {
            "custom_id": v["id"],
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_message(v)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
                "max_tokens": 600,
            },
        }
        lines.append(json.dumps(request_obj, ensure_ascii=False))

    jsonl_content = "\n".join(lines)

    ensure_output_dir()
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    jsonl_path = os.path.join(BATCH_OUTPUT_DIR, f"batch_request_{timestamp}.jsonl")
    with open(jsonl_path, "w", encoding="utf-8") as f:
        f.write(jsonl_content)

    print(f"  ✓ Built {len(lines)} requests → {jsonl_path}\n")
    return jsonl_content.encode("utf-8"), jsonl_path, timestamp

# ── Phase 3: Upload, create batch, poll ──────────────────────────────────────

def upload_and_run_batch(jsonl_bytes):
    """Upload JSONL file, create batch, poll until done. Returns result file ID."""
    print("── Phase 3: OpenAI Batch API ───────────────────────────────────────────")

    # Upload file
    print("  Uploading JSONL file …", end=" ", flush=True)
    upload_resp = openai_request("POST", "/v1/files", file_upload={
        "purpose": "batch",
        "file": ("batch_request.jsonl", jsonl_bytes),
    })
    file_id = upload_resp["id"]
    print(f"✓ file_id={file_id}")

    # Create batch
    print("  Creating batch …", end=" ", flush=True)
    batch_resp = openai_request("POST", "/v1/batches", body={
        "input_file_id": file_id,
        "endpoint": "/v1/chat/completions",
        "completion_window": "24h",
    })
    batch_id = batch_resp["id"]
    print(f"✓ batch_id={batch_id}")

    # Poll for completion
    print(f"  Polling every {POLL_INTERVAL}s …")
    while True:
        status_resp = openai_request("GET", f"/v1/batches/{batch_id}")
        status = status_resp["status"]
        completed = status_resp.get("request_counts", {}).get("completed", 0)
        total = status_resp.get("request_counts", {}).get("total", 0)
        failed = status_resp.get("request_counts", {}).get("failed", 0)

        print(f"    status={status}  completed={completed}/{total}  failed={failed}", flush=True)

        if status == "completed":
            output_file_id = status_resp.get("output_file_id")
            error_file_id = status_resp.get("error_file_id")
            print(f"  ✓ Batch completed! output_file_id={output_file_id}")
            if error_file_id:
                print(f"    error_file_id={error_file_id}")
            return output_file_id, error_file_id
        elif status in ("failed", "expired", "cancelled", "cancelling"):
            raise RuntimeError(f"Batch {batch_id} ended with status: {status}")

        time.sleep(POLL_INTERVAL)

# ── Phase 4: Download and parse results ──────────────────────────────────────

def download_results(output_file_id, error_file_id, timestamp):
    """Download batch results and optionally error file. Returns list of (custom_id, parsed_json_or_None, error_msg)."""
    print("\n── Phase 4: Downloading results ────────────────────────────────────────")
    ensure_output_dir()

    # Download output file
    print("  Downloading output file …", end=" ", flush=True)
    raw = openai_request("GET", f"/v1/files/{output_file_id}/content")
    output_path = os.path.join(BATCH_OUTPUT_DIR, f"batch_result_{timestamp}.jsonl")
    with open(output_path, "wb") as f:
        f.write(raw)
    print(f"✓ → {output_path}")

    # Download error file if present
    if error_file_id:
        print("  Downloading error file …", end=" ", flush=True)
        try:
            err_raw = openai_request("GET", f"/v1/files/{error_file_id}/content")
            err_path = os.path.join(BATCH_OUTPUT_DIR, f"batch_errors_{timestamp}.jsonl")
            with open(err_path, "wb") as f:
                f.write(err_raw)
            print(f"✓ → {err_path}")
        except Exception as e:
            print(f"✗ {e}")

    # Parse results
    results = []
    for line in raw.decode("utf-8").strip().split("\n"):
        if not line.strip():
            continue
        obj = json.loads(line)
        custom_id = obj["custom_id"]
        response = obj.get("response", {})
        status_code = response.get("status_code")
        error_msg = None
        parsed = None

        if status_code == 200:
            try:
                body = response["body"]
                content = body["choices"][0]["message"]["content"]
                parsed = json.loads(content)
            except (KeyError, IndexError, json.JSONDecodeError) as e:
                error_msg = f"Parse error: {e}"
        else:
            error_body = response.get("body", {})
            error_msg = f"HTTP {status_code}: {json.dumps(error_body)[:200]}"

        results.append((custom_id, parsed, error_msg))

    print(f"  ✓ Parsed {len(results)} results\n")
    return results

# ── Phase 5: Validate results ────────────────────────────────────────────────

VALID_SOURCES = {"kemenag", "ibnu_kathir", "quraish_shihab", "asbabun_nuzul"}

def validate_result(custom_id, data):
    """Validate a single parsed result. Returns (is_valid, warnings)."""
    warnings = []

    if data is None:
        return False, ["no data"]

    # Check required fields
    for field in ("makna_utama", "hidup_kita"):
        val = data.get(field)
        if not isinstance(val, dict):
            return False, [f"{field} missing or not a dict"]
        text = val.get("text")
        if not isinstance(text, str) or not text.strip():
            return False, [f"{field}.text is empty"]
        sources = val.get("sources")
        if not isinstance(sources, list):
            return False, [f"{field}.sources is not a list"]
        # Relaxed char length check
        tlen = len(text)
        if tlen < 80 or tlen > 500:
            warnings.append(f"{field}.text length={tlen} (outside 80-500)")

    # Check optional fields
    for field in ("konteks_turun", "penjelasan_penting"):
        val = data.get(field)
        if val is None:
            continue  # null is fine
        if not isinstance(val, dict):
            return False, [f"{field} is not a dict or null"]
        text = val.get("text")
        if text is None:
            continue  # {"text": null, "sources": [...]} — treat as null-ish
        if not isinstance(text, str):
            return False, [f"{field}.text is not a string"]
        if text.strip():
            sources = val.get("sources")
            if not isinstance(sources, list):
                return False, [f"{field}.sources is not a list"]
            tlen = len(text)
            if tlen < 80 or tlen > 500:
                warnings.append(f"{field}.text length={tlen} (outside 80-500)")

    return True, warnings

# ── Phase 6: Update Supabase ─────────────────────────────────────────────────

def update_supabase(valid_results):
    """Batch-update tafsir_summary in Supabase."""
    print("── Phase 6: Updating Supabase ──────────────────────────────────────────")

    total = len(valid_results)
    updated = 0
    failed = 0

    for start in range(0, total, UPDATE_BATCH):
        batch = valid_results[start : start + UPDATE_BATCH]
        end = min(start + UPDATE_BATCH, total)
        print(f"  Updating {start+1}–{end}/{total} …", end=" ", flush=True)

        batch_failed = 0
        for verse_id, summary_data in batch:
            try:
                path = f"/rest/v1/quran_verses?id=eq.{verse_id}"
                supabase_patch(path, {"tafsir_summary": summary_data})
            except Exception as e:
                batch_failed += 1
                print(f"\n    ✗ {verse_id}: {e}", end="", flush=True)

        batch_ok = len(batch) - batch_failed
        updated += batch_ok
        failed += batch_failed
        if batch_failed == 0:
            print("✓")
        else:
            print(f" ({batch_failed} failed)")

        time.sleep(UPDATE_SLEEP)

    print(f"  ✓ Updated {updated} rows  ({failed} failed)\n")
    return updated, failed

# ── Main ─────────────────────────────────────────────────────────────────────

# OpenAI gpt-4o-mini batch enqueued token limit is 2M.
# Each verse request is ~3-5k tokens (tafsir content), so ~350 verses per chunk.
CHUNK_SIZE = 350

def process_chunk(chunk_verses, chunk_num, total_chunks):
    """Process a single chunk of verses through the batch pipeline."""
    print(f"\n{'='*72}")
    print(f"  CHUNK {chunk_num}/{total_chunks}  ({len(chunk_verses)} verses)")
    print(f"{'='*72}")

    # Build JSONL for this chunk
    jsonl_bytes, jsonl_path, timestamp = build_jsonl(chunk_verses)

    # Upload & run batch
    output_file_id, error_file_id = upload_and_run_batch(jsonl_bytes)

    # Download results
    results = download_results(output_file_id, error_file_id, timestamp)

    # Validate
    print("── Validating results ──────────────────────────────────────────────────")
    valid_results = []
    invalid_count = 0
    warn_count = 0

    for custom_id, parsed, error_msg in results:
        if error_msg:
            print(f"  ✗ {custom_id}: {error_msg}")
            invalid_count += 1
            continue

        is_valid, warnings = validate_result(custom_id, parsed)
        if not is_valid:
            print(f"  ✗ {custom_id}: validation failed — {'; '.join(warnings)}")
            invalid_count += 1
            continue

        if warnings:
            warn_count += 1
            for w in warnings:
                print(f"  ⚠ {custom_id}: {w}")

        valid_results.append((custom_id, parsed))

    print(f"  ✓ Valid: {len(valid_results)}  Invalid: {invalid_count}  Warnings: {warn_count}\n")

    # Update Supabase
    updated, update_failed = 0, 0
    if valid_results:
        updated, update_failed = update_supabase(valid_results)
    else:
        print("  No valid results to update.\n")

    return len(valid_results), invalid_count + update_failed


def main():
    check_env()

    # Phase 1: Fetch
    verses = fetch_verses()
    if not verses:
        print("  Nothing to process — all verses already have tafsir_summary.")
        print("── Done ─────────────────────────────────────────────────────────────────")
        return

    # Split into chunks to stay under 2M enqueued token limit
    chunks = [verses[i:i + CHUNK_SIZE] for i in range(0, len(verses), CHUNK_SIZE)]
    total_chunks = len(chunks)
    print(f"\n  Splitting {len(verses)} verses into {total_chunks} chunks of ≤{CHUNK_SIZE}")

    total_ok = 0
    total_fail = 0

    for i, chunk in enumerate(chunks, 1):
        ok, fail = process_chunk(chunk, i, total_chunks)
        total_ok += ok
        total_fail += fail

    # Final report
    print(f"\n{'='*72}")
    print("── FINAL REPORT ────────────────────────────────────────────────────────")
    print(f"  Total fetched:       {len(verses)}")
    print(f"  Chunks processed:    {total_chunks}")
    print(f"  Updated in DB:       {total_ok}")
    print(f"  Failed (total):      {total_fail}")
    print(f"  Results dir:         {BATCH_OUTPUT_DIR}")
    print("── Done ─────────────────────────────────────────────────────────────────")

if __name__ == "__main__":
    main()
