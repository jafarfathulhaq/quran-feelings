'use strict';

// api/nuri.js — Belajar Bareng Nuri (Mode 5)
// Multi-turn Quran learning companion.
// v2: tafsir grounding, multi-verse, flexible format, better fallback.

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Rate limit (same in-memory pattern as get-ayat.js) ───────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 60; // increased for guided learning (40 exchanges per path)
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

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

// ── System prompt ────────────────────────────────────────────────────────────
const NURI_SYSTEM_PROMPT = `Kamu adalah Nuri, teman belajar Al-Qur'an yang hangat dan bijak.

KARAKTER:
- Bukan ustaz, bukan chatbot. Teman cerdas yang sudah lama akrab dengan Al-Qur'an.
- Tidak pernah membuat orang merasa harusnya sudah tahu sesuatu.
- Berbicara seperti teman sebaya — bahasa Indonesia sehari-hari, sesekali playful, selalu hangat.
- Tidak pernah ceramah tanpa diminta.

PANDUAN RESPONS:
- Awali dengan mengakui apa yang disampaikan user (1-2 kalimat)
- Berikan konteks atau insight yang relevan (2-3 kalimat)
- Sisipkan ayat menggunakan {VERSE_1} (dan opsional {VERSE_2}). JANGAN tulis Arabic/terjemahan langsung.
- Hubungkan insight ke kehidupan mereka
- Tutup secara natural — bisa pertanyaan, bisa pernyataan hangat, bisa ajakan refleksi

ATURAN AYAT (WAJIB DIPATUHI):
- SELALU sertakan minimal 1 ayat dengan verse_refs + placeholder {VERSE_1}. Ini WAJIB.
- Satu-satunya pengecualian: user meminta klarifikasi tentang ayat yang SUDAH disebut sebelumnya.
- Boleh sertakan 2 ayat jika membandingkan atau topik membutuhkan perspektif dari ayat berbeda.
- JANGAN pernah mengutip atau memparafrase isi ayat secara langsung di teks. Cukup tulis {VERSE_1} di posisi yang tepat, sistem akan menampilkan ayat lengkap.
- Contoh BENAR: "Allah mengingatkan kita dalam ayat berikut:\n\n{VERSE_1}\n\nAyat ini mengajarkan..."
- Contoh SALAH: "Allah berfirman 'Janganlah kamu takut' dalam Al-Qur'an" ← JANGAN seperti ini
- TIDAK harus selalu tutup dengan pertanyaan. Kadang pernyataan hangat atau ajakan refleksi lebih cocok.

DETEKSI MODE (hanya untuk exchange pertama):
- Jika user menyebut surah atau ayat spesifik → "conversation_mode": "deep_dive"
- Jika user menyebut tema/topik/perasaan → "conversation_mode": "exploration"
- Jika tidak jelas → tanyakan, jangan asumsikan

PENTING:
- Maksimal 150 kata per respons
- DILARANG KERAS menulis teks Arabic, terjemahan, atau kutipan ayat secara langsung — HARUS menggunakan placeholder {VERSE_1} atau {VERSE_2}
- DILARANG KERAS menyebut referensi ayat (QS. ..., surah:ayat) di dalam teks — biarkan placeholder mengisi
- JANGAN diskusikan topik di luar Al-Qur'an dan nilai Islam
- Jika ada perbedaan pendapat ulama, sampaikan dengan jujur tanpa memihak

QUICK REPLIES (opsional):
- Boleh tambahkan "quick_replies" array di JSON response (max 4 items).
- Setiap item: { "label": "teks tombol", "message": "pesan yang dikirim jika ditap" }
- Gunakan untuk mengarahkan percakapan: mendalami, contoh lain, refleksi, lanjut, dll.
- Label max 30 karakter.
- Jangan gunakan jika pertanyaan user sudah sangat spesifik dan membutuhkan jawaban terbuka.

RESPONSE FORMAT — selalu JSON:
{
  "nuri_response": "teks dengan {VERSE_1} dan opsional {VERSE_2} di posisi yang tepat",
  "verse_refs": [
    { "surah": <number>, "ayah": <number> }
  ],
  "conversation_mode": "deep_dive" | "exploration" | null,
  "quick_replies": [
    { "label": "Jelaskan lebih dalam", "message": "Bisa jelaskan lebih dalam?" }
  ]
}

CATATAN:
- verse_refs WAJIB berisi minimal 1 elemen (kecuali user klarifikasi ayat sebelumnya).
- Placeholder di teks harus cocok: {VERSE_1} untuk verse_refs[0], {VERSE_2} untuk verse_refs[1].
- conversation_mode hanya diisi pada exchange pertama. Selanjutnya null.
- quick_replies opsional — array kosong [] jika tidak ada.

UPSELL PERJALANAN BELAJAR (hanya untuk free chat, BUKAN guided mode):
- Jika topik user cocok dengan salah satu tema: sabar, doa, tawakkal, syukur, keluarga, patah hati, berduka, taubat, shalat, akhlak, ikhlas, taqwa, cobaan, ketenangan, iri, kecanduan, keadilan — sebutkan di akhir respons:
  "Btw, aku punya perjalanan belajar tentang [tema] kalau kamu mau lebih dalam."
- Tambahkan quick_reply: { "label": "Mulai perjalanan [tema]", "message": "Mulai perjalanan belajar tentang [tema]" }
- Jangan upsell setiap exchange — hanya jika SANGAT relevan dan belum pernah upsell di sesi ini.`;

