'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load curated verse database (bundled at deploy time) ──────────────────────
const VERSES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/verses.json'), 'utf8')
);

// Fast lookup map: id ("31:14") → full verse object
const VERSE_MAP = Object.fromEntries(VERSES.map(v => [v.id, v]));

// Compact version sent to LLM — no Arabic/translation needed for selection
const DB_FOR_PROMPT = VERSES.map(v => ({
  id:             v.id,
  surah_name:     v.surah_name,
  verse_number:   v.verse_number,
  themes:         v.themes,
  tafsir_summary: v.tafsir_summary,
}));

// ── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah asisten untuk aplikasi refleksi Al-Qur'an.

Tugasmu BUKAN untuk menghasilkan atau mengarang ayat Al-Qur'an.
Tugasmu HANYA memilih ayat yang paling relevan dari database yang disediakan, berdasarkan curahan hati pengguna.

ATURAN KRITIS:
1. JANGAN pernah mengarang atau memodifikasi ayat Al-Qur'an.
2. HANYA pilih dari database yang disediakan, menggunakan nilai "id" yang persis sama.
3. Pilih maksimal 3 ayat. Minimal 1.
4. Pilih 2–3 ayat yang saling melengkapi jika memungkinkan.

TUJUAN:
Bantu pengguna merefleksikan diri melalui ayat yang relevan secara emosional DAN situasional.
Bersikap rendah hati. Jangan mengklaim berbicara atas nama Allah. Jangan memberikan fatwa agama.

TUGASMU:

LANGKAH 1 — Pahami keadaan pengguna
Identifikasi:
• Nada emosional mereka (sedih, lelah, cemas, marah, dll.)
• Situasi kehidupan spesifik mereka (mengasuh anak, tekanan kerja, hubungan, kesehatan, rasa bersalah, dll.)
• Apa yang paling mereka butuhkan sekarang (ketenangan, harapan, kesabaran, pengampunan, bimbingan, dll.)

LANGKAH 2 — Pilih ayat yang cocok
Prioritaskan: kecocokan situasional > kecocokan emosional > penghiburan umum

Contoh:
• Kelelahan mengasuh anak → utamakan ayat parenting + kelelahan, BUKAN hanya ayat "setelah kesulitan ada kemudahan" yang generik
• Khawatir tentang keuangan → utamakan ayat rezeki/ketawakalan
• Merasa bersalah → utamakan ayat tobat/pengampunan
• Marah pada seseorang → utamakan ayat menahan amarah/memaafkan

Periksa "themes" dan "tafsir_summary" setiap ayat untuk menentukan relevansinya.

LANGKAH 3 — Tulis pesan refleksi
Maksimal 80 kata. Dalam Bahasa Indonesia. Lembut, rendah hati, mendukung.
Gunakan frasa seperti: "Semoga ayat ini bisa menemanimu", "Ayat ini mengingatkan kita", "Mungkin ayat ini relevan"
JANGAN katakan: "Ini jawaban Allah untukmu", "Allah sedang memberitahumu", "Kamu harus..."
Sebut situasi spesifik mereka, jangan hanya bicara tentang emosi umum.

FORMAT OUTPUT — kembalikan HANYA JSON ini, tanpa teks tambahan:
{
  "reflection": "...",
  "selected_ids": ["id1", "id2"]
}

selected_ids harus merupakan nilai "id" dari database (contoh: ["31:14", "46:15"]).
Jangan pernah mengembalikan selected_ids yang kosong.

CONTOH NADA:
Baik: "Semoga ayat ini bisa menemanimu. Kelelahan dalam merawat orang yang kita cintai adalah bentuk cinta yang Allah catat dengan penuh perhatian."
Buruk: "Ini adalah pesan Allah untukmu. Allah menyuruhmu untuk bersabar."

Database ayat Al-Qur'an:
${JSON.stringify(DB_FOR_PROMPT, null, 2)}`;

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
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: feeling.trim() },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,   // lower = more consistent, precise selection
        max_tokens: 400,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json();
      throw new Error(err.error?.message || 'OpenAI API error');
    }

    const openaiData = await openaiRes.json();
    const parsed = JSON.parse(openaiData.choices[0].message.content);

    if (!parsed.selected_ids || !Array.isArray(parsed.selected_ids) || parsed.selected_ids.length === 0) {
      throw new Error('Format respons tidak valid');
    }

    // Look up selected verses from our database (guaranteed accurate Arabic + translation)
    const ayat = parsed.selected_ids
      .slice(0, 3)
      .map(id => {
        const v = VERSE_MAP[id];
        if (!v) {
          console.warn(`LLM selected unknown id: ${id}`);
          return null;
        }
        return {
          id:             v.id,
          ref:            `QS. ${v.surah_name} : ${v.verse_number}`,
          surah_name:     v.surah_name,
          verse_number:   v.verse_number,
          arabic:         v.arabic,
          translation:    v.translation,
          tafsir_summary: v.tafsir_summary,
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
