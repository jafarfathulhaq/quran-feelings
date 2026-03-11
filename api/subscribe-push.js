const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const allowedOrigin = 'https://temuquran.com';

// Rate limit: 10 subscriptions per IP per hour
const rlMap = new Map();
const RL_MAX = 10;
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
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRL(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }

  const { subscription, notifyHour, tzOffset } = req.body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }
  if (typeof notifyHour !== 'number' || notifyHour < 0 || notifyHour > 23) {
    return res.status(400).json({ error: 'Invalid notifyHour' });
  }

  const tzOffsetHours = (tzOffset || 0) / 60;
  const utcHour = ((notifyHour + tzOffsetHours) % 24 + 24) % 24;
  const utcHourInt = Math.round(utcHour) % 24;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        notify_hour: utcHourInt,
        notify_tz_offset: tzOffset || 0,
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('subscribe-push error:', error);
    return res.status(500).json({ error: 'Gagal menyimpan langganan' });
  }

  return res.status(200).json({ ok: true });
};
