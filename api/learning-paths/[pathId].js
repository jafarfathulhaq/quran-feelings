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

  const { pathId } = req.query;

  if (!pathId) {
    return res.status(400).json({ error: 'Missing pathId' });
  }

  try {
    const { data: path, error: pathError } = await supabase
      .from('learning_paths')
      .select('*')
      .eq('id', pathId)
      .single();

    if (pathError || !path) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const { data: lessons, error: lessonError } = await supabase
      .from('lessons')
      .select('id, order_num, title, verse_ref, supporting_verse_ref')
      .eq('path_id', pathId)
      .order('order_num');

    if (lessonError) throw lessonError;

    return res.status(200).json({
      id: path.id,
      type: path.type,
      title: path.title,
      description: path.description,
      emoji: path.emoji,
      lessons: lessons || [],
    });
  } catch (err) {
    console.error('learning-paths detail error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
