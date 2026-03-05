#!/usr/bin/env python3
"""
Seed script for Ajarkan Anakku content.

Parses the 325-question dataset, finds relevant Qur'anic verses via HyDE +
vector search, GPT-4o selects the best 2-3 verses, then GPT-4o generates
age-appropriate content for each question × age group.

Usage:
  python scripts/seed_ajarkan.py                          # Full run (all 325 × 2 age groups)
  python scripts/seed_ajarkan.py --test                   # Test mode: 3 questions only
  python scripts/seed_ajarkan.py --dry-run                # Output to scripts/output/ajarkan_review.json
  python scripts/seed_ajarkan.py --question-id sholat-02  # Re-run single question
  python scripts/seed_ajarkan.py --category aqidah        # Run only one category
  python scripts/seed_ajarkan.py --batch                  # Use OpenAI Batch API (cheaper)

Environment variables required:
  OPENAI_API_KEY      — OpenAI API key
  SUPABASE_URL        — Supabase project URL
  SUPABASE_SERVICE_KEY — Supabase service role key (not anon)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

def load_env():
    path = Path(__file__).parent.parent / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

load_env()

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

CONTENT_MODEL = 'gpt-4o'
SELECTOR_MODEL = 'gpt-4o-mini'
EMBEDDING_MODEL = 'text-embedding-3-large'
EMBEDDING_DIMS = 1536
AGE_GROUPS = ['under7', '7plus']
VECTOR_SEARCH_COUNT = 15
POLL_INTERVAL = 60

OUTPUT_DIR = Path(__file__).parent / 'output'
BATCH_OUTPUT_DIR = Path(__file__).parent / 'batch_output'

# Cache: question_id → list of selected verses (shared across age groups)
_verse_cache = {}

# ── HTTP Helpers ────────────────────────────────────────────────────────────

def http_request(url, method="GET", headers=None, body=None, timeout=120, retries=3):
    """Generic HTTP request with retry + exponential backoff."""
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                ct = resp.headers.get("Content-Type", "")
                if "application/json" in ct:
                    return json.loads(raw.decode())
                return raw
        except urllib.error.HTTPError as e:
            code = e.code
            body_text = e.read().decode()[:500]
            if code == 429 or code >= 500:
                last_err = RuntimeError(f"HTTP {code}: {body_text}")
                wait = 2 ** attempt * 2
                print(f"  (retry {attempt+1}/{retries} in {wait}s: HTTP {code})", flush=True)
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {code}: {body_text}")
        except Exception as e:
            last_err = RuntimeError(f"Request failed ({method} {url[:60]}): {e}")
            wait = 2 ** attempt * 2
            print(f"  (retry {attempt+1}/{retries} in {wait}s: {e})", flush=True)
            time.sleep(wait)
    raise last_err


def supabase_headers():
    return {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }


def supabase_get(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    return http_request(url, headers={**supabase_headers(), "Accept": "application/json"}, timeout=30)


def supabase_post(path, body):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    return http_request(url, method="POST", headers={
        **supabase_headers(),
        "Prefer": "return=minimal,resolution=merge-duplicates",
    }, body=body, timeout=30)


def supabase_rpc(fn_name, body):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    return http_request(url, method="POST", headers={
        **supabase_headers(),
        "Accept": "application/json",
    }, body=body, timeout=30)


def openai_chat(model, messages, temperature=0.4, max_tokens=1500, json_mode=True):
    url = "https://api.openai.com/v1/chat/completions"
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    resp = http_request(url, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }, body=body, timeout=120)
    return resp["choices"][0]["message"]["content"]


def openai_embed(text):
    url = "https://api.openai.com/v1/embeddings"
    resp = http_request(url, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }, body={
        "model": EMBEDDING_MODEL,
        "input": text,
        "dimensions": EMBEDDING_DIMS,
        "encoding_format": "float",
    }, timeout=30)
    return resp["data"][0]["embedding"]


def openai_batch_request(method, path, body=None, file_upload=None):
    """Make a request to the OpenAI API. Supports multipart file uploads."""
    url = f"https://api.openai.com{path}"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}

    if file_upload:
        boundary = "----AjarkanBatchBoundary"
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
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
    else:
        req = urllib.request.Request(url, method=method, headers=headers)

    timeout = 600 if file_upload else 120
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ct = resp.headers.get("Content-Type", "")
            if "application/json" in ct:
                return json.loads(raw.decode())
            return raw
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI HTTP {e.code}: {e.read().decode()[:500]}")


# ── Question Parser ─────────────────────────────────────────────────────────

def parse_questions_file(filepath):
    """Parse the 325-questions markdown file into structured data."""
    questions = []
    current_category = None
    current_subcategory = None
    current_name = None

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip()

            # Section header: ## {emoji} {NAME} | category: {slug} | subcategory: {slug}
            header_match = re.match(
                r'^## .+ (.+?) \| category: (.+?) \| subcategory: (.+?)$',
                line
            )
            if header_match:
                current_name = header_match.group(1).strip()
                current_category = header_match.group(2).strip()
                current_subcategory = header_match.group(3).strip()
                continue

            # Question line: N. Question text
            q_match = re.match(r'^(\d+)\. (.+)$', line)
            if q_match and current_subcategory:
                num = int(q_match.group(1))
                text = q_match.group(2).strip()
                question_id = f'{current_subcategory}-{num:02d}'
                questions.append({
                    'id': question_id,
                    'text': text,
                    'category': current_category,
                    'subcategory': current_subcategory,
                    'subcategory_name': current_name,
                })

    return questions


# ── Prompts ─────────────────────────────────────────────────────────────────

HYDE_SYSTEM = """Kamu adalah ahli pendidikan Islam anak. Diberikan sebuah pertanyaan anak tentang Islam,
tuliskan deskripsi singkat (3-4 kalimat, dalam Bahasa Indonesia) tentang ayat-ayat Al-Qur'an
yang paling relevan untuk menjawab pertanyaan ini. Fokus pada tema, konsep, dan pesan utama
yang terkandung dalam ayat-ayat tersebut. Output teks biasa, tanpa format khusus."""

VERSE_SELECT_SYSTEM = """Kamu adalah kurator ayat Al-Qur'an untuk aplikasi pendidikan anak.

