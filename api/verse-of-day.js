'use strict';

const fs   = require('fs');
const path = require('path');

// Cache the parsed JSON in module memory (warm on repeated invocations)
let _verses = null;

function getVerses() {
  if (!_verses) {
    const filePath = path.join(process.cwd(), 'data', 'verses.json');
    _verses = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return _verses;
}

module.exports = (req, res) => {
  try {
    const verses   = getVerses();
    const dayIndex = Math.floor(Date.now() / 86_400_000) % verses.length;
    const verse    = verses[dayIndex];

    // Compute seconds until next midnight UTC so browsers/CDN cache exactly one day
    const now              = Date.now();
    const nextMidnightUTC  = (Math.floor(now / 86_400_000) + 1) * 86_400_000;
    const secondsRemaining = Math.max(1, Math.floor((nextMidnightUTC - now) / 1000));

    res.setHeader('Cache-Control',
      `public, max-age=${secondsRemaining}, s-maxage=${secondsRemaining}, stale-while-revalidate=60`
    );
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(verse);
  } catch (err) {
    console.error('[verse-of-day]', err);
    return res.status(500).json({ error: 'Failed to load verse of the day' });
  }
};
