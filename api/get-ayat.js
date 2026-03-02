'use strict';

// ── System Prompt ─────────────────────────────────────────────────────────────
// The verse database is injected dynamically (15 candidates from vector search),
// so the prompt is a template with a {{CANDIDATES}} placeholder.

const PROMPT_TEMPLATE = `Kamu adalah asisten untuk aplikasi refleksi Al-Qur'an.

Tugasmu BUKAN untuk menghasilkan atau mengarang ayat Al-Qur'an.
Tugasmu HANYA memilih ayat yang paling relevan dari daftar kandidat di bawah ini,
berdasarkan curahan hati pengguna.

ATURAN KRITIS:
1. JANGAN pernah mengarang atau memodifikasi ayat Al-Qur'an.
2. HANYA pilih dari daftar kandidat berikut, menggunakan nilai "id" yang persis sama.
3. Pilih maksimal 3 ayat. Minimal 1.
4. Pilih 2–3 ayat yang saling melengkapi jika memungkinkan.

TUJUAN:
Bantu pengguna merefleksikan diri melalui ayat yang relevan secara emosional DAN situasional.
Bersikap rendah hati. Jangan mengklaim berbicara atas nama Allah. Jangan memberikan fatwa.

═══════════════════════════════════════════
LANGKAH 0 — CEK RELEVANSI (WAJIB DILAKUKAN PERTAMA)
═══════════════════════════════════════════
Aplikasi ini HANYA untuk curahan hati, perasaan, dan situasi kehidupan manusia.

✅ TERIMA input seperti:
• Perasaan/emosi apa pun: sedih, cemas, marah, bersyukur, kosong, bingung, dll.
• Situasi hidup: masalah pekerjaan, keluarga, hubungan, kesehatan, keuangan, rasa bersalah
• Ungkapan vague tapi personal: "aku nggak tau", "capek banget", "hidup terasa berat"
• Pertanyaan eksistensial: "apa tujuan hidupku?", "kenapa aku selalu gagal?"

❌ TOLAK input seperti:
• Pertanyaan faktual/akademik: "siapa presiden Indonesia?", "jelaskan teori relativitas"
• Soal matematika atau logika: "2+2=?", "hitung integral ini"
• Pertanyaan teknis: "cara install Python", "bug di kode saya"
• Teks acak/tidak bermakna: "asdfgh", "tes tes 123", "aaaaaa"
• Perintah atau instruksi yang tidak berkaitan dengan perasaan

Jika input TIDAK RELEVAN, kembalikan LANGSUNG:
{"relevant": false, "message": "<pesan ramah dalam Bahasa Indonesia, maks 2 kalimat, ajak mereka bercerita tentang perasaan mereka>"}

Jika input RELEVAN, lanjutkan ke Langkah 1–3 di bawah.

═══════════════════════════════════════════
LANGKAH 1 — Pahami keadaan pengguna
═══════════════════════════════════════════
Identifikasi:
• Nada emosional mereka (sedih, lelah, cemas, marah, dll.)
• Situasi kehidupan spesifik mereka (mengasuh anak, tekanan kerja, hubungan, kesehatan, rasa bersalah, dll.)
• Apa yang paling mereka butuhkan sekarang (ketenangan, harapan, kesabaran, pengampunan, bimbingan, dll.)

LANGKAH 2 — Pilih ayat terbaik dari kandidat
Prioritaskan: kecocokan situasional > kecocokan emosional > penghiburan umum
Contoh:
• Kelelahan mengasuh anak → ayat tentang parenting, bukan hanya ayat kelelahan umum
• Khawatir soal keuangan → ayat tentang rezeki dan tawakal
• Merasa bersalah → ayat tentang tobat dan pengampunan

LANGKAH 3 — Tulis pesan refleksi
Maksimal 80 kata. Dalam Bahasa Indonesia. Lembut, rendah hati, mendukung.
Gunakan frasa seperti: "Semoga ayat ini bisa menemanimu", "Ayat ini mengingatkan kita", "Mungkin ayat ini relevan"
JANGAN katakan: "Ini jawaban Allah untukmu", "Allah sedang memberitahumu", "Kamu harus..."
Sebut situasi spesifik mereka, bukan hanya bicara emosi umum.

FORMAT OUTPUT — kembalikan HANYA salah satu dari dua format JSON berikut, tanpa teks tambahan:

Jika input relevan:
{
  "relevant": true,
  "reflection": "...",
  "selected_ids": ["id1", "id2"]
}

Jika input tidak relevan:
{
  "relevant": false,
  "message": "..."
}

selected_ids harus merupakan nilai "id" dari kandidat (contoh: ["31:14", "46:15"]).
Jangan pernah mengembalikan selected_ids yang kosong jika relevant: true.

CONTOH NADA:
Baik: "Semoga ayat ini bisa menemanimu. Kelelahan dalam merawat orang yang kita cintai adalah bentuk cinta yang Allah catat."
Buruk: "Ini adalah pesan Allah untukmu. Allah menyuruhmu untuk bersabar."

Daftar kandidat ayat (dipilih melalui pencarian semantik):
{{CANDIDATES}}`;