Dari daftar ayat kandidat, pilih 2-3 ayat yang PALING relevan untuk menjawab pertanyaan anak yang diberikan.

Kriteria pemilihan:
- Relevansi LANGSUNG dengan pertanyaan
- Pesan yang JELAS dan bisa dijelaskan ke anak
- Variasi surah (jangan ambil dari surah yang sama jika memungkinkan)
- Prioritaskan ayat yang memiliki pesan positif dan membangun

Output JSON:
{
  "selected": [
    {
      "id": "29:45",
      "verse_relevance": "Penjelasan singkat mengapa ayat ini relevan (1-2 kalimat, Bahasa Indonesia)"
    }
  ]
}"""

def get_generation_prompt(question, age_group, verses):
    """Build the GPT prompt for generating ajarkan content."""
    age_desc = 'anak usia di bawah 7 tahun (balita/TK)' if age_group == 'under7' \
        else 'anak usia 7 tahun ke atas (SD)'

    style_guide = (
        'Gunakan bahasa seperti bercerita kepada balita. Kalimat pendek, kata-kata sederhana, '
        'banyak analogi dari kehidupan sehari-hari anak. Hindari konsep abstrak.'
        if age_group == 'under7' else
        'Gunakan bahasa seperti ngobrol dengan anak SD. Boleh lebih detail, gunakan analogi '
        'yang relatable (HP, sekolah, teman). Ajak anak berpikir kritis.'
    )

    verse_context = '\n'.join([
        f"- {v.get('surah_name', '')} ({v.get('surah_number', '')}:{v.get('verse_number', '')}): "
        f"{v.get('translation', '')}"
        for v in verses
    ])

    return f"""Kamu adalah pendidik Islam yang membantu orang tua menjelaskan konsep Islam kepada {age_desc}.

Pertanyaan anak: "{question['text']}"

Ayat-ayat Al-Qur'an yang relevan:
{verse_context}

Panduan gaya bahasa: {style_guide}

Buatkan konten dalam format JSON berikut:
{{
  "penjelasan_anak": "Penjelasan yang bisa dibacakan orang tua ke anak (3-5 kalimat, sesuai usia)",
  "pembuka_percakapan": {{
    "pertanyaan": "Kalimat pembuka berupa pertanyaan untuk memulai ngobrol (1 kalimat, dalam tanda kutip)",
    "panduan_pertanyaan": "Panduan singkat untuk orang tua setelah anak menjawab (1-2 kalimat, dalam kurung)",
    "cerita": "Kalimat pembuka berupa cerita/analogi untuk memulai ngobrol (1-2 kalimat, dalam tanda kutip)",
    "panduan_cerita": "Panduan singkat untuk orang tua setelah anak merespons cerita (1-2 kalimat, dalam kurung)"
  }},
  "aktivitas_bersama": "Satu aktivitas konkret yang bisa dilakukan orang tua bersama anak, dimulai dengan kapan/di mana melakukannya (2-3 kalimat)"
}}

