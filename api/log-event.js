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
  'share_mode_selected',
  'share_theme_selected',
  'share_completed',
  'share_wa_sent',
  'share_wa_copied',
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
  // Ajarkan Anakku events
  'ajarkan_search_started',
  'ajarkan_search_completed',
  'ajarkan_search_partial_match',
  'ajarkan_not_available',
  'ajarkan_suggestion_tapped',
  'ajarkan_age_under7_selected',
  'ajarkan_age_7plus_selected',
  'ajarkan_category_tapped',
  'ajarkan_question_selected',
  'ajarkan_question_filtered',
  'ajarkan_conversation_copied',
  'ajarkan_penjelasan_copied',
  'ajarkan_aktivitas_viewed',
  'ajarkan_verse_expanded',
  'ajarkan_card_swiped',
  'ajarkan_panduan_fallback',
  'ajarkan_query_miss',
  // Push notification events
  'pwa_session_start',
  'push_opened',
  'push_subscribed',
  'push_permission_denied',
  'push_permission_dismissed',
  // Daily card events
  'daily_card_expanded',
  'daily_card_cta_tapped',
  'daily_card_swiped',
  'daily_content_generated',
  // Nuri events
  'nuri_session_started',
  'nuri_exchange_completed',
  'nuri_session_ended_limit',
  'nuri_optin_toggled',
  'nuri_feedback',
  'nuri_error',
]);

// Rate limit: 120 events per IP per hour
const rlMap = new Map();
const RL_MAX = 120;
const RL_WINDOW = 60 * 60 * 1000;
function checkRL(ip) {
  const now = Date.now();
  const e = rlMap.get(ip) || { count: 0, resetAt: now + RL_WINDOW };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + RL_WINDOW; }
  e.count++;
  rlMap.set(ip, e);
  return e.count <= RL_MAX;
}

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

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRL(ip)) return res.status(429).end();

  const { event_type, properties } = req.body || {};

  // Validate event type against allowlist
  if (!event_type || !VALID_EVENTS.has(event_type)) {
    return res.status(400).end();
  }

  // Sanitise properties: only allow plain objects with primitive values
  // Max 20 properties, 500 chars per string value, 100 chars per key
  const safeProps = {};
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    let count = 0;
    for (const [k, v] of Object.entries(properties)) {
      if (count >= 20) break;
      if (typeof k !== 'string' || k.length > 100) continue;
      if (typeof v === 'string') {
        safeProps[k] = v.slice(0, 500);
        count++;
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        safeProps[k] = v;
        count++;
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