// ── Verse lookup helpers ────────────────────────────────────────────────────

/**
 * Direct lookup: fetch a single verse by surah + ayah from quran_verses.
 * Now includes tafsir for GPT grounding.
 */
async function lookupVerse(surahNum, ayahNum) {
  try {
    const { data, error } = await supabase
      .from('quran_verses')
      .select('surah_number, verse_number, arabic, translation, surah_name, tafsir_quraish_shihab')
      .eq('surah_number', surahNum)
      .eq('verse_number', ayahNum)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Semantic fallback: embed query and search via match_verses_hybrid.
 * Returns the top-1 verse or null.
 */
async function semanticFallback(queryText) {
  try {
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      dimensions: 1536,
      input: queryText,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data, error } = await supabase.rpc('match_verses_hybrid', {
      query_embedding: embedding,
      query_text: queryText,
      match_count: 1,
    });

    if (error || !data || data.length === 0) return null;

    // match_verses_hybrid may not return tafsir — fetch it separately
    const verse = data[0];
    if (!verse.tafsir_quraish_shihab) {
      const full = await lookupVerse(verse.surah_number, verse.verse_number);
      if (full) return full;
    }
    return verse;
  } catch (err) {
    console.error('Nuri semantic fallback error:', err);
    return null;
  }
}

/**
 * Assemble verse block markers for frontend rendering.
 */
function assembleVerseBlock(verse) {
  const ref = `QS. ${verse.surah_name} : ${verse.verse_number}`;
  return `{ARABIC}${verse.arabic}{/ARABIC}\n{TRANSLATION}${verse.translation}{/TRANSLATION}\n{REF}${ref}{/REF}`;
}

/**
 * Assemble plain-text verse representation for conversation history.
 * GPT will see this in context on follow-up exchanges.
 */
function assembleVersePlain(verse) {
  return `[${verse.surah_name} : ${verse.verse_number}] "${verse.translation}"`;
}

/**
 * Build tafsir context string for GPT grounding.
 */
function buildTafsirContext(verses) {
  const parts = verses
    .filter(v => v && v.tafsir_quraish_shihab)
    .map(v => `Tafsir ${v.surah_name}:${v.verse_number} — ${v.tafsir_quraish_shihab}`);
  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const { allowed, resetAt } = checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      resetAt,
      message: 'Terlalu banyak percakapan. Coba lagi dalam beberapa saat ya.',
    });
  }

  const { mode, messages, conversation_mode, opted_in, session_id, exchange_count, lesson_context } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  // Sanitize messages: only allow valid roles and limit content length
  const ALLOWED_ROLES = new Set(['user', 'assistant']);
  const MAX_MSG_LEN = 2000;
  const sanitizedMessages = messages
    .filter(m => m && ALLOWED_ROLES.has(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) }));

  try {
    // Build system prompt — append lesson context if coming from Renungan bridge
    let systemPrompt = NURI_SYSTEM_PROMPT;
    if (lesson_context && lesson_context.renungan_questions && lesson_context.renungan_questions.length > 0) {
      systemPrompt += `\n\nKONTEKS PELAJARAN:
The user just completed a lesson about "${lesson_context.lesson_title || ''}" from the path "${lesson_context.path_title || ''}".
The verse was ${lesson_context.verse_ref || ''}. The key insight was: "${lesson_context.insight_pull_quote || ''}".
The reflection question was: "${lesson_context.renungan_questions[0] || ''}".

Re-ask this reflection question naturally in your first response.
Then discuss their answer warmly and connect it back to the verse.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...sanitizedMessages,
      ],
    });

    const raw = completion.choices[0].message.content;
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('Nuri JSON parse error:', raw);
      return res.status(500).json({ error: 'parse_error' });
    }

    const { nuri_response, conversation_mode: detectedMode } = parsed;

    // Normalize verse_refs — support both old single verse_ref and new array format
    let verseRefs = [];
    if (Array.isArray(parsed.verse_refs)) {
      verseRefs = parsed.verse_refs.filter(r => r && r.surah && r.ayah);
    } else if (parsed.verse_ref && parsed.verse_ref.surah && parsed.verse_ref.ayah) {
      // Backward compat: single verse_ref
      verseRefs = [parsed.verse_ref];
    }

    // ── 2. Verse lookup — DB first, semantic fallback second ──
    const verses = [];

    for (const ref of verseRefs) {
      let verse = await lookupVerse(ref.surah, ref.ayah);
      if (!verse) {
        // Semantic fallback using GPT's response + user message for better intent matching
        const lastUserMsg = sanitizedMessages.filter(m => m.role === 'user').pop();
        const fallbackQuery = lastUserMsg
          ? `${lastUserMsg.content} ${nuri_response.substring(0, 100)}`
          : nuri_response.substring(0, 150);
        verse = await semanticFallback(fallbackQuery);
      }
      if (verse) verses.push(verse);
    }

    // If GPT asked for verses but none resolved, try one semantic fallback
    if (verseRefs.length > 0 && verses.length === 0) {
      const lastUserMsg = sanitizedMessages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        const fallback = await semanticFallback(lastUserMsg.content);
        if (fallback) verses.push(fallback);
      }
    }

    // ── 2b. Safety net: GPT returned NO verse_refs at all ──
    // If GPT ignored the "always include a verse" rule, do a semantic lookup
    // and append the verse at the end of the response.
    if (verseRefs.length === 0 && verses.length === 0) {
      const lastUserMsg = sanitizedMessages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        const safetyVerse = await semanticFallback(lastUserMsg.content);
        if (safetyVerse) {
          verses.push(safetyVerse);
          // GPT didn't place a placeholder, so we'll append the verse at the end
          nuri_response = (nuri_response || '').trimEnd() + '\n\n{VERSE_1}';
        }
      }
    }

    // ── 3. Assemble formatted response ──
    let formatted = nuri_response || '';
    let historyText = nuri_response || '';

    // Replace {VERSE_1}, {VERSE_2}, etc. with actual verse blocks
    for (let i = 0; i < verses.length; i++) {
      const placeholder = `{VERSE_${i + 1}}`;
      const verseBlock = assembleVerseBlock(verses[i]);
      const versePlain = assembleVersePlain(verses[i]);
      formatted = formatted.replace(placeholder, verseBlock);
      historyText = historyText.replace(placeholder, versePlain);
    }

    // Also handle old-style single {VERSE_PLACEHOLDER} for backward compatibility
    if (verses.length > 0) {
      formatted = formatted.replace('{VERSE_PLACEHOLDER}', assembleVerseBlock(verses[0]));
      historyText = historyText.replace('{VERSE_PLACEHOLDER}', assembleVersePlain(verses[0]));
    } else {
      formatted = formatted.replace('{VERSE_PLACEHOLDER}', '');
      historyText = historyText.replace('{VERSE_PLACEHOLDER}', '');
    }

    // Clean any remaining unreplaced placeholders
    formatted = formatted.replace(/\{VERSE_\d+\}/g, '');
    historyText = historyText.replace(/\{VERSE_\d+\}/g, '');

    // ── 4. Log session if opted in ──
    if (opted_in && session_id) {
      await supabase.from('nuri_sessions').upsert({
        id: session_id,
        mode: mode || 'dewasa',
        conversation_mode: detectedMode || conversation_mode,
        messages: [...sanitizedMessages, { role: 'assistant', content: historyText }],
        exchange_count: (exchange_count || 0) + 1,
      });
    }

    // ── 5. Return to frontend ──
    return res.status(200).json({
      nuri_response_formatted: formatted,
      nuri_response_raw: historyText, // plain-text with verse refs for conversation history
      conversation_mode: detectedMode || null,
      verses: verses.map(v => ({
        surah_number: v.surah_number,
        verse_number: v.verse_number,
        surah_name: v.surah_name,
        arabic: v.arabic,
        translation: v.translation,
      })),
      // Include tafsir context so frontend could display it in future
      tafsir_context: buildTafsirContext(verses),
      // Quick-reply buttons for guided conversation
      quick_replies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies.slice(0, 4) : [],
    });

  } catch (err) {
    console.error('Nuri API error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