PENTING:
- Semua konten harus dalam Bahasa Indonesia
- Jangan menambahkan tafsir atau interpretasi di luar konteks ayat yang diberikan
- Penjelasan harus akurat secara aqidah
- Aktivitas harus praktis dan bisa dilakukan di rumah
- Output HANYA JSON, tanpa markdown atau teks tambahan"""


# ── Verse Selection Pipeline ───────────────────────────────────────────────

def select_verses_for_question(question):
    """HyDE → embed → vector search → GPT select 2-3 verses."""
    qid = question['id']

    # Check cache
    if qid in _verse_cache:
        return _verse_cache[qid]

    # Step 1: Generate HyDE document
    print(f"    Step 1: HyDE...", end=' ', flush=True)
    hyde_text = openai_chat(
        SELECTOR_MODEL,
        [
            {"role": "system", "content": HYDE_SYSTEM},
            {"role": "user", "content": question['text']},
        ],
        temperature=0.3,
        max_tokens=300,
        json_mode=False,
    )

    print(f"done ({len(hyde_text)} chars)", flush=True)

    # Step 2: Embed the HyDE document
    print(f"    Step 2: Embed...", end=' ', flush=True)
    embedding = openai_embed(hyde_text)

    print(f"done ({len(embedding)} dims)", flush=True)

    # Step 3: Vector search via Supabase RPC
    print(f"    Step 3: Vector search...", end=' ', flush=True)
    candidates = supabase_rpc("match_verses_hybrid", {
        "query_embedding": str(embedding),
        "query_text": question['text'],
        "match_count": VECTOR_SEARCH_COUNT,
    })

    print(f"done ({len(candidates) if candidates else 0} results)", flush=True)

    if not candidates:
        print(f"    ⚠ No verse candidates found for {qid}")
        _verse_cache[qid] = []
        return []

    # Step 4: GPT selects 2-3 most relevant verses
    candidate_list = '\n'.join([
        f"- {c['id']} ({c['surah_name']} {c['verse_number']}): {c['translation'][:100]}"
        for c in candidates[:10]
    ])

    print(f"    Step 4: GPT select verses ({len(candidates[:10])} candidates)...", end=' ', flush=True)
    selection_resp = openai_chat(
        SELECTOR_MODEL,
        [
            {"role": "system", "content": VERSE_SELECT_SYSTEM},
            {"role": "user", "content": f"Pertanyaan anak: \"{question['text']}\"\n\nKandidat ayat:\n{candidate_list}"},
        ],
        temperature=0.2,
        max_tokens=500,
    )
    print("done", flush=True)

    try:
        selected = json.loads(selection_resp)["selected"]
    except (json.JSONDecodeError, KeyError):
        print(f"    ⚠ Failed to parse verse selection for {qid}")
        _verse_cache[qid] = []
        return []

    # Hydrate selected verses with full data from candidates
    selected_ids = {s['id'] for s in selected}
    relevance_map = {s['id']: s.get('verse_relevance', '') for s in selected}

    verses = []
    for c in candidates:
        if c['id'] in selected_ids:
            c['verse_relevance'] = relevance_map.get(c['id'], '')
            verses.append(c)

    _verse_cache[qid] = verses
    return verses


# ── Content Generation ─────────────────────────────────────────────────────

def generate_content(question, age_group, verses):
    """Generate penjelasan, pembuka, aktivitas for one question + age group."""
    prompt = get_generation_prompt(question, age_group, verses)

    resp = openai_chat(
        CONTENT_MODEL,
        [{"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=1200,
    )

    try:
        content = json.loads(resp)
    except json.JSONDecodeError:
        print(f"    ⚠ Failed to parse content for {question['id']} ({age_group})")
        return None

    # Validate required fields
    required = ['penjelasan_anak', 'pembuka_percakapan', 'aktivitas_bersama']
    for field in required:
        if field not in content or not content[field]:
            print(f"    ⚠ Missing field '{field}' for {question['id']} ({age_group})")
            return None

    pembuka = content.get('pembuka_percakapan', {})
    pembuka_required = ['pertanyaan', 'panduan_pertanyaan', 'cerita', 'panduan_cerita']
    for field in pembuka_required:
        if field not in pembuka or not pembuka[field]:
            print(f"    ⚠ Missing pembuka field '{field}' for {question['id']} ({age_group})")
            return None

    return content


# ── Database Operations ─────────────────────────────────────────────────────

def check_existing(question_id, age_group):
    """Check if a question+age_group pair already exists in the DB."""
    rows = supabase_get(
        f"ajarkan_queries?select=id&question_id=eq.{question_id}&age_group=eq.{age_group}"
    )
    return len(rows) > 0


def insert_row(row):
    """Insert a single row into ajarkan_queries (upsert on conflict)."""
    supabase_post("ajarkan_queries", row)


# ── Main Pipeline (Synchronous) ─────────────────────────────────────────────

def process_question(question, age_group, dry_run=False):
    """Full pipeline for one question + one age group."""
    qid = question['id']
    print(f'  {qid} ({age_group})...', end=' ', flush=True)

    # Skip if already exists
    if not dry_run and check_existing(qid, age_group):
        print('skip (exists)')
        return None

    # Step 1: Select verses (shared across age groups — cached)
    verses = select_verses_for_question(question)
    if not verses:
        print('skip (no verses)')
        return None

    # Step 2: Generate content
    content = generate_content(question, age_group, verses)
    if not content:
        print('FAILED')
        return None

    # Step 3: Build row
    row = {
        'question_id': qid,
        'question_text': question['text'],
        'category': question['category'],
        'subcategory': question['subcategory'],
        'age_group': age_group,
        'selected_verses': json.dumps([{
            'surah': v.get('surah_number'),
            'ayah': v.get('verse_number'),
            'verse_relevance': v.get('verse_relevance', ''),
        } for v in verses]),
        'penjelasan_anak': content['penjelasan_anak'],
        'pembuka_percakapan': json.dumps(content['pembuka_percakapan']),
        'aktivitas_bersama': content['aktivitas_bersama'],
    }

    # Step 4: Insert or output
    if dry_run:
        # For dry-run, use dicts instead of JSON strings
        row['selected_verses'] = [{
            'surah': v.get('surah_number'),
            'ayah': v.get('verse_number'),
            'verse_relevance': v.get('verse_relevance', ''),
        } for v in verses]
        row['pembuka_percakapan'] = content['pembuka_percakapan']
        print('✓ (dry-run)')
    else:
        insert_row(row)
        print('✓')

    return row


# ── Batch Mode ──────────────────────────────────────────────────────────────

def batch_select_verses(questions):
    """Phase 2 of batch mode: HyDE + embed + vector search for all questions.
    Must be synchronous because each step depends on the previous.
    Returns dict of question_id → list of selected verse candidates."""

    print(f"\n── Phase 2: Verse selection (synchronous) for {len(questions)} questions ──")
    results = {}
    for i, q in enumerate(questions, 1):
        qid = q['id']
        print(f"  [{i}/{len(questions)}] {qid}...", end=' ', flush=True)
        try:
            verses = select_verses_for_question(q)
            results[qid] = verses
            print(f"✓ ({len(verses)} verses)")
        except Exception as e:
            print(f"✗ ({e})")
            results[qid] = []
        time.sleep(0.3)

    found = sum(1 for v in results.values() if v)
    print(f"  ✓ Found verses for {found}/{len(questions)} questions\n")
    return results


def batch_generate_content(questions, verse_map):
    """Phase 3 of batch mode: use OpenAI Batch API for content generation."""

    # Build JSONL for all question × age group pairs
    print("── Phase 3: Building JSONL for content generation ─────────────────────")
    lines = []
    pairs = []  # Track (qid, age_group) in order

    for q in questions:
        qid = q['id']
        verses = verse_map.get(qid, [])
        if not verses:
            continue
        for age in AGE_GROUPS:
            custom_id = f"{qid}:{age}"
            prompt = get_generation_prompt(q, age, verses)
            request_obj = {
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": CONTENT_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.5,
                    "max_tokens": 1200,
                },
            }
            lines.append(json.dumps(request_obj, ensure_ascii=False))
            pairs.append((qid, age))

    if not lines:
        print("  No valid pairs to process.")
        return {}

    jsonl_content = "\n".join(lines)
    jsonl_bytes = jsonl_content.encode("utf-8")

    # Save JSONL
    BATCH_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    jsonl_path = BATCH_OUTPUT_DIR / f"ajarkan_request_{timestamp}.jsonl"
    jsonl_path.write_text(jsonl_content, encoding="utf-8")
    print(f"  ✓ Built {len(lines)} requests → {jsonl_path}")

    # Upload file
    print("  Uploading JSONL file …", end=" ", flush=True)
    upload_resp = openai_batch_request("POST", "/v1/files", file_upload={
        "purpose": "batch",
        "file": ("ajarkan_request.jsonl", jsonl_bytes),
    })
    file_id = upload_resp["id"]
    print(f"✓ file_id={file_id}")

    # Create batch
    print("  Creating batch …", end=" ", flush=True)
    batch_resp = openai_batch_request("POST", "/v1/batches", body={
        "input_file_id": file_id,
        "endpoint": "/v1/chat/completions",
        "completion_window": "24h",
    })
    batch_id = batch_resp["id"]
    print(f"✓ batch_id={batch_id}")

    # Poll
    print(f"  Polling every {POLL_INTERVAL}s …")
    while True:
        status_resp = openai_batch_request("GET", f"/v1/batches/{batch_id}")
        status = status_resp["status"]
        completed = status_resp.get("request_counts", {}).get("completed", 0)
        total = status_resp.get("request_counts", {}).get("total", 0)
        failed = status_resp.get("request_counts", {}).get("failed", 0)
        print(f"    status={status}  completed={completed}/{total}  failed={failed}", flush=True)

        if status == "completed":
            output_file_id = status_resp.get("output_file_id")
            print(f"  ✓ Batch completed! output_file_id={output_file_id}")
            break
        elif status in ("failed", "expired", "cancelled", "cancelling"):
            raise RuntimeError(f"Batch {batch_id} ended with status: {status}")
        time.sleep(POLL_INTERVAL)

    # Download results
    print("  Downloading results …", end=" ", flush=True)
    raw = openai_batch_request("GET", f"/v1/files/{output_file_id}/content")
    result_path = BATCH_OUTPUT_DIR / f"ajarkan_result_{timestamp}.jsonl"
    result_path.write_bytes(raw)
    print(f"✓ → {result_path}")

    # Parse results into dict keyed by custom_id
    content_map = {}
    for line in raw.decode("utf-8").strip().split("\n"):
        if not line.strip():
            continue
        obj = json.loads(line)
        custom_id = obj["custom_id"]
        response = obj.get("response", {})
        if response.get("status_code") == 200:
            try:
                text = response["body"]["choices"][0]["message"]["content"]
                content_map[custom_id] = json.loads(text)
            except (KeyError, IndexError, json.JSONDecodeError) as e:
                print(f"  ⚠ Parse error for {custom_id}: {e}")
        else:
            print(f"  ⚠ HTTP error for {custom_id}: {response.get('status_code')}")

    ok = sum(1 for v in content_map.values() if v)
    print(f"  ✓ Parsed {ok}/{len(lines)} results\n")
    return content_map


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Seed ajarkan_queries table')
    parser.add_argument('--test', action='store_true', help='Test mode: 3 questions only')
    parser.add_argument('--dry-run', action='store_true', help='Output to JSON instead of DB')
    parser.add_argument('--question-id', type=str, help='Re-run single question ID')
    parser.add_argument('--category', type=str, help='Run only one category slug')
    parser.add_argument('--batch', action='store_true', help='Use OpenAI Batch API (cheaper)')
    parser.add_argument('--questions-file', type=str,
                        default='ajarkan-325-questions-clean.md',
                        help='Path to questions markdown file')
    args = parser.parse_args()

    # Validate env
    missing = []
    if not OPENAI_API_KEY:
        missing.append('OPENAI_API_KEY')
    if not args.dry_run:
        if not SUPABASE_URL:
            missing.append('SUPABASE_URL')
        if not SUPABASE_SERVICE_KEY:
            missing.append('SUPABASE_SERVICE_KEY')
    if missing:
        print(f'Missing environment variables: {", ".join(missing)}')
        sys.exit(1)

    # Parse questions
    questions_path = Path(args.questions_file)
    if not questions_path.exists():
        questions_path = Path(__file__).parent.parent / args.questions_file
    if not questions_path.exists():
        # Try Downloads folder
        questions_path = Path.home() / 'Downloads' / args.questions_file
    if not questions_path.exists():
        print(f'Questions file not found: {args.questions_file}')
        sys.exit(1)

    questions = parse_questions_file(questions_path)
    print(f'\n── Phase 1: Parsed {len(questions)} questions from {questions_path.name} ──')

    # Filter
    if args.question_id:
        questions = [q for q in questions if q['id'] == args.question_id]
        if not questions:
            print(f'Question ID not found: {args.question_id}')
            sys.exit(1)
    elif args.category:
        questions = [q for q in questions if q['category'] == args.category]
        if not questions:
            print(f'Category not found: {args.category}')
            sys.exit(1)
    elif args.test:
        questions = questions[:3]

    total_pairs = len(questions) * len(AGE_GROUPS)
    print(f'  Processing {len(questions)} questions × {len(AGE_GROUPS)} age groups = {total_pairs} rows')

    if args.batch and not args.dry_run:
        # ── Batch API path ──────────────────────────────────────────────
        # Phase 2: Verse selection (synchronous — needs embed + vector search)
        verse_map = batch_select_verses(questions)

        # Phase 3: Content generation (batch API)
        content_map = batch_generate_content(questions, verse_map)

        # Phase 4: Insert into DB
        print("── Phase 4: Inserting into Supabase ──────────────────────────────────")
        inserted = 0
        skipped = 0
        failed = 0

        for q in questions:
            qid = q['id']
            verses = verse_map.get(qid, [])
            if not verses:
                skipped += 2
                continue

            for age in AGE_GROUPS:
                custom_id = f"{qid}:{age}"
                content = content_map.get(custom_id)
                if not content:
                    failed += 1
                    continue

                # Check if exists
                if check_existing(qid, age):
                    skipped += 1
                    continue

                row = {
                    'question_id': qid,
                    'question_text': q['text'],
                    'category': q['category'],
                    'subcategory': q['subcategory'],
                    'age_group': age,
                    'selected_verses': json.dumps([{
                        'surah': v.get('surah_number'),
                        'ayah': v.get('verse_number'),
                        'verse_relevance': v.get('verse_relevance', ''),
                    } for v in verses]),
                    'penjelasan_anak': content.get('penjelasan_anak', ''),
                    'pembuka_percakapan': json.dumps(content.get('pembuka_percakapan', {})),
                    'aktivitas_bersama': content.get('aktivitas_bersama', ''),
                }

                try:
                    insert_row(row)
                    inserted += 1
                except Exception as e:
                    print(f"  ✗ {custom_id}: {e}")
                    failed += 1

        print(f"  ✓ Inserted: {inserted}  Skipped: {skipped}  Failed: {failed}")

    else:
        # ── Synchronous path ────────────────────────────────────────────
        print(f'\n── Processing {"(dry-run)" if args.dry_run else ""} ──')
        results = []
        succeeded = 0
        skipped = 0
        failed = 0

        failed_ids = []
        for i, q in enumerate(questions, 1):
            print(f'\n[{i}/{len(questions)}] {q["text"][:60]}...')
            for age in AGE_GROUPS:
                try:
                    result = process_question(q, age, dry_run=args.dry_run)
                    if result:
                        results.append(result)
                        succeeded += 1
                    elif result is None:
                        skipped += 1
                    else:
                        failed += 1
                        failed_ids.append(f"{q['id']}:{age}")
                except Exception as e:
                    print(f"  ✗ {q['id']} ({age}): {e}")
                    failed += 1
                    failed_ids.append(f"{q['id']}:{age}")
                time.sleep(0.5)  # Rate limit courtesy

        # Output
        if args.dry_run:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            output_path = OUTPUT_DIR / 'ajarkan_review.json'
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f'\n── Dry-run output saved to: {output_path}')

        print(f'\n── Summary ──────────────────────────────────────────────────────────')
        print(f'  Succeeded: {succeeded}')
        print(f'  Skipped:   {skipped}')
        print(f'  Failed:    {failed}')
        if failed_ids:
            print(f'  Failed IDs: {", ".join(failed_ids)}')
            print(f'  Re-run with: python scripts/seed_ajarkan.py --question-id <id>')
        print(f'── Done ─────────────────────────────────────────────────────────────')


if __name__ == '__main__':
    main()
