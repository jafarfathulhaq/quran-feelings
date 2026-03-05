const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// 0=Sunday, 1=Monday, 3=Wednesday, 5=Friday
const SCHEDULE = {
  1: 'votd',
  3: 'curhat',
  5: 'panduan',
  0: 'jelajahi',
};

const COPY = {
  votd: {
    title: 'Ayat Hari Ini',
    bodies: [
      'Mulai minggu dengan satu ayat. Buka dan resapi.',
      'Ada ayat yang menunggumu hari ini.',
      'Satu kalimat dari Allah untuk memulai harimu.',
      'Senin yang tenang dimulai dari satu ayat.',
    ],
    actions: [
      { action: 'open', title: 'Buka Ayat' },
      { action: 'dismiss', title: 'Tutup' },
    ],
    urlPath: '/?ref=push&type=votd&day=monday',
  },
  curhat: {
    title: 'Lagi ada yang dirasain?',
    bodies: [
      "Ceritakan ke Al-Qur'an. Ada ayat yang cocok untukmu.",
      "Hati lagi penuh? Al-Qur'an siap mendengarkan.",
      'Kadang kita butuh tempat curhat yang tenang. Yuk.',
      'Apa yang lagi kamu rasain hari ini? Coba ceritakan.',
      "Berat sendirian. Al-Qur'an punya kata-kata yang tepat.",
    ],
    actions: [
      { action: 'open', title: 'Curhat Sekarang' },
      { action: 'dismiss', title: 'Nanti' },
    ],
    urlPath: '/?mode=curhat&ref=push&type=curhat&day=wednesday',
  },
  panduan: {
    title: 'Cari panduan hari ini?',
    bodies: [
      "Ada keputusan yang lagi kamu pikirin? Tanya Al-Qur'an.",
      'Jumat yang baik dimulai dari pertanyaan yang tepat.',
      "Apapun yang lagi kamu hadapi — Al-Qur'an punya panduannya.",
      "Butuh arah? Tanyakan ke Al-Qur'an.",
      'Setiap pertanyaan hidup ada jawabannya di sana.',
    ],
    actions: [
      { action: 'open', title: 'Cari Panduan' },
      { action: 'dismiss', title: 'Nanti' },
    ],
    urlPath: '/?mode=panduan&ref=push&type=panduan&day=friday',
  },
  jelajahi: {
    title: "Jelajahi Al-Qur'an",
    bodies: [
      "Kapan terakhir kamu buka Al-Qur'an? Mulai dari mana saja.",
      'Ada surah yang lama nggak kamu baca? Buka sekarang.',
      'Minggu ini, kenali satu surah lebih dekat.',
      "Jelajahi, baca, dan temukan — Al-Qur'an selalu punya yang baru.",
      'Nggak perlu lama. Satu surah sudah cukup.',
    ],
    actions: [
      { action: 'open', title: 'Jelajahi' },
      { action: 'dismiss', title: 'Nanti' },
    ],
    urlPath: '/?mode=jelajahi&ref=push&type=jelajahi&day=sunday',
  },
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date();
  const dayOfWeek = now.getUTCDay();

  const notificationType = SCHEDULE[dayOfWeek];
  if (!notificationType) {
    return res.status(200).json({ skipped: true, reason: 'Not a notification day' });
  }

  const copy = COPY[notificationType];
  const payload = JSON.stringify({
    title: copy.title,
    body: pickRandom(copy.bodies),
    data: { url: copy.urlPath },
    actions: copy.actions,
  });

  // Hobby plan: daily cron sends to ALL subscribers at once
  const { data: subscribers, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (fetchError) {
    console.error('send-notifications fetch error:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch subscribers' });
  }

  if (!subscribers || subscribers.length === 0) {
    return res.status(200).json({ sent: 0, reason: 'No subscribers' });
  }

  const staleEndpoints = [];

  const results = await Promise.allSettled(
    subscribers.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        return 'sent';
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error('push send error:', err.statusCode, sub.endpoint);
        }
        return 'failed';
      }
    })
  );

  const sent = results.filter(r => r.value === 'sent').length;
  const failed = results.filter(r => r.value === 'failed').length;

  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints);
  }

  console.log(`send-notifications: type=${notificationType}, sent=${sent}, failed=${failed}, stale=${staleEndpoints.length}`);
  return res.status(200).json({ sent, failed, stale: staleEndpoints.length, type: notificationType });
};
