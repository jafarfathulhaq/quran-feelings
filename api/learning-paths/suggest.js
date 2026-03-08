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

  const { verses, type } = req.query;

  if (!verses || !type) {
    return res.status(200).json(null);
  }

  const verseList = verses.split(',').map(v => v.trim()).filter(Boolean);
  if (verseList.length === 0) {
    return res.status(200).json(null);
  }

  try {
    // Find paths with overlapping verses
    const { data, error } = await supabase.rpc('match_learning_path', {
      verse_list: verseList,
      path_type: type,
    });

    if (error) {
      // Fallback: manual query if RPC doesn't exist
      const { data: lessons, error: lessonError } = await supabase
        .from('lessons')
        .select('path_id, verse_ref, supporting_verse_ref')
        .or(
          verseList.map(v => `verse_ref.eq.${v}`).join(',') + ',' +
          verseList.map(v => `supporting_verse_ref.eq.${v}`).join(',')
        );

      if (lessonError) throw lessonError;

      // Count overlaps per path
      const pathCounts = {};
      for (const l of lessons || []) {
        pathCounts[l.path_id] = (pathCounts[l.path_id] || 0) + 1;
      }

      if (Object.keys(pathCounts).length === 0) {
        return res.status(200).json(null);
      }

      // Get the path with most overlaps
      const bestPathId = Object.entries(pathCounts)
        .sort((a, b) => b[1] - a[1])[0][0];

      const { data: path, error: pathError } = await supabase
        .from('learning_paths')
        .select('*')
        .eq('id', bestPathId)
        .eq('type', type)
        .single();

      if (pathError || !path) {
        return res.status(200).json(null);
      }

      return res.status(200).json(path);
    }

    if (!data || data.length === 0) {
      return res.status(200).json(null);
    }

    return res.status(200).json(data[0]);
  } catch (err) {
    console.error('learning-paths suggest error:', err);
    return res.status(200).json(null);
  }
}
