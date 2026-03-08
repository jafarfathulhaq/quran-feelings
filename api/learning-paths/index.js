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

  const isCurricula = req.query.type === 'curricula';

  try {
    // Get lesson counts per path (shared by both modes)
    const { data: counts, error: countError } = await supabase
      .from('lessons')
      .select('path_id');

    if (countError) throw countError;

    const lessonCounts = {};
    for (const row of counts) {
      lessonCounts[row.path_id] = (lessonCounts[row.path_id] || 0) + 1;
    }

    // --- Curricula mode: /api/learning-paths?type=curricula ---
    if (isCurricula) {
      const { data: curricula, error: currError } = await supabase
        .from('curricula')
        .select('id, title, tagline, emoji, audience, order_num, path_ids')
        .order('order_num');

      if (currError) throw currError;

      const { data: allPaths, error: pathError } = await supabase
        .from('learning_paths')
        .select('id, title, emoji');

      if (pathError) throw pathError;

      const pathMap = {};
      for (const p of allPaths) {
        pathMap[p.id] = { id: p.id, title: p.title, emoji: p.emoji };
      }

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
    }

    // --- Default mode: learning paths list ---
    const { data: paths, error } = await supabase
      .from('learning_paths')
      .select('id, type, title, description, emoji, order_num')
      .order('order_num');

    if (error) throw error;

    const situation = [];
    const topic = [];

    for (const p of paths) {
      const item = {
        id: p.id,
        title: p.title,
        emoji: p.emoji,
        description: p.description,
        lesson_count: lessonCounts[p.id] || 0,
      };
      if (p.type === 'situation') situation.push(item);
      else topic.push(item);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ situation, topic });
  } catch (err) {
    console.error('learning-paths list error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
