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

⚠️ JIKA pengguna menyebut BEBERAPA masalah berbeda:
Pilih ayat yang masing-masing menjawab dimensi yang BERBEDA — bukan 3 ayat tentang tema sama.
Contoh input "capek merawat ibu sakit, kehabisan uang":
  ✓ 1 ayat tentang birrul walidain / keutamaan merawat orang tua
  ✓ 1 ayat tentang rezeki / tawakal dalam kesulitan finansial
  ✗ HINDARI 3 ayat tentang "ujian/cobaan" generik

LANGKAH 3 — Tulis pesan pembuka singkat (reflection)
Maksimal 40 kata. Dalam Bahasa Indonesia. Lembut, rendah hati, mendukung.
Gunakan frasa seperti: "Semoga ayat-ayat ini bisa menemanimu", "Mungkin ini yang kamu butuhkan sekarang"
JANGAN katakan: "Ini jawaban Allah untukmu", "Allah sedang memberitahumu", "Kamu harus..."

LANGKAH 4 — Tulis resonansi personal untuk setiap ayat (verse_resonance)
Untuk setiap ayat yang kamu pilih, tulis 2–3 kalimat (maks 45 kata) yang:
• Menjelaskan MENGAPA ayat ini relevan dengan situasi SPESIFIK pengguna — bukan penjelasan umum
• Menyebut detail konkret dari curahan hati mereka (situasi, perasaan, atau kekhawatiran yang disebutkan)
• Terasa personal dan hangat, seperti teman yang benar-benar mendengarkan
Gunakan "kamu" bukan "Anda". Nada: teman yang peduli, bukan ceramah.

FORMAT OUTPUT — kembalikan HANYA salah satu dari dua format JSON berikut, tanpa teks tambahan:

Jika input relevan:
{
  "relevant": true,
  "reflection": "...",
  "selected_ids": ["id1", "id2"],
  "verse_resonance": {
    "id1": "Penjelasan personal 2–3 kalimat mengapa ayat ini relevan dengan situasi spesifik pengguna...",
    "id2": "Penjelasan personal untuk ayat kedua jika ada..."
  }
}

Jika input tidak relevan:
{
  "relevant": false,
  "message": "..."
}

selected_ids harus merupakan nilai "id" dari kandidat (contoh: ["31:14", "46:15"]).
verse_resonance harus memiliki entri untuk setiap id di selected_ids.
Jangan pernah mengembalikan selected_ids yang kosong jika relevant: true.

CONTOH NADA verse_resonance:
Baik: "Kamu bilang merasa lelah merawat orang yang sakit sendirian. Ayat ini mengingatkan bahwa setiap tetes keringat yang kamu korbankan untuk orang yang kamu cintai, Allah catat sebagai amal yang mulia."
Buruk: "Ayat ini berbicara tentang kesabaran dan Allah menyukai orang yang sabar."

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

// Angle 3 — divine hope: Allah's promises, ease after hardship, meaning behind trials.
// Catches verses like "with hardship comes ease", "Allah does not burden beyond capacity",
// "call upon Me and I will answer" — the forward-looking, hope-restoring layer.
const HYDE_DIVINE =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema HARAPAN dan JANJI ILAHI dari ayat Al-Qur\'an yang ideal: ' +
  'janji Allah kepada hamba-Nya yang bersabar dan bertawakkal, ' +
  'jaminan bahwa setiap ujian memiliki makna dan akhir yang baik, ' +
  'dan pengingat bahwa Allah tidak pernah meninggalkan hamba-Nya. ' +
  'Gunakan kosakata tema Quranic: kemudahan setelah kesulitan, pertolongan Allah, ' +
  'harapan, ampunan, ketenangan hati, cahaya setelah kegelapan, doa yang dikabulkan. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Intent Decomposition ──────────────────────────────────────────────────────
// Splits multi-dimensional input into up to 3 distinct spiritual needs.
// Enables one targeted HyDE per need instead of all 3 angles blending together.
// Single-need inputs return 1 element → falls back to 3-angle HyDE (no regression).
const DECOMPOSE_PROMPT =
  'Kamu membantu sistem pencarian ayat Al-Qur\'an. ' +
  'Analisis curahan hati pengguna dan identifikasi kebutuhan spiritual yang BERBEDA-BEDA. ' +
  'Keluarkan 1–3 kebutuhan spesifik dalam JSON. Aturan: ' +
  '(1) Maksimal 3. ' +
  '(2) Setiap kebutuhan BERBEDA — bukan variasi dari tema yang sama. ' +
  '(3) Gunakan kosakata Islami spesifik jika ada: ' +
  '    birrul walidain, rezeki, taubat, hijrah, sabar merawat orang sakit, dll. ' +
  '(4) Jika hanya ada 1 inti masalah, kembalikan array 1 elemen. ' +
  'Format output: {"needs":["deskripsi kebutuhan 1","kebutuhan 2","kebutuhan 3"]}';

