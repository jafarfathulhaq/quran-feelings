'use strict';

// ── Privacy-safe analytics proxy ───────────────────────────────────────────
// Receives behaviour events from the frontend and writes them to Supabase.
// We keep all Supabase credentials server-side so they never appear in
// client HTML/JS.  The analytics_events table has RLS set to INSERT-only
// for the anon role — no content is ever stored, only event type + metadata.

// Allowlist of valid event types so the endpoint can't be abused to
// insert arbitrary data into our analytics table.
const VALID_EVENTS = new Set([
  'search_started',
  'search_completed',
  'search_cached',
  'mood_feedback',
  'verse_saved',
  'verse_unsaved',
  'verse_shared',
  'verse_played',
  'tafsir_opened',
  'tafsir_tab',
  'asbabun_nuzul_opened',
  'mode_selected',
  'card_expanded',
  'sub_question_selected',
  'tulis_sendiri_opened',
  'verse_swiped',
  'jelajahi_search',
  'jelajahi_juz_surah_selected',
  'jelajahi_surah_browser',
  'jelajahi_juz_group_opened',
  'jelajahi_multi_selected',
  'share_sheet_opened',
  'share_theme_selected',
  'share_completed',
  'tafsir_summary_opened',
  'tafsir_summary_swiped',
  'tafsir_full_opened',
  'tafsir_overlay_closed',
  'a2hs_tapped',
  'a2hs_installed',
  'about_opened',
  'about_faq_tapped',
  'qris_saved',
  'tafsir_full_tab_switched',
]);

module.exports = async function handler(req, res) {
  const allowedOrigin = 'https://temuquran.com';
  const origin = req.headers.origin;
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { event_type, properties } = req.body || {};

  // Validate event type against allowlist
  if (!event_type || !VALID_EVENTS.has(event_type)) {
    return res.status(400).end();
  }

  // Sanitise properties: only allow plain objects with primitive values
  const safeProps = {};
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [k, v] of Object.entries(properties)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safeProps[k] = v;
      }
    }
  }

  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ event_type, properties: safeProps }),
    });
  } catch {
    // Silently swallow — analytics failures must never surface to users
  }

  return res.status(204).end();
};
