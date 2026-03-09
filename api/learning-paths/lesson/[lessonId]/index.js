'use strict';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { lessonId } = req.query;
  if (!lessonId) return res.status(400).json({ error: 'Missing lessonId' });

  try {
    // Fetch lesson + content in parallel
    const [lessonRes, contentRes] = await Promise.all([
      supabase.from('lessons').select('id, title, order_num, verse_ref, path_id').eq('id', lessonId).single(),
      supabase.from('lesson_content').select('*').eq('lesson_id', lessonId).single(),
    ]);

    if (lessonRes.error || !lessonRes.data) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    if (contentRes.error || !contentRes.data) {
      return res.status(404).json({ error: 'Lesson content not found' });
    }

    const lesson = lessonRes.data;
    const content = contentRes.data;

    // Parse verse_ref to get surah/ayah for DB lookup
    const verseMatch = lesson.verse_ref?.match(/^(.+?):\s*(\d+)/);
    let verse = null;

    if (verseMatch) {
      const surahName = verseMatch[1].trim();
      const ayah = parseInt(verseMatch[2], 10);

      const { data: verseData } = await supabase
        .from('quran_verses')
        .select('surah_number, verse_number, surah_name, arabic, translation, tafsir_summary, tafsir_kemenag, tafsir_ibnu_kathir_id, tafsir_quraish_shihab, asbabun_nuzul_id')
        .eq('surah_name', surahName)
        .eq('verse_number', ayah)
        .single();

      if (verseData) {
        verse = {
          surah_number: verseData.surah_number,
          ayah_number: verseData.verse_number,
          surah_name: verseData.surah_name,
          text_arabic: verseData.arabic,
          text_indonesian: verseData.translation,
          tafsir_summary: verseData.tafsir_summary,
          tafsir_kemenag: verseData.tafsir_kemenag,
          tafsir_ibnu_kathir_id: verseData.tafsir_ibnu_kathir_id,
          tafsir_quraish_shihab: verseData.tafsir_quraish_shihab,
          asbabun_nuzul_id: verseData.asbabun_nuzul_id,
        };
      }
    }

    // Fetch doa verse if content has a doa reference
    let doa_verse = null;
    if (content.doa && content.doa.surah && content.doa.ayah) {
      const { data: doaData } = await supabase
        .from('quran_verses')
        .select('arabic, translation, surah_name')
        .eq('surah_number', content.doa.surah)
        .eq('verse_number', content.doa.ayah)
        .single();

      if (doaData) {
        doa_verse = {
          text_arabic: doaData.arabic,
          text_indonesian: doaData.translation,
          surah_name: doaData.surah_name,
        };
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=60');

    return res.status(200).json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        order_num: lesson.order_num,
        verse_ref: lesson.verse_ref,
      },
      verse,
      content: {
        insight: content.insight,
        kata_kunci: content.kata_kunci,
        doa: content.doa,
        renungan: content.renungan,
      },
      doa_verse,
    });
  } catch (err) {
    console.error('[lesson-content]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