// Generates a targeted HyDE system prompt focused on ONE extracted need.
// User message will be the need itself (not the full feeling) to stay focused.
const makeHyDE_need = (need) =>
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  `Fokus KHUSUS pada kebutuhan ini: "${need}". ` +
  'Tulis 2–3 kalimat yang mendeskripsikan tema dan kosakata Quranic dari ayat ideal ' +
  'untuk kebutuhan tersebut secara spesifik. ' +
  'Gunakan kosakata Islami yang tepat dan spesifik untuk tema ini. ' +
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

    // ── Step 0.5: Intent decomposition ───────────────────────────────────────
    // Splits multi-need input into up to 3 distinct spiritual needs.
    // "ibu sakit + capek merawat + kehabisan uang" → 3 separate needs
    // → each gets its own targeted HyDE → diverse candidate pool.
    // Single-need inputs return 1 element → 3-angle fallback (no regression).
    const decomposeRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        messages:        [
          { role: 'system', content: DECOMPOSE_PROMPT },
          { role: 'user',   content: rawFeeling },
        ],
        response_format: { type: 'json_object' },
        max_tokens:      200,
        temperature:     0.2,
      }),
    });

    // Parse extracted needs — fall back to null on any failure
    let needs = null;
    try {
      if (decomposeRes.ok) {
        const decompData   = await decomposeRes.json();
        const decompParsed = JSON.parse(decompData.choices?.[0]?.message?.content || '{}');
        const extracted    = decompParsed.needs;
        if (Array.isArray(extracted) && extracted.length >= 1 && extracted.length <= 3) {
          const valid = extracted.filter(n => typeof n === 'string' && n.trim().length > 0);
          if (valid.length >= 1) needs = valid;
        }
      }
    } catch (_) { /* fall through — 3-angle fallback below */ }

    const isMultiIntent = needs && needs.length > 1;

    // ── Step 1: HyDE — strategy depends on intent count ──────────────────────
    // Single intent (or decompose failed) → 3 angles on full input (original behaviour)
    // Multi-intent (2–3 needs)            → 1 targeted HyDE per need for diversity
    //
    // hydeSlots: array of [systemPrompt, userContent] tuples (always 3 slots)
    let hydeSlots;
    if (!isMultiIntent) {
      // Original 3-angle behaviour — zero regression for simple inputs
      hydeSlots = [
        [HYDE_EMOTIONAL,   rawFeeling],
        [HYDE_SITUATIONAL, rawFeeling],
        [HYDE_DIVINE,      rawFeeling],
      ];
    } else {
      // One focused HyDE per extracted need.
      // If only 2 needs, pad 3rd slot with a divine-hope angle on the full input.
      const slots = needs.slice(0, 3);
      while (slots.length < 3) slots.push(null); // null = divine fallback
      hydeSlots = slots.map(need =>
        need
          ? [makeHyDE_need(need), need]       // targeted: user msg = the need itself
          : [HYDE_DIVINE,         rawFeeling] // fallback: hope angle on full input
      );
    }

    const makeHyDE = (systemContent, userContent) =>
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
            { role: 'user',   content: userContent },
          ],
          max_tokens:  120,
          temperature: 0.3,
        }),
      });

    const [hydeRes1, hydeRes2, hydeRes3] = await Promise.all(
      hydeSlots.map(([system, user]) => makeHyDE(system, user))
    );

    // Parse all three, fall back to raw feeling on failure (non-blocking)
    const parseHyDE = async (res) => {
      if (!res.ok) return rawFeeling;
      const d = await res.json();
      return d.choices?.[0]?.message?.content?.trim() || rawFeeling;
    };

    const [queryEmotional, querySituational, queryDivine] = await Promise.all([
      parseHyDE(hydeRes1),
      parseHyDE(hydeRes2),
      parseHyDE(hydeRes3),
    ]);

    // ── Step 2: Embed all three HyDE descriptions in parallel ────────────
    // text-embedding-3-large with dimensions:1536 keeps the pgvector schema
    // unchanged while delivering significantly richer semantic representation
    // than text-embedding-3-small at the same vector size.
    const makeEmbed = (text) =>
      fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          // text-embedding-3-large at dimensions:1536 — reembed.py was run with
          // the same model so stored vectors and query vectors are in sync.
          model:           'text-embedding-3-large',
          dimensions:      1536,
          input:           text,
          encoding_format: 'float',
        }),
      });

    const [embedRes1, embedRes2, embedRes3] = await Promise.all([
      makeEmbed(queryEmotional),
      makeEmbed(querySituational),
      makeEmbed(queryDivine),
    ]);

    if (!embedRes1.ok || !embedRes2.ok || !embedRes3.ok) {
      const errRes = !embedRes1.ok ? embedRes1 : !embedRes2.ok ? embedRes2 : embedRes3;
      const err    = await errRes.json();
      throw new Error(err.error?.message || 'Embedding API error');
    }

    const [embedData1, embedData2, embedData3] = await Promise.all([
      embedRes1.json(),
      embedRes2.json(),
      embedRes3.json(),
    ]);

    const embedding1 = embedData1.data[0].embedding;
    const embedding2 = embedData2.data[0].embedding;
    const embedding3 = embedData3.data[0].embedding;

    // ── Step 3: Hybrid search — all three embeddings in parallel ──────────
    // match_count 20 per angle; 3×20 = 60 unique candidates, more than
    // enough for GPT to pick 3. Lower count reduces Supabase DB load and
    // prevents statement timeouts on the free tier.
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
          match_count:     20,
        }),
      });

    const [supaRes1, supaRes2, supaRes3] = await Promise.all([
      makeSearch(embedding1),
      makeSearch(embedding2),
      makeSearch(embedding3),
    ]);

    if (!supaRes1.ok || !supaRes2.ok || !supaRes3.ok) {
      const errRes = !supaRes1.ok ? supaRes1 : !supaRes2.ok ? supaRes2 : supaRes3;
      const err    = await errRes.json();
      throw new Error(err.message || 'Vector search error');
    }

    const [results1, results2, results3] = await Promise.all([
      supaRes1.json(),
      supaRes2.json(),
      supaRes3.json(),
    ]);

    const safeR1 = Array.isArray(results1) ? results1 : [];
    const safeR2 = Array.isArray(results2) ? results2 : [];
    const safeR3 = Array.isArray(results3) ? results3 : [];

    if (safeR1.length === 0 && safeR2.length === 0 && safeR3.length === 0) {
      throw new Error('Tidak ada ayat yang cocok ditemukan. Silakan coba lagi.');
    }

    // ── A: Round-robin merge all three result lists, deduplicate by verse ID
    // Emotional → Situational → Divine rotation ensures all angles are
    // represented equally at every rank level. A verse appearing in multiple
    // lists (relevant from several angles) is kept at its first occurrence —
    // the strongest signal — and never counted twice.
    const seenIds    = new Set();
    const candidates = [];
    const maxLen     = Math.max(safeR1.length, safeR2.length, safeR3.length);

    for (let i = 0; i < maxLen; i++) {
      for (const list of [safeR1, safeR2, safeR3]) {
        if (i < list.length && !seenIds.has(list[i].id)) {
          candidates.push(list[i]);
          seenIds.add(list[i].id);
        }
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
        temperature:     0.3,
        max_tokens:      700,   // increased: reflection(40w) + 3×verse_resonance(45w) + JSON
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

    // Fetch tafsir fields for selected verse ids in one REST call
    let kemenagMap   = {};
    let ibnuKathirMap   = {};
    let ibnuKathirIdMap = {};
    if (selectedBase.length > 0) {
      const ids = selectedBase.map(v => v.id).join(',');
      const kRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/quran_verses` +
        `?select=id,tafsir_kemenag,tafsir_ibnu_kathir,tafsir_ibnu_kathir_id&id=in.(${encodeURIComponent(ids)})`,
        {
          headers: {
            'apikey':        process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (kRes.ok) {
        const kRows = await kRes.json();
        kemenagMap      = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_kemenag]));
        ibnuKathirMap   = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_ibnu_kathir]));
        ibnuKathirIdMap = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_ibnu_kathir_id]));
      }
    }

    const verseResonance = parsed.verse_resonance || {};

    const ayat = selectedBase.map(v => ({
      id:                    v.id,
      ref:                   `QS. ${v.surah_name} : ${v.verse_number}`,
      surah_name:            v.surah_name,
      verse_number:          v.verse_number,
      arabic:                v.arabic,
      translation:           v.translation,
      resonance:             verseResonance[v.id]       || null,
      tafsir_summary:        v.tafsir_summary           || null,
      tafsir_kemenag:        kemenagMap[v.id]            || null,
      tafsir_ibnu_kathir:    ibnuKathirMap[v.id]         || null,
      tafsir_ibnu_kathir_id: ibnuKathirIdMap[v.id]       || null,
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
