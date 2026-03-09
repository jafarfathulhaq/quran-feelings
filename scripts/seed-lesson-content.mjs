#!/usr/bin/env node
// Seed lesson_content table — one GPT call per path (50 calls total, ~$0.50)
// Usage:
//   node scripts/seed-lesson-content.mjs              # seed all 50 paths
//   node scripts/seed-lesson-content.mjs --path sabar  # re-seed one path

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const SYSTEM_PROMPT = `You are creating learning content for TemuQuran, a Quran learning app.
The goal is to transform classical tafsir into short, engaging learning cards for mobile.

=== WRITING VOICE ===

Write as Nuri — a warm, calm friend explaining the Quran.
Short sentences. Conversational Indonesian. Not a khutbah, not a textbook.
Structure each explanation: start with a small interesting detail from the verse,
explain what scholars say about it, end with a reflective takeaway.

=== CRITICAL RULES ===

1. The core meaning of every insight must come from the provided tafsir.
   You may simplify wording but do NOT introduce new theological interpretations.
   Do NOT add Islamic knowledge from outside the provided tafsir.

2. When multiple tafsir sources are provided, identify the most clear or
   insightful explanation from ONE scholar and use it as the primary lens.
   Do not blend multiple interpretations into a vague summary.
   Choose one strong angle and explain it simply.

3. For kata_kunci: select Arabic words or short phrases that the tafsir
   specifically discusses or explains. Maximum 2.
   If no words or phrases are specifically analyzed in the tafsir, return null.

4. For doa: suggest a Quranic dua that matches the theme.
   Prefer duas referenced in the tafsir. Give surah + ayah number.
   If uncertain whether the connection is strong, return null.

5. For renungan: the scenario must connect directly to the message
   explained in the insight. Do not write generic motivational advice.
   Make it specific to everyday Indonesian Muslim life.

6. Do not produce legal rulings (halal/haram). Focus on moral and spiritual lessons.

7. Do not use metaphors comparing Allah to created things.

8. Conciseness limits:
   - pull_quote: under 25 words
   - explanation: under 50 words
   - kata_kunci explanations: under 40 words each
   - renungan scenario: under 50 words
   - maximum 2 reflection questions

=== INTERNAL ANALYSIS (DO NOT OUTPUT) ===

Before writing the final content, follow these steps internally:

1. Read all three tafsir carefully.
2. Identify which ONE scholar gives the clearest or most interesting insight.
3. Extract the core message based on that scholar's explanation.
4. Identify any Arabic word or phrase that the tafsir specifically explains.
5. Identify the emotional or moral takeaway for everyday life.
6. Consider how this lesson fits within the 5-lesson path progression —
   avoid repeating insights from other lessons in this path.

Only after completing this reasoning, write the final JSON output.

=== OUTPUT ===

Return ONLY valid JSON, no markdown, no backticks.`;

function buildUserPrompt(path, lessons) {
  let prompt = `Tema perjalanan: ${path.title}
Deskripsi: ${path.description}

Buat konten untuk ${lessons.length} pelajaran di bawah ini. Pastikan ada progresi —
dari pemahaman dasar ke refleksi yang lebih dalam. Jangan ulangi insight yang sama.

Juga buat path_intro (2-3 kalimat pembuka perjalanan) dan path_closing
(2-3 kalimat refleksi penutup setelah ${lessons.length} pelajaran selesai).

`;

  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    prompt += `=== PELAJARAN ${i + 1}: ${l.title} ===
${l.verse?.text_arabic || '(Arabic not available)'}
${l.verse?.text_indonesian || '(Translation not available)'}
— QS. ${l.verse_ref}

Tafsir Kemenag: ${l.verse?.tafsir_kemenag || '(not available)'}
Tafsir Ibnu Katsir: ${l.verse?.tafsir_ibnu_kathir_id || '(not available)'}
Tafsir Quraish Shihab: ${l.verse?.tafsir_quraish_shihab || '(not available)'}
Ringkasan: ${typeof l.verse?.tafsir_summary === 'object' ? JSON.stringify(l.verse.tafsir_summary) : (l.verse?.tafsir_summary || '(not available)')}

`;
  }

  prompt += `Buatkan konten pembelajaran untuk kelima pelajaran berdasarkan tafsir di atas.

Return JSON:
{
  "path_intro": "...",
  "path_closing": "...",
  "lessons": [
    { "insight": {"pull_quote":"...","explanation":"..."}, "kata_kunci": [...] or null, "doa": {"surah":number,"ayah":number,"intro":"...","practical_tip":"..."} or null, "renungan": {"scenario":"...","questions":["...","..."]} },
    ...repeat for each lesson...
  ]
}`;

  return prompt;
}