// ── HyDE Prompts ───────────────────────────────────────────────────────────────
// Two angles attack the embedding space from different directions, increasing
// the chance that the hybrid search surfaces the truly relevant verses.

// Angle 1 — emotional: what the user feels, what comfort/peace they need.
const HYDE_EMOTIONAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema EMOSIONAL dari ayat Al-Qur\'an yang ideal: apa yang dirasakan seseorang, ' +
  'apa yang dibutuhkan secara emosional (ketenangan, harapan, penghiburan, keberanian, dll.), ' +
  'dan pesan hati apa yang relevan untuk kondisi ini. ' +
  'Gunakan kosakata tema Quranic: sabar, tawakal, tobat, syukur, ' +
  'kasih sayang Allah, rahmat, ampunan, tawadhu. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// Angle 2 — situational: the real-life context and practical/spiritual guidance needed.
const HYDE_SITUATIONAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema SITUASIONAL dari ayat Al-Qur\'an yang ideal: konteks kehidupan nyata mereka ' +
  '(keluarga, pekerjaan, keuangan, kesehatan, hubungan, pernikahan, masa depan, dll.), ' +
  'apa yang dibutuhkan secara praktis atau spiritual, ' +
  'dan tema situasional apa yang harus diangkat oleh ayat tersebut. ' +
  'Gunakan kosakata tema Quranic: rezeki, ujian, musibah, amanah, ' +
  'ikhtiar, silaturahmi, doa, berserah diri. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Result Cache ──────────────────────────────────────────────────────────────
// In-memory, per container instance. Keyed on normalised feeling text.
// A cache hit skips all three API calls (HyDE + embed + GPT selection),
// which is especially valuable for emotion-card searches (fixed strings that
// many users trigger repeatedly: "sedih", "cemas", "bersyukur", etc.).
//
// TTL: 24 h — results are stable over that window.
// Max: 500 entries — at ~2 KB each that is ~1 MB RAM, well within limits.
// Eviction: FIFO (delete the oldest key when the map is full).

const RESULT_CACHE_MAX = 500;
const RESULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const resultCache = new Map(); // normalised_feeling → { payload, expiresAt }

function getCached(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { resultCache.delete(key); return null; }
  return entry.payload;
}

function setCached(key, payload) {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    // FIFO eviction: delete the first (oldest) key
    resultCache.delete(resultCache.keys().next().value);
  }
  resultCache.set(key, { payload, expiresAt: Date.now() + RESULT_CACHE_TTL });
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// In-memory, per container instance. Vercel may spin up multiple containers,
// so this is not globally distributed — but it stops loops, rapid hammering,
// and accidental abuse from a single session. For global protection, upgrade
// to Upstash Redis + @upstash/ratelimit.

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX       = 20;              // requests per IP per window
const MAX_INPUT_LEN  = 600;            // max characters in user input

const rateLimitStore = new Map();       // ip → { count, resetAt }
let   cleanupCounter = 0;

