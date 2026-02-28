module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { feeling } = req.body || {};
  if (!feeling || feeling.trim().length < 2) {
    return res.status(400).json({ error: 'Ceritakan apa yang kamu rasakan.' });
  }

  try {
    // 1. Ask GPT-4o-mini to find relevant ayat references
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Kamu adalah seorang ulama Al-Qur'an yang bijaksana dan penuh empati. Ketika seseorang menceritakan perasaan atau situasinya, pilihlah tepat 4 ayat Al-Qur'an yang paling relevan, menyentuh hati, dan memberikan ketenangan.

Kembalikan HANYA format JSON ini (tanpa teks tambahan apapun):
{
  "emotion_label": "<label emosi dalam Bahasa Indonesia, 1-3 kata>",
  "emotion_emoji": "<1 emoji yang mewakili perasaan>",
  "ayat": [
    {
      "surah_number": <integer nomor surah 1-114>,
      "ayah_number": <integer nomor ayat>,
      "surah_name": "<nama surah transliterasi latin, contoh: Al-Baqarah>",
      "reflection": "<penjelasan mengapa ayat ini relevan dan menenangkan untuk perasaan tersebut, dalam Bahasa Indonesia, 2-3 kalimat yang tulus dan menyentuh hati>"
    }
  ]
}

Pastikan nomor surah dan ayat 100% akurat sesuai Al-Qur'an. Jangan mengarang nomor ayat.`,
          },
          {
            role: 'user',
            content: feeling.trim(),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 1200,
      }),
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json();
      throw new Error(errData.error?.message || 'OpenAI API error');
    }

    const openaiData = await openaiRes.json();
    const parsed = JSON.parse(openaiData.choices[0].message.content);

    if (!parsed.ayat || !Array.isArray(parsed.ayat)) {
      throw new Error('Format respons tidak valid');
    }

    // 2. Fetch actual Arabic text + Indonesian translation from alquran.cloud
    const ayatWithContent = await Promise.all(
      parsed.ayat.slice(0, 4).map(async (item) => {
        try {
          const quranRes = await fetch(
            `https://api.alquran.cloud/v1/ayah/${item.surah_number}:${item.ayah_number}/editions/quran-simple,id.indonesian`
          );
          const quranData = await quranRes.json();

          if (quranData.code !== 200 || !quranData.data || quranData.data.length < 2) {
            throw new Error('Quran API error');
          }

          return {
            surah_name: item.surah_name,
            surah_number: item.surah_number,
            ayah_number: item.ayah_number,
            ref: `QS. ${item.surah_name} : ${item.ayah_number}`,
            arabic: quranData.data[0].text,
            indonesian: quranData.data[1].text,
            reflection: item.reflection,
          };
        } catch (e) {
          console.error(`Failed to fetch ${item.surah_number}:${item.ayah_number}`, e.message);
          return null;
        }
      })
    );

    const validAyat = ayatWithContent.filter(Boolean);

    if (validAyat.length === 0) {
      throw new Error('Gagal mengambil ayat. Silakan coba lagi.');
    }

    return res.status(200).json({
      emotion_label: parsed.emotion_label,
      emotion_emoji: parsed.emotion_emoji,
      ayat: validAyat,
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan. Silakan coba lagi.' });
  }
};
