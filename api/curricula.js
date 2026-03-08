'use strict';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const allowedOrigin = 'https://temuquran.com';
  const origin = req.headers.origin;
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Fetch all curricula
    const { data: curricula, error: currError } = await supabase
      .from('curricula')
      .select('id, title, tagline, emoji, audience, order_num, path_ids')
      .order('order_num');

    if (currError) throw currError;

    // Fetch all learning paths for lookup
    const { data: allPaths, error: pathError } = await supabase
      .from('learning_paths')
      .select('id, title, emoji');

    if (pathError) throw pathError;

    // Build path lookup map
    const pathMap = {};
    for (const p of allPaths) {
      pathMap[p.id] = { id: p.id, title: p.title, emoji: p.emoji };
    }

    // Get lesson counts per path
    const { data: lessonRows, error: lessonError } = await supabase
      .from('lessons')
      .select('path_id');

    if (lessonError) throw lessonError;

    const lessonCounts = {};
    for (const row of lessonRows) {
      lessonCounts[row.path_id] = (lessonCounts[row.path_id] || 0) + 1;
    }

    // Assemble response
    const result = curricula.map(c => {
      const paths = (c.path_ids || []).map(pid => {
        const p = pathMap[pid];
        return p ? { id: p.id, title: p.title, emoji: p.emoji, lesson_count: lessonCounts[pid] || 5 } : null;
      }).filter(Boolean);

      const totalLessons = paths.reduce((sum, p) => sum + p.lesson_count, 0);

      return {
        id: c.id,
        title: c.title,
        tagline: c.tagline,
        emoji: c.emoji,
        audience: c.audience,
        order_num: c.order_num,
        paths,
        total_lessons: totalLessons,
      };
    });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  } catch (err) {
    console.error('curricula list error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