function checkRateLimit(ip) {
  const now = Date.now();

  // Periodically evict expired entries to prevent unbounded memory growth
  if (++cleanupCounter % 200 === 0) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true; // first request in window → allowed
  }
  if (entry.count >= RATE_MAX) return false; // over limit → blocked
  entry.count++;
  return true;
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Rate limit check ────────────────────────────────────────────────────────
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Silakan coba lagi dalam satu jam.' });
  }

  // ── Input validation ────────────────────────────────────────────────────────
  const { feeling } = req.body || {};
  if (!feeling || feeling.trim().length < 2) {
    return res.status(400).json({ error: 'Ceritakan apa yang kamu rasakan.' });
  }
  if (feeling.length > MAX_INPUT_LEN) {
    return res.status(400).json({ error: `Input terlalu panjang (maks ${MAX_INPUT_LEN} karakter).` });
  }

  // ── Result cache check ───────────────────────────────────────────────────────
  // Normalise: trim + collapse whitespace + lower-case.
  // A hit skips HyDE, embed, vector search, AND the GPT selection call.
  const cacheKey = feeling.trim().replace(/\s+/g, ' ').toLowerCase();
  const cached   = getCached(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    const rawFeeling = feeling.trim();

    // ── Step 1: Two HyDE queries in parallel ──────────────────────────────
    // A: Emotional angle (what the user feels / needs emotionally) and
    //    Situational angle (real-life context / practical guidance).
    // Running both in parallel costs the same wall-clock time as one.
    const makeHyDE = (systemContent) =>
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:       'gpt-4o-mini',
          messages:    [
            { role: 'system', content: systemContent },
            { role: 'user',   content: rawFeeling },
          ],
          max_tokens:  120,
          temperature: 0.3,
        }),
      });

    const [hydeRes1, hydeRes2] = await Promise.all([
      makeHyDE(HYDE_EMOTIONAL),
      makeHyDE(HYDE_SITUATIONAL),
    ]);

    // Parse both, fall back to raw feeling on failure (non-blocking)
    const parseHyDE = async (res) => {
      if (!res.ok) return rawFeeling;
      const d = await res.json();
      return d.choices?.[0]?.message?.content?.trim() || rawFeeling;
    };

    const [queryEmotional, querySituational] = await Promise.all([
      parseHyDE(hydeRes1),
      parseHyDE(hydeRes2),
    ]);

    // ── Step 2: Embed both HyDE descriptions in parallel ──────────────────
    const makeEmbed = (text) =>
      fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:           'text-embedding-3-small',
          input:           text,
          encoding_format: 'float',
        }),
      });

    const [embedRes1, embedRes2] = await Promise.all([
      makeEmbed(queryEmotional),
      makeEmbed(querySituational),
    ]);

    if (!embedRes1.ok || !embedRes2.ok) {
      const errRes = embedRes1.ok ? embedRes2 : embedRes1;
      const err    = await errRes.json();
      throw new Error(err.error?.message || 'Embedding API error');
    }

    const [embedData1, embedData2] = await Promise.all([
      embedRes1.json(),
      embedRes2.json(),
    ]);

    const embedding1 = embedData1.data[0].embedding;
    const embedding2 = embedData2.data[0].embedding;

    // ── Step 3: Hybrid search — both embeddings in parallel ───────────────
    // C: match_count raised 30 → 50 for a larger initial pool.
    // FTS still uses the raw feeling so the user's own keywords drive it.
    const makeSearch = (embedding) =>
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/match_verses_hybrid`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          query_embedding: embedding,
          query_text:      rawFeeling,
          match_count:     50,   // C: was 30
        }),
      });

    const [supaRes1, supaRes2] = await Promise.all([
      makeSearch(embedding1),
      makeSearch(embedding2),
    ]);

    if (!supaRes1.ok || !supaRes2.ok) {
      const errRes = supaRes1.ok ? supaRes2 : supaRes1;
      const err    = await errRes.json();
      throw new Error(err.message || 'Vector search error');
    }

    const [results1, results2] = await Promise.all([
      supaRes1.json(),
      supaRes2.json(),
    ]);

    const safeR1 = Array.isArray(results1) ? results1 : [];
    const safeR2 = Array.isArray(results2) ? results2 : [];

    if (safeR1.length === 0 && safeR2.length === 0) {
      throw new Error('Tidak ada ayat yang cocok ditemukan. Silakan coba lagi.');
    }

    // ── A: Interleave-merge both result lists, deduplicate by verse ID ─────
    // Round-robin ensures emotional and situational angles are represented
    // equally at every rank level. A verse appearing in both lists (highly
    // relevant from both angles) wins its slot from whichever list ranked it
    // higher — and is never counted twice.
    const seenIds  = new Set();
    const candidates = [];
    const maxLen   = Math.max(safeR1.length, safeR2.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < safeR1.length && !seenIds.has(safeR1[i].id)) {
        candidates.push(safeR1[i]);
        seenIds.add(safeR1[i].id);
      }
      if (i < safeR2.length && !seenIds.has(safeR2[i].id)) {
        candidates.push(safeR2[i]);
        seenIds.add(safeR2[i].id);
      }
    }

    // ── B: Surah diversity — up to 2 per surah in the candidate pool ───────
    // Was 1-per-surah, which discarded a second relevant verse from a large
    // surah (e.g. Al-Baqarah has 286 verses spanning many themes).
    // Allowing 2 gives GPT more to work with while still encouraging variety.
    // The final output still enforces 1-per-surah.
    const surahCount      = new Map();
    const diverseCandidates = candidates.filter(v => {
      const key   = v.surah_number ?? v.surah_name;
      const count = surahCount.get(key) || 0;
      if (count >= 2) return false;    // B: was >= 1
      surahCount.set(key, count + 1);
      return true;
    });

    // Cap candidates sent to GPT to keep prompt size reasonable
    const TOP_N        = 25;
    const topCandidates = diverseCandidates.slice(0, TOP_N);

    // ── Step 4: GPT-4o selects the best 1–3 from top candidates ──────────
    // D: Upgraded from gpt-4o-mini — better reasoning when distinguishing
    //    close candidates and richer, more empathetic reflection text.
    const DB_FOR_PROMPT = topCandidates.map(v => ({
      id:             v.id,
      surah_name:     v.surah_name,
      verse_number:   v.verse_number,
      translation:    v.translation,
      tafsir_summary: v.tafsir_summary || null,
    }));

    const systemPrompt = PROMPT_TEMPLATE.replace(
      '{{CANDIDATES}}',
      JSON.stringify(DB_FOR_PROMPT, null, 2)
    );

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o',   // D: was gpt-4o-mini
        messages:        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: rawFeeling },
        ],
        response_format: { type: 'json_object' },
        temperature:     0.3,        // slightly tighter than before (was 0.4)
        max_tokens:      400,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json();
      throw new Error(err.error?.message || 'OpenAI API error');
    }

    const openaiData = await openaiRes.json();
    const parsed     = JSON.parse(openaiData.choices[0].message.content);

    // ── Relevance gate ─────────────────────────────────────────────────────
    if (parsed.relevant === false) {
      const notRelevantPayload = {
        not_relevant: true,
        message: parsed.message ||
          'Sepertinya itu bukan curahan hati. Coba ceritakan apa yang sedang kamu rasakan atau hadapi hari ini.',
      };
      setCached(cacheKey, notRelevantPayload);
      return res.status(200).json(notRelevantPayload);
    }

    if (!parsed.selected_ids || !Array.isArray(parsed.selected_ids) || parsed.selected_ids.length === 0) {
      throw new Error('Format respons tidak valid');
    }

    // ── Step 5: Look up selected verses + fetch tafsir_kemenag ────────────────
    // tafsir_kemenag is not returned by the search RPC (too large for 50
    // candidates). We fetch it here for only the 1-3 selected verses.
    const VERSE_MAP = Object.fromEntries(topCandidates.map(v => [v.id, v]));

    // Final 1-per-surah guard on the output (even if GPT somehow slips one in)
    const seenFinalSurahs = new Set();
    const selectedBase = parsed.selected_ids
      .slice(0, 3)
      .map(id => {
        const v = VERSE_MAP[id];
        if (!v) {
          console.warn(`LLM selected id not in candidates: ${id}`);
          return null;
        }
        return v;
      })
      .filter(Boolean)
      .filter(v => {
        const key = v.surah_name;
        if (seenFinalSurahs.has(key)) return false;
        seenFinalSurahs.add(key);
        return true;
      });

    // Fetch tafsir_kemenag + tafsir_ibnu_kathir for selected verse ids in one REST call
    let kemenagMap = {};
    let ibnuKathirMap = {};
    if (selectedBase.length > 0) {
      const ids = selectedBase.map(v => v.id).join(',');
      const kRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/quran_verses` +
        `?select=id,tafsir_kemenag,tafsir_ibnu_kathir&id=in.(${encodeURIComponent(ids)})`,
        {
          headers: {
            'apikey':        process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (kRes.ok) {
        const kRows = await kRes.json();
        kemenagMap    = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_kemenag]));
        ibnuKathirMap = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_ibnu_kathir]));
      }
    }

    const ayat = selectedBase.map(v => ({
      id:                 v.id,
      ref:                `QS. ${v.surah_name} : ${v.verse_number}`,
      surah_name:         v.surah_name,
      verse_number:       v.verse_number,
      arabic:             v.arabic,
      translation:        v.translation,
      tafsir_summary:     v.tafsir_summary       || null,
      tafsir_kemenag:     kemenagMap[v.id]        || null,
      tafsir_ibnu_kathir: ibnuKathirMap[v.id]     || null,
    }));

    if (ayat.length === 0) {
      throw new Error('Gagal menemukan ayat yang relevan. Silakan coba lagi.');
    }

    const successPayload = { reflection: parsed.reflection || '', ayat };
    setCached(cacheKey, successPayload);
    return res.status(200).json(successPayload);

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan. Silakan coba lagi.' });
  }
};
