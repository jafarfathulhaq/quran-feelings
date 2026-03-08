'use strict';

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Rate limit ───────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return { allowed: entry.count <= RATE_LIMIT, resetAt: entry.resetAt };
}

// ── Parse verse_ref like "Al-Baqarah: 45" or "Al-Baqarah: 155-156" ─────────
function parseVerseRef(ref) {
  if (!ref) return null;
  const colonIdx = ref.lastIndexOf(':');
  if (colonIdx === -1) return null;

  const surahName = ref.substring(0, colonIdx).trim();
  const verseStr = ref.substring(colonIdx + 1).trim();

  // Handle range like "155-156"
  if (verseStr.includes('-')) {
    const [start, end] = verseStr.split('-').map(Number);
    if (isNaN(start) || isNaN(end)) return null;
    const verses = [];
    for (let i = start; i <= end; i++) verses.push(i);
    return { surahName, verses };
  }

  const num = parseInt(verseStr, 10);
  if (isNaN(num)) return null;
  return { surahName, verses: [num] };
}

// ── Fetch verse texts from quran_verses ─────────────────────────────────────
async function fetchVerseTexts(verseRef) {
  const parsed = parseVerseRef(verseRef);
  if (!parsed) return { arabic: '', indonesian: '', ref: verseRef };

  const { surahName, verses } = parsed;

  const { data, error } = await supabase
    .from('quran_verses')
    .select('surah_number, verse_number, arabic, translation, surah_name')
    .eq('surah_name', surahName)
    .in('verse_number', verses)
    .order('verse_number');

  if (error || !data || data.length === 0) {
    return { arabic: '', indonesian: '', ref: verseRef, surah_number: null, verse_start: verses[0] };
  }

  return {
    arabic: data.map(v => v.arabic).join(' '),
    indonesian: data.map(v => v.translation).join(' '),
    ref: verseRef,
    surah_number: data[0].surah_number,
    verse_start: data[0].verse_number,
    surah_name: data[0].surah_name,
  };
}

// ── System prompt template ──────────────────────────────────────────────────
function buildSystemPrompt(pathTitle, pathType, order, lessonTitle, verseRef, verseTextAr, verseTextId, supportingRef, supportingAr, supportingId) {
  let prompt = `You are Nuri, a Quran learning companion inside the TemuQuran app.

You are generating content for a guided learning lesson.

Context:
- Learning path: "${pathTitle}" (${pathType})
- Lesson ${order} of 5: "${lessonTitle}"
- Anchor verse: ${verseRef}
- Verse text (Arabic): ${verseTextAr}
- Verse text (Indonesian): ${verseTextId}`;

  if (supportingRef) {
    prompt += `
- Supporting verse: ${supportingRef}
- Supporting verse text (Arabic): ${supportingAr}
- Supporting verse text (Indonesian): ${supportingId}`;
  }

  prompt += `

Generate a lesson with exactly this JSON structure:
{
  "explanation": "80-120 words in Indonesian. Simple, conversational, based on mainstream tafsir. No fatwa. Warm tone.",
  "why_this_verse": "1-2 sentences in Indonesian. Why this verse matters for daily life.",
  "reflection": "One personal, open-ended question in Indonesian. Like a caring friend asking."
}

Rules:
- Simple Indonesian, not academic
- Based on mainstream tafsir consensus (Ibnu Katsir, Jalalain, Quraish Shihab)
- No controversial interpretations
- No religious rulings or fatwas
- Tone: knowledgeable friend, not ustadz lecturing
- If path type is 'situation': emphasize comfort and emotional relevance
- If path type is 'topic': emphasize understanding and learning
- Respond ONLY with valid JSON`;

  return prompt;
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const allowedOrigin = 'https://temuquran.com';
  const origin = req.headers.origin;
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const { allowed, resetAt } = checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      resetAt,
      message: 'Terlalu banyak permintaan. Coba lagi dalam beberapa saat.',
    });
  }

  const { lessonId } = req.query;
  if (!lessonId) {
    return res.status(400).json({ error: 'Missing lessonId' });
  }

  try {
    // 1. Look up lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (lessonError || !lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // 2. Look up path
    const { data: path, error: pathError } = await supabase
      .from('learning_paths')
      .select('*')
      .eq('id', lesson.path_id)
      .single();

    if (pathError || !path) {
      return res.status(404).json({ error: 'Path not found' });
    }

    // 3. Fetch verse texts (parallel)
    const [anchorVerse, supportingVerse] = await Promise.all([
      fetchVerseTexts(lesson.verse_ref),
      lesson.supporting_verse_ref ? fetchVerseTexts(lesson.supporting_verse_ref) : null,
    ]);

    // 4. Call GPT
    const systemPrompt = buildSystemPrompt(
      path.title,
      path.type,
      lesson.order_num,
      lesson.title,
      lesson.verse_ref,
      anchorVerse.arabic || '(not found)',
      anchorVerse.indonesian || '(not found)',
      lesson.supporting_verse_ref,
      supportingVerse?.arabic || '',
      supportingVerse?.indonesian || '',
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the lesson content.' },
      ],
    });

    const raw = completion.choices[0].message.content;
    let generated;

    try {
      // Handle potential markdown fences
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      generated = JSON.parse(cleaned);
    } catch {
      console.error('Lesson generate JSON parse error:', raw);
      return res.status(500).json({ error: 'parse_error' });
    }

    // 5. Return combined response
    return res.status(200).json({
      explanation: generated.explanation || '',
      why_this_verse: generated.why_this_verse || '',
      reflection: generated.reflection || '',
      verse_text_ar: anchorVerse.arabic,
      verse_text_id: anchorVerse.indonesian,
      verse_ref: lesson.verse_ref,
      surah_number: anchorVerse.surah_number,
      verse_start: anchorVerse.verse_start,
      supporting_verse_text_ar: supportingVerse?.arabic || null,
      supporting_verse_text_id: supportingVerse?.indonesian || null,
      supporting_verse_ref: lesson.supporting_verse_ref || null,
    });
  } catch (err) {
    console.error('Lesson generate error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
