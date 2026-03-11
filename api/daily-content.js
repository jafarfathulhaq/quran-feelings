'use strict';

/**
 * GET /api/daily-content
 *
 * Returns today's daily card content (slides 2-5).
 * Falls back to yesterday's row if today's isn't generated yet.
 * Date is computed in WIB (UTC+7).
 */

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin === 'https://temuquran.com') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Cache 1 hour on CDN + browser, 60s stale-while-revalidate
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=60');

  try {
    const todayWIB = wibDateStr(0);
    let row = await fetchRow(todayWIB);

    // Fallback to yesterday if today's row isn't ready
    if (!row) {
      const yesterdayWIB = wibDateStr(-1);
      row = await fetchRow(yesterdayWIB);
    }

    if (!row) {
      return res.status(404).json({ error: 'No daily content available' });
    }

    return res.status(200).json(row);
  } catch (err) {
    console.error('[daily-content]', err);
    return res.status(500).json({ error: 'Failed to load daily content' });
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get YYYY-MM-DD string in WIB (UTC+7), with optional day offset. */
function wibDateStr(offsetDays) {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600_000 + offsetDays * 86_400_000);
  return wib.toISOString().split('T')[0];
}

/** Fetch a single row from daily_content by date. */
async function fetchRow(dateStr) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/daily_content?content_date=eq.${dateStr}&limit=1`;
  const resp = await fetch(url, {
    headers: {
      'apikey':        process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows.length > 0 ? rows[0] : null;
}