async function fetchPathWithLessons(pathId) {
  const { data: path, error: pathErr } = await supabase
    .from('learning_paths')
    .select('id, title, description, type')
    .eq('id', pathId)
    .single();

  if (pathErr || !path) throw new Error(`Path not found: ${pathId}`);

  const { data: lessons, error: lessonsErr } = await supabase
    .from('lessons')
    .select('id, title, order_num, verse_ref')
    .eq('path_id', pathId)
    .order('order_num');

  if (lessonsErr) throw new Error(`Failed to fetch lessons for ${pathId}`);

  // Resolve verse data for each lesson
  for (const lesson of lessons) {
    const match = lesson.verse_ref?.match(/^(.+?):\s*(\d+)/);
    if (!match) continue;
    const surahName = match[1].trim();
    const ayah = parseInt(match[2], 10);

    const { data: verse } = await supabase
      .from('quran_verses')
      .select('text_arabic, text_indonesian, tafsir_kemenag, tafsir_ibnu_kathir_id, tafsir_quraish_shihab, tafsir_summary, asbabun_nuzul_id')
      .eq('surah_name', surahName)
      .eq('verse_number', ayah)
      .single();

    lesson.verse = verse;
  }

  return { path, lessons };
}

async function generateContent(path, lessons) {
  const userPrompt = buildUserPrompt(path, lessons);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0].message.content;
  return JSON.parse(raw);
}

async function validateDoaVerse(doa) {
  if (!doa || !doa.surah || !doa.ayah) return true;
  const { data } = await supabase
    .from('quran_verses')
    .select('id')
    .eq('surah_number', doa.surah)
    .eq('verse_number', doa.ayah)
    .single();
  return !!data;
}

async function seedPath(pathId) {
  console.log(`\n📖 Processing: ${pathId}`);

  const { path, lessons } = await fetchPathWithLessons(pathId);
  console.log(`  Found ${lessons.length} lessons`);

  const result = await generateContent(path, lessons);

  if (!result.lessons || result.lessons.length !== lessons.length) {
    console.error(`  ❌ GPT returned ${result.lessons?.length || 0} lessons, expected ${lessons.length}`);
    return false;
  }

  // Validate and upsert each lesson
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const content = result.lessons[i];

    if (!content.insight || !content.renungan) {
      console.error(`  ❌ Lesson ${lesson.id}: missing insight or renungan`);
      continue;
    }

    // Validate doa verse exists
    if (content.doa) {
      const doaValid = await validateDoaVerse(content.doa);
      if (!doaValid) {
        console.warn(`  ⚠️  Lesson ${lesson.id}: doa verse ${content.doa.surah}:${content.doa.ayah} not found, setting to null`);
        content.doa = null;
      }
    }

    const { error } = await supabase
      .from('lesson_content')
      .upsert({
        lesson_id: lesson.id,
        insight: content.insight,
        kata_kunci: content.kata_kunci || null,
        doa: content.doa || null,
        renungan: content.renungan,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'lesson_id' });

    if (error) {
      console.error(`  ❌ Failed to upsert ${lesson.id}:`, error.message);
    } else {
      console.log(`  ✅ ${lesson.id}`);
    }
  }

  // Update path intro/closing
  if (result.path_intro || result.path_closing) {
    const { error } = await supabase
      .from('learning_paths')
      .update({
        path_intro: result.path_intro || null,
        path_closing: result.path_closing || null,
      })
      .eq('id', pathId);

    if (error) {
      console.error(`  ❌ Failed to update path intro/closing:`, error.message);
    } else {
      console.log(`  ✅ path_intro + path_closing updated`);
    }
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const pathFlag = args.indexOf('--path');

  if (pathFlag !== -1 && args[pathFlag + 1]) {
    // Single path mode
    const pathId = args[pathFlag + 1];
    await seedPath(pathId);
  } else {
    // All paths mode
    const { data: paths, error } = await supabase
      .from('learning_paths')
      .select('id')
      .order('id');

    if (error || !paths) {
      console.error('Failed to fetch paths:', error?.message);
      process.exit(1);
    }

    console.log(`Found ${paths.length} paths to seed`);
    let success = 0;
    let failed = 0;

    for (const p of paths) {
      try {
        const ok = await seedPath(p.id);
        if (ok) success++;
        else failed++;
      } catch (err) {
        console.error(`  ❌ ${p.id}: ${err.message}`);
        failed++;
      }

      // Delay between calls to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n🏁 Done: ${success} succeeded, ${failed} failed out of ${paths.length} paths`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
