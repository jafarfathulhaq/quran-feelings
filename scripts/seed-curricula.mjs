// Seed curricula table via Supabase pg-meta API
const SUPABASE_URL = 'https://ryafjohcmqaoeeittvxi.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY env var'); process.exit(1); }

const SQL = `
CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tagline TEXT,
  emoji TEXT,
  audience TEXT,
  order_num INTEGER,
  path_ids TEXT[] NOT NULL
);

INSERT INTO curricula (id, title, tagline, emoji, audience, order_num, path_ids) VALUES
  ('mengenal-quran-dari-nol', 'Mengenal Al-Qur''an dari Nol', 'Mulai dari sini kalau kamu ingin memahami Al-Qur''an untuk pertama kalinya.', '🌱', 'pemula', 1, ARRAY['mengenal-allah','tentang-quran','mencari-makna-hidup','taqwa','akhirat']),
  ('ketika-hidup-berat', 'Ketika Hidup Terasa Berat', 'Untuk kamu yang sedang berjuang. Al-Qur''an punya jawaban.', '🤲', 'emotional', 2, ARRAY['menghadapi-cobaan','sabar','doa','tawakkal','menemukan-ketenangan']),
  ('menjadi-muslim-lebih-baik', 'Menjadi Muslim yang Lebih Baik', 'Langkah nyata untuk pertumbuhan spiritual.', '✨', 'spiritual', 3, ARRAY['shalat','syukur','akhlak','ikhlas','taqwa']),
  ('kisah-para-nabi', 'Kisah Para Nabi', 'Pelajaran hidup dari kisah nabi-nabi dalam Al-Qur''an.', '📗', 'spiritual', 4, ARRAY['kisah-ibrahim','kisah-musa','kisah-yusuf','mengenal-allah','ilmu']),
  ('hubungan-keluarga', 'Hubungan dan Keluarga', 'Membangun keluarga yang sakinah berdasarkan Al-Qur''an.', '👨‍👩‍👧', 'practical', 5, ARRAY['keluarga','tekanan-orang-tua','masalah-rumah-tangga','sabar','doa']),
  ('menyembuhkan-hati', 'Menyembuhkan Hati', 'Untuk hati yang terluka. Al-Qur''an memahami sakitmu.', '💚', 'emotional', 6, ARRAY['patah-hati','berduka','merasa-bersalah','taubat','rahmat-allah']),
  ('percaya-diri-iman', 'Percaya Diri dalam Iman', 'Untuk kamu yang merasa belum cukup baik. Allah tidak berpikir begitu.', '🔆', 'emotional', 7, ARRAY['ragu-tentang-iman','merasa-tidak-cukup-baik','merasa-jauh-dari-allah','ingin-berubah','taqwa']),
  ('hidup-modern', 'Hidup di Dunia Modern', 'Panduan Al-Qur''an untuk tantangan kehidupan modern.', '🌍', 'practical', 8, ARRAY['tekanan-sosial','merasa-iri','kecanduan','diuji-kenikmatan','keadilan']),
  ('perempuan-quran', 'Perempuan dan Al-Qur''an', 'Suara perempuan dalam Al-Qur''an lebih kuat dari yang kamu kira.', '👩', 'identity', 9, ARRAY['perempuan','keluarga','keadilan','sabar','rahmat-allah'])
ON CONFLICT (id) DO NOTHING;
`;

async function run() {
  // Try pg-meta endpoint first
  const res = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log('✅ Curricula table seeded successfully via pg-meta');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`pg-meta returned ${res.status}: ${await res.text()}`);
  console.log('Trying alternative approach...');

  // Alternative: use the SQL endpoint
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (res2.ok) {
    console.log('✅ Seeded via rpc/exec_sql');
    return;
  }

  console.log(`rpc/exec_sql returned ${res2.status}: ${await res2.text()}`);
  console.log('\n❌ Could not seed automatically. Please run seed-curricula.sql manually in Supabase SQL Editor.');
}

run().catch(err => console.error('Error:', err));
