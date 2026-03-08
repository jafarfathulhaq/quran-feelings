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
    const { data: paths, error } = await supabase
      .from('learning_paths')
      .select('id, type, title, description, emoji, order_num')
      .order('order_num');

    if (error) throw error;

    // Get lesson counts per path
    const { data: counts, error: countError } = await supabase
      .from('lessons')
      .select('path_id');

    if (countError) throw countError;

    const lessonCounts = {};
    for (const row of counts) {
      lessonCounts[row.path_id] = (lessonCounts[row.path_id] || 0) + 1;
    }

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

    return res.status(200).json({ situation, topic });
  } catch (err) {
    console.error('learning-paths list error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
