#!/usr/bin/env python3
"""
Translate asbabun_nuzul (English) → asbabun_nuzul_id (Bahasa Indonesia)
using the OpenAI Batch API (50% cheaper, async).

Flow:
  1. Fetch all verses that have English asbabun nuzul but no Indonesian yet
  2. Build a JSONL batch file
  3. Upload + submit to OpenAI Batch API
  4. Poll until complete (prints progress every 30 s)
  5. Parse results → update Supabase asbabun_nuzul_id

Usage:
  python3 scripts/translate_asbabun_nuzul.py
  python3 scripts/translate_asbabun_nuzul.py --poll <batch_id>   # resume polling
"""

import os, sys, json, time, argparse
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

# ── Load env ──────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_KEY   = os.environ["OPENAI_API_KEY"]

SB_HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}
OAI_HEADERS = {
    "Authorization": f"Bearer {OPENAI_KEY}",
    "Content-Type":  "application/json",
}

BATCH_FILE   = Path("/tmp/asbab_translate_batch.jsonl")
RESULTS_FILE = Path("/tmp/asbab_translate_results.jsonl")

# ── Prompt ────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
Kamu adalah penerjemah teks Asbabun Nuzul (latar belakang turunnya ayat Al-Qur'an) dari Bahasa Inggris ke Bahasa Indonesia.

Sumber teks ini dari kitab Asbab Al-Nuzul karya Al-Wahidi.

Aturan:
1. Terjemahkan SEMUA konten secara setia — jangan menghilangkan, meringkas, atau mengubah makna apapun.
2. Format output dalam Markdown yang rapi dan mudah dibaca:
   - ## untuk judul bagian utama (misal: ## Latar Belakang Turunnya Ayat)
   - ### untuk sub-bagian jika ada beberapa riwayat berbeda
   - **bold** untuk nama perawi, ulama, sahabat, dan istilah Islam penting
   - > blockquote untuk kutipan Hadits, kutipan ayat Al-Qur'an, dan perkataan sahabat
   - Paragraf biasa untuk narasi dan penjelasan
   - Gunakan baris kosong antar paragraf untuk keterbacaan
3. Gunakan Bahasa Indonesia yang alami dan jelas, sesuai untuk kajian Islam.
4. Pertahankan semua sanad (rantai perawi), nama perawi, dan referensi sumber.
5. Jangan menambahkan konten yang tidak ada dalam teks asli.
6. Jika teks menyebut kutipan ayat Al-Qur'an dalam bahasa Inggris, terjemahkan kutipan tersebut ke Bahasa Indonesia.
7. Jangan sertakan teks asli bahasa Inggris dalam output.\
"""

def user_msg(text: str) -> str:
    return f"Terjemahkan dan format ulang teks Asbabun Nuzul berikut ke Bahasa Indonesia:\n\n{text}"

# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_get(path: str) -> list:
    req = Request(f"{SUPABASE_URL}/rest/v1/{path}",
                  headers={**SB_HEADERS, "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_patch(verse_id: str, text: str):
    payload = json.dumps({"asbabun_nuzul_id": text}).encode()
    req = Request(
        f"{SUPABASE_URL}/rest/v1/quran_verses?id=eq.{verse_id}",
        data=payload, method="PATCH", headers=SB_HEADERS,
    )
    with urlopen(req, timeout=15) as r:
        r.read()

# ── OpenAI helpers ────────────────────────────────────────────────────────────
def oai_request(method: str, path: str, body=None, content_type="application/json"):
    url  = f"https://api.openai.com/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req  = Request(url, data=data, method=method,
                   headers={**OAI_HEADERS, "Content-Type": content_type})
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def upload_file(path: Path) -> str:
    """Upload JSONL batch file using multipart/form-data."""
    boundary = "----BatchBoundary"
    content  = path.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="purpose"\r\n\r\nbatch\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: application/jsonl\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()

    req = Request(
        "https://api.openai.com/v1/files",
        data=body, method="POST",
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type":  f"multipart/form-data; boundary={boundary}",
        },
    )
    with urlopen(req, timeout=120) as r:
        return json.loads(r.read())["id"]

def download_file(file_id: str, dest: Path):
    req = Request(f"https://api.openai.com/v1/files/{file_id}/content",
                  headers={"Authorization": f"Bearer {OPENAI_KEY}"})
    with urlopen(req, timeout=120) as r:
        dest.write_bytes(r.read())

# ── Phase 1: Fetch verses needing translation ─────────────────────────────────
def fetch_todo() -> list:
    print("\n── Phase 1: Fetching verses to translate ────────────────────────────────────")
    rows = sb_get(
        "quran_verses"
        "?select=id,asbabun_nuzul"
        "&asbabun_nuzul=not.is.null"
        "&asbabun_nuzul_id=is.null"
        "&order=id"
    )
    print(f"  {len(rows)} verses need translation")
    return rows

# ── Phase 2: Build JSONL batch file ──────────────────────────────────────────
def build_batch(rows: list):
    print(f"\n── Phase 2: Building batch file ({len(rows)} requests) ──────────────────────")
    lines = []
    for r in rows:
        vid  = r["id"]
        text = r["asbabun_nuzul"]
        # Dynamic max_tokens based on input length
        max_tokens = 8192 if len(text) > 4000 else 4096
        req = {
            "custom_id": vid,
            "method":    "POST",
            "url":       "/v1/chat/completions",
            "body": {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg(text)},
                ],
                "max_tokens":   max_tokens,
                "temperature":  0.3,
            },
        }
        lines.append(json.dumps(req, ensure_ascii=False))

    BATCH_FILE.write_text("\n".join(lines), encoding="utf-8")
    size_mb = BATCH_FILE.stat().st_size / 1_048_576
    print(f"  Batch file: {BATCH_FILE} ({size_mb:.1f} MB, {len(lines)} lines)")

# ── Phase 3: Upload + submit batch ───────────────────────────────────────────
def submit_batch() -> str:
    print("\n── Phase 3: Uploading batch file to OpenAI ──────────────────────────────────")
    file_id = upload_file(BATCH_FILE)
    print(f"  File uploaded: {file_id}")

    batch = oai_request("POST", "batches", {
        "input_file_id":  file_id,
        "endpoint":       "/v1/chat/completions",
        "completion_window": "24h",
    })
    batch_id = batch["id"]
    print(f"  Batch submitted: {batch_id}")
    print(f"  Status: {batch['status']}")
    print(f"\n  Save this batch ID to resume if needed:")
    print(f"     python3 scripts/translate_asbabun_nuzul.py --poll {batch_id}\n")
    return batch_id

# ── Phase 4: Poll until complete ─────────────────────────────────────────────
def poll_batch(batch_id: str) -> dict:
    print(f"\n── Phase 4: Polling batch {batch_id} ────────────────────────────────────────")
    while True:
        batch = oai_request("GET", f"batches/{batch_id}")
        status  = batch["status"]
        counts  = batch.get("request_counts", {})
        total   = counts.get("total", "?")
        done    = counts.get("completed", 0)
        failed  = counts.get("failed", 0)
        print(f"  [{time.strftime('%H:%M:%S')}] {status} — {done}/{total} done, {failed} failed")

        if status == "completed":
            return batch
        if status in ("failed", "expired", "cancelled"):
            print(f"  Batch {status}. Exiting.")
            sys.exit(1)
        time.sleep(30)

# ── Phase 5: Parse results + update Supabase ─────────────────────────────────
def apply_results(batch: dict):
    output_file_id = batch.get("output_file_id")
    if not output_file_id:
        print("  No output file in batch response.")
        sys.exit(1)

    print(f"\n── Phase 5: Downloading results ({output_file_id}) ──────────────────────────")
    download_file(output_file_id, RESULTS_FILE)
    lines = RESULTS_FILE.read_text(encoding="utf-8").splitlines()
    print(f"  {len(lines)} result lines downloaded")

    print("  Updating Supabase …")
    updated = 0
    failed  = 0
    for line in lines:
        obj = json.loads(line)
        vid = obj.get("custom_id", "")
        if obj.get("error"):
            print(f"  ✗ {vid}: {obj['error']}")
            failed += 1
            continue
        choices = obj.get("response", {}).get("body", {}).get("choices", [])
        if not choices:
            failed += 1
            continue
        text = choices[0].get("message", {}).get("content", "").strip()
        if text:
            try:
                sb_patch(vid, text)
                updated += 1
                if updated % 50 == 0:
                    print(f"    … {updated} updated")
            except Exception as e:
                print(f"  ✗ PATCH {vid}: {e}")
                failed += 1

    print(f"\n  Done: {updated} updated, {failed} failed")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--poll", metavar="BATCH_ID",
                        help="Skip to polling an existing batch ID")
    args = parser.parse_args()

    if args.poll:
        batch = poll_batch(args.poll)
        apply_results(batch)
    else:
        rows = fetch_todo()
        if not rows:
            print("  All verses already translated. Nothing to do.")
            return
        build_batch(rows)
        batch_id = submit_batch()
        batch    = poll_batch(batch_id)
        apply_results(batch)

    print("\n── Complete ─────────────────────────────────────────────────────────────────")
    print("  asbabun_nuzul_id populated in Supabase.")
    print("  The app will now show 'Kenapa Ayat Ini Diturunkan?' for these verses.\n")

if __name__ == "__main__":
    main()
