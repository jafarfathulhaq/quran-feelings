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

TUGASMU:

LANGKAH 1 — Pahami keadaan pengguna
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

FORMAT OUTPUT — kembalikan HANYA JSON ini, tanpa teks tambahan:
{
  "reflection": "...",
  "selected_ids": ["id1", "id2"]
}

selected_ids harus merupakan nilai "id" dari kandidat (contoh: ["31:14", "46:15"]).
Jangan pernah mengembalikan selected_ids yang kosong.

CONTOH NADA:
Baik: "Semoga ayat ini bisa menemanimu. Kelelahan dalam merawat orang yang kita cintai adalah bentuk cinta yang Allah catat."
Buruk: "Ini adalah pesan Allah untukmu. Allah menyuruhmu untuk bersabar."

Daftar kandidat ayat (dipilih melalui pencarian semantik):
{{CANDIDATES}}`;

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { feeling } = req.body || {};
  if (!feeling || feeling.trim().length < 2) {
    return res.status(400).json({ error: 'Ceritakan apa yang kamu rasakan.' });
  }

  try {
    // ── Step 1: HyDE — generate a hypothetical verse description ───────────
    // Translates colloquial user input into "verse semantic space" before
    // embedding, so the query vector aligns better with verse vectors.
    const hydeRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
              'Berdasarkan perasaan pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
              'tema, pesan, dan konteks ayat Al-Qur\'an yang ideal untuk situasi ini. ' +
              'Gunakan kosakata yang mencerminkan tema-tema Quran: kesabaran, tawakal, ' +
              'tobat, syukur, rezeki, pengampunan, kasih sayang Allah, dll. ' +
              'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.',
          },
          { role: 'user', content: feeling.trim() },
        ],
        max_tokens:  120,
        temperature: 0.3,
      }),
    });

    // Fall back to raw feeling if HyDE fails (non-blocking)
    let queryText = feeling.trim();
    if (hydeRes.ok) {
      const hydeData = await hydeRes.json();
      queryText = hydeData.choices?.[0]?.message?.content?.trim() || queryText;
    }

    // ── Step 2: Embed the HyDE description ────────────────────────────────
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:           'text-embedding-3-small',
        input:           queryText,
        encoding_format: 'float',
      }),
    });

    if (!embedRes.ok) {
      const err = await embedRes.json();
      throw new Error(err.error?.message || 'Embedding API error');
    }

    const embedData      = await embedRes.json();
    const queryEmbedding = embedData.data[0].embedding; // 1536 floats

    // ── Step 3: Vector search — top 20 most similar verses ─────────────────
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/match_verses`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          query_embedding: queryEmbedding,
          match_count:     20,
        }),
      }
    );

    if (!supaRes.ok) {
      const err = await supaRes.json();
      throw new Error(err.message || 'Vector search error');
    }

    const candidates = await supaRes.json();

    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Tidak ada ayat yang cocok ditemukan. Silakan coba lagi.');
    }

    // ── Step 3: GPT-4o-mini selects the best 1-3 from the 15 candidates ────
    const DB_FOR_PROMPT = candidates.map(v => ({
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
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: feeling.trim() },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens:  400,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json();
      throw new Error(err.error?.message || 'OpenAI API error');
    }

    const openaiData = await openaiRes.json();
    const parsed     = JSON.parse(openaiData.choices[0].message.content);

    if (!parsed.selected_ids || !Array.isArray(parsed.selected_ids) || parsed.selected_ids.length === 0) {
      throw new Error('Format respons tidak valid');
    }

    // ── Step 4: Look up selected verses from the candidates (no extra DB call)
    const VERSE_MAP = Object.fromEntries(candidates.map(v => [v.id, v]));

    const ayat = parsed.selected_ids
      .slice(0, 3)
      .map(id => {
        const v = VERSE_MAP[id];
        if (!v) {
          console.warn(`LLM selected id not in candidates: ${id}`);
          return null;
        }
        return {
          id:             v.id,
          ref:            `QS. ${v.surah_name} : ${v.verse_number}`,
          surah_name:     v.surah_name,
          verse_number:   v.verse_number,
          arabic:         v.arabic,
          translation:    v.translation,
          tafsir_summary: v.tafsir_summary || null,
        };
      })
      .filter(Boolean);

    if (ayat.length === 0) {
      throw new Error('Gagal menemukan ayat yang relevan. Silakan coba lagi.');
    }

    return res.status(200).json({
      reflection: parsed.reflection || '',
      ayat,
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan. Silakan coba lagi.' });
  }
};
