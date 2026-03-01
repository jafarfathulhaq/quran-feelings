'use strict';

// ── In-App Browser Detection ───────────────────────────────────────────────────
// Instagram, Facebook, TikTok, and LINE ship their own WebView that blocks
// navigator.share({files}) and blob URL downloads — the two mechanisms the
// share-as-image feature depends on. Detect early so we can warn the user.

const IS_IN_APP_BROWSER = /Instagram|FBAN|FBAV|TikTok|Line\//i.test(navigator.userAgent);

// ── Analytics ──────────────────────────────────────────────────────────────────
// Fire-and-forget: never blocks UI, never throws, never logs user input text.

function logEvent(eventType, properties = {}) {
  fetch('/api/log-event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event_type: eventType, properties }),
  }).catch(() => {}); // silently ignore network failures
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentFeeling    = '';
let currentAyat       = [];
let currentSearchCtx  = { method: 'text', emotionId: null }; // populated in fetchAyat
let typewriterActive  = false; // set false to abort an in-progress typewriter

// ── Utilities ─────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Emotion Shortcuts ─────────────────────────────────────────────────────────

const emotions = [
  { id: 'sad',      label: 'Sedih',       emoji: '🌧️', desc: 'Merasa sedih atau patah hati',       color: '#4A7FA5', bg: '#EBF4FF', feeling: 'Aku merasa sangat sedih dan patah hati' },
  { id: 'anxious',  label: 'Cemas',       emoji: '😰', desc: 'Merasa khawatir atau takut',          color: '#7B68B0', bg: '#F3F0FF', feeling: 'Aku merasa sangat cemas dan khawatir tentang masa depan' },
  { id: 'hopeless', label: 'Putus Asa',   emoji: '🌑', desc: 'Merasa putus asa atau tanpa harapan', color: '#5A6A8A', bg: '#EEF2FF', feeling: 'Aku merasa putus asa dan sudah tidak ada harapan lagi' },
  { id: 'grateful', label: 'Bersyukur',   emoji: '✨', desc: 'Merasa bersyukur dan beruntung',      color: '#B8860B', bg: '#FFFBEB', feeling: 'Aku merasa sangat bersyukur dan ingin mengungkapkan rasa terima kasih kepada Allah' },
  { id: 'angry',    label: 'Marah',       emoji: '🌋', desc: 'Merasa frustrasi atau marah',         color: '#C0392B', bg: '#FEF2F2', feeling: 'Aku merasa sangat marah dan frustrasi, sulit mengendalikan emosi' },
  { id: 'lonely',   label: 'Kesepian',    emoji: '🌙', desc: 'Merasa kesepian atau sendirian',      color: '#2E86AB', bg: '#EBF5FB', feeling: 'Aku merasa sangat kesepian dan sendirian, tidak ada yang memahami aku' },
  { id: 'lost',     label: 'Kebingungan', emoji: '🧭', desc: 'Merasa bingung atau kehilangan arah', color: '#6B8E23', bg: '#F0F7E6', feeling: 'Aku merasa bingung dan kehilangan arah tujuan hidup' },
  { id: 'stressed', label: 'Stres',       emoji: '⚡', desc: 'Merasa tertekan atau kelelahan',      color: '#D4620A', bg: '#FFF4ED', feeling: 'Aku merasa sangat stres dan kelelahan, beban hidup terasa terlalu berat' },
  { id: 'guilty',   label: 'Bersalah',    emoji: '🍂', desc: 'Merasa bersalah atau menyesal',       color: '#8B6914', bg: '#FDFBF0', feeling: 'Aku merasa sangat bersalah dan menyesal atas perbuatanku, ingin bertobat' },
  { id: 'envious',  label: 'Iri Hati',    emoji: '🌿', desc: 'Merasa iri atau membandingkan diri',  color: '#2D7A4F', bg: '#EDFAF4', feeling: 'Aku merasa iri hati melihat orang lain, sulit bersyukur dengan apa yang aku miliki' },
];

// ── Copy / Share ──────────────────────────────────────────────────────────────

async function copyVerse(verse) {
  const text = `${verse.arabic}\n\n"${verse.translation}"\n\n— ${verse.ref}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Ayat berhasil disalin ✓');
  } catch {
    showToast('Gagal menyalin — coba secara manual');
  }
}

// ── Share as Image ─────────────────────────────────────────────────────────────

async function generateShareImage(verse) {
  // Populate the off-screen share card
  document.getElementById('sc-arabic').textContent      = verse.arabic;
  document.getElementById('sc-translation').textContent = `"${verse.translation}"`;
  document.getElementById('sc-ref').textContent         = verse.ref;
  document.getElementById('sc-url').textContent         = window.location.hostname;

  // Ensure fonts are fully loaded before capturing
  await document.fonts.load('400 34px Amiri');
  await document.fonts.ready;

  const card = document.getElementById('share-card');
  const canvas = await html2canvas(card, {
    scale:           2,       // 2x → 1080px output for retina/high-DPI
    useCORS:         true,
    backgroundColor: '#1A3D2B',
    logging:         false,
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}

async function shareVerse(verse) {
  // In-app browsers block both navigator.share({files}) and blob URL downloads.
  // Show a clear instruction instead of silently failing.
  logEvent('verse_shared', { surah_name: verse.surah_name });

  if (IS_IN_APP_BROWSER) {
    showToast('Buka di Chrome/Safari untuk berbagi gambar 🌐');
    return;
  }

  showToast('Membuat gambar...');

  let blob = null;
  try {
    blob = await generateShareImage(verse);
  } catch (imgErr) {
    console.warn('Image generation failed, falling back to text:', imgErr);
  }

  if (blob) {
    const safeName = verse.ref.replace(/[^a-zA-Z0-9]/g, '-');
    const file     = new File([blob], `${safeName}.png`, { type: 'image/png' });

    // 1. Best: share image file (Android Chrome, iOS Safari 15+)
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: verse.ref, files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
      }
    }

    // 2. Fallback: download the PNG
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${safeName}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Gambar tersimpan ✓');
    return;
  }

  // 3. Last resort: text share → copy
  try {
    if (navigator.share) {
      await navigator.share({
        title: verse.ref,
        text:  `${verse.arabic}\n\n"${verse.translation}"\n\n— ${verse.ref}`,
      });
    } else {
      copyVerse(verse);
    }
  } catch (err) {
    if (err.name !== 'AbortError') copyVerse(verse);
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const COPY_ICON           = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHARE_ICON          = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const PLAY_ICON           = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const PAUSE_ICON          = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const BOOKMARK_ICON       = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
const BOOKMARK_FILLED_ICON= `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

// ── Audio ──────────────────────────────────────────────────────────────────────
// CDN: https://cdn.islamic.network/quran/audio/128/ar.alafasy/{global_ayah}.mp3
// Global ayah number = cumulative verse count before the surah + verse number.

const SURAH_VERSE_COUNTS = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
  59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
  52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
  21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
];

// SURAH_STARTS[i] = global ayah number of the first verse of surah (i+1)
const SURAH_STARTS = SURAH_VERSE_COUNTS.reduce((acc, _, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SURAH_VERSE_COUNTS[i - 1]);
  return acc;
}, []);

function toGlobalAyah(surahNum, verseNum) {
  return SURAH_STARTS[surahNum - 1] + verseNum;
}

let activeAudio   = null;
let activePlayBtn = null;

function stopCurrentAudio() {
  if (activeAudio)   { activeAudio.pause(); activeAudio = null; }
  if (activePlayBtn) {
    activePlayBtn.innerHTML = PLAY_ICON + ' Putar';
    activePlayBtn.classList.remove('playing');
    activePlayBtn = null;
  }
}

function playAudio(verse, btn) {
  if (activePlayBtn === btn) { stopCurrentAudio(); return; }
  stopCurrentAudio();
  logEvent('verse_played', { surah_name: verse.surah_name });

  const [s, v]  = verse.id.split(':').map(Number);
  const globalN = toGlobalAyah(s, v);
  const audio   = new Audio(
    `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalN}.mp3`
  );

  activeAudio   = audio;
  activePlayBtn = btn;
  btn.innerHTML = PAUSE_ICON + ' Jeda';
  btn.classList.add('playing');

  audio.play().catch(() => {
    showToast('Gagal memuat audio. Coba lagi.');
    stopCurrentAudio();
  });
  audio.addEventListener('ended', stopCurrentAudio);
}

// ── Saved Verses ──────────────────────────────────────────────────────────────

function getSaved() {
  try { return JSON.parse(localStorage.getItem('savedVerses') || '[]'); }
  catch { return []; }
}

function setSaved(arr) {
  localStorage.setItem('savedVerses', JSON.stringify(arr));
}

function isVerseSaved(id) {
  return getSaved().some(v => v.id === id);
}

function toggleSave(verse, btn) {
  const saved = getSaved();
  const idx   = saved.findIndex(v => v.id === verse.id);
  if (idx === -1) {
    saved.push(verse);
    setSaved(saved);
    btn.innerHTML = BOOKMARK_FILLED_ICON + ' Tersimpan';
    btn.classList.add('saved');
    showToast('Ayat disimpan ✓');
    logEvent('verse_saved', { surah_name: verse.surah_name });
  } else {
    saved.splice(idx, 1);
    setSaved(saved);
    btn.innerHTML = BOOKMARK_ICON + ' Simpan';
    btn.classList.remove('saved');
    showToast('Dihapus dari simpanan');
    logEvent('verse_unsaved', { surah_name: verse.surah_name });
  }
  updateSavedBadge();
}

function updateSavedBadge() {
  const count = getSaved().length;
  const badge = document.getElementById('saved-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

// ── Verse Card ────────────────────────────────────────────────────────────────

function buildVerseCard(verse, index) {
  const card    = document.createElement('article');
  card.className = 'verse-card';
  card.style.animationDelay = `${index * 0.08}s`;

  const saved   = isVerseSaved(verse.id);
  const bmkHtml = saved
    ? `${BOOKMARK_FILLED_ICON} Tersimpan`
    : `${BOOKMARK_ICON} Simpan`;

  card.innerHTML = `
    <div class="vc-ref">
      <span class="vc-ref-dot"></span>
      <span class="vc-ref-text">${verse.ref}</span>
    </div>
    <p class="vc-arabic">${verse.arabic}</p>
    <p class="vc-translation">"${verse.translation}"</p>
    ${verse.tafsir_summary ? `<p class="vc-reflection">${verse.tafsir_summary}</p><p class="vc-tafsir-source">Tafsir: M. Quraish Shihab</p>` : ''}
    <div class="vc-actions">
      <button class="vc-btn vc-audio-btn">${PLAY_ICON} Putar</button>
      <button class="vc-btn vc-save-btn ${saved ? 'saved' : ''}">${bmkHtml}</button>
      <button class="vc-btn vc-copy-btn">${COPY_ICON} Salin</button>
      <button class="vc-btn vc-share-btn">${SHARE_ICON} Share to Your Social</button>
    </div>
  `;

  card.querySelector('.vc-audio-btn').addEventListener('click',  e => playAudio(verse, e.currentTarget));
  card.querySelector('.vc-save-btn').addEventListener('click',   e => toggleSave(verse, e.currentTarget));
  card.querySelector('.vc-copy-btn').addEventListener('click',   () => copyVerse(verse));
  card.querySelector('.vc-share-btn').addEventListener('click',  () => shareVerse(verse));
  return card;
}

// ── Loading State ─────────────────────────────────────────────────────────────
// Shows the user's feeling as a right-side chat bubble immediately,
// then a left-side typing indicator while the API call is in flight.

function showLoading() {
  typewriterActive = false;
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');
  document.getElementById('verses-grid').innerHTML = '';

  const thread = document.getElementById('chat-thread');
  thread.innerHTML = `
    ${currentFeeling ? `
      <div class="chat-bubble chat-bubble--user">
        <p class="cb-text">${escapeHtml(currentFeeling)}</p>
      </div>
    ` : ''}
    <div class="chat-bubble chat-bubble--app chat-bubble--typing" id="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
}

// ── Render Verses ─────────────────────────────────────────────────────────────
// Sequence: typewrite reflection → stagger verse cards in → reveal feedback

function renderVerses(data) {
  currentAyat = data.ayat;

  // ── A: Replace typing indicator with the app reflection bubble ──────────────
  const thread    = document.getElementById('chat-thread');
  const typingEl  = document.getElementById('typing-indicator');
  if (typingEl) typingEl.remove();

  const appBubble = document.createElement('div');
  appBubble.className = 'chat-bubble chat-bubble--app chat-bubble--typing-active';
  const textEl = document.createElement('p');
  textEl.className = 'cb-text';
  appBubble.appendChild(textEl);
  thread.appendChild(appBubble);

  // ── B: Typewriter — reveal reflection text 2 chars per 18 ms ────────────────
  const reflection = data.reflection || '';
  typewriterActive = true;
  let pos = 0;

  function tick() {
    if (!typewriterActive) return; // aborted (user navigated away)
    pos = Math.min(pos + 2, reflection.length);
    textEl.textContent = reflection.slice(0, pos);
    if (pos < reflection.length) {
      setTimeout(tick, 18);
    } else {
      appBubble.classList.remove('chat-bubble--typing-active'); // remove cursor
      typewriterActive = false;
      onTypingDone();
    }
  }

  if (reflection) tick(); else onTypingDone();

  // ── C: After typing — stagger verse cards in, then reveal actions ────────────
  function onTypingDone() {
    const grid = document.getElementById('verses-grid');
    grid.innerHTML = '';

    data.ayat.forEach((verse, i) => {
      const card = buildVerseCard(verse, i);
      grid.appendChild(card);
      // Delay class add so the opacity-0 starting state renders first
      setTimeout(() => card.classList.add('card-visible'), i * 220 + 80);
    });

    const afterCards = data.ayat.length * 220 + 300;
    setTimeout(() => {
      const actionsEl = document.getElementById('verse-actions');
      actionsEl.innerHTML = `
        <button class="va-secondary" id="find-more-btn">Temukan ayat lain</button>
      `;
      actionsEl.classList.remove('hidden');
      document.getElementById('find-more-btn')
        .addEventListener('click', () => switchView('selection-view'));

      renderFeedback();
    }, afterCards);
  }
}

// ── Feedback Section ──────────────────────────────────────────────────────────

function renderFeedback() {
  const feedbackEl = document.getElementById('verse-feedback');
  feedbackEl.innerHTML = `
    <p class="feedback-label">Bagaimana perasaanmu setelah membaca ini?</p>
    <div class="feedback-btns">
      <button class="feedback-btn" data-key="lebih_tenang">Lebih tenang</button>
      <button class="feedback-btn" data-key="sama_saja">Sama saja</button>
      <button class="feedback-btn" data-key="masih_sedih">Masih sedih</button>
    </div>
  `;
  feedbackEl.classList.remove('hidden');

  const FEEDBACK_COPY = {
    lebih_tenang: {
      icon:        '🤍',
      text:        'Alhamdulillah. Semoga ketenangan itu terus menyertaimu.',
      actionLabel: null,
    },
    sama_saja: {
      icon:        '✦',
      text:        'Tidak apa-apa. Kamu sudah melangkah dengan membaca. Pelan-pelan ya.',
      actionLabel: '← Cari ayat lain',
    },
    masih_sedih: {
      icon:        '🤍',
      text:        'Kesedihan itu manusiawi. Allah selalu mendengar, dan kamu tidak sendirian.',
      actionLabel: '← Cari ayat lain',
    },
  };

  feedbackEl.querySelectorAll('.feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;

      const fbProps = {
        response:  key,
        verse_ids: currentAyat.map(v => v.id).join(','),
        method:    currentSearchCtx.method,
      };
      if (currentSearchCtx.emotionId) fbProps.emotion_id = currentSearchCtx.emotionId;
      logEvent('mood_feedback', fbProps);

      const { icon, text, actionLabel } = FEEDBACK_COPY[key] || FEEDBACK_COPY.sama_saja;
      feedbackEl.innerHTML = `
        <div class="feedback-thanks">
          <span class="feedback-thanks-icon">${icon}</span>
          <p class="feedback-thanks-text">${text}</p>
          ${actionLabel ? `<button class="feedback-try-again">${actionLabel}</button>` : ''}
        </div>
      `;
      if (actionLabel) {
        feedbackEl.querySelector('.feedback-try-again')
          .addEventListener('click', () => switchView('selection-view'));
      }
    });
  });
}

// ── Saved View Renderer ───────────────────────────────────────────────────────

function renderSavedView() {
  const saved    = getSaved();
  const subtitle = document.getElementById('saved-subtitle');
  const grid     = document.getElementById('saved-grid');

  subtitle.textContent = saved.length === 0
    ? ''
    : `${saved.length} ayat tersimpan`;

  grid.innerHTML = '';

  if (saved.length === 0) {
    grid.innerHTML = `
      <div class="saved-empty">
        <span class="saved-empty-icon">🔖</span>
        <p class="saved-empty-msg">Belum ada ayat yang tersimpan.<br>Tekan ikon bookmark pada kartu ayat untuk menyimpannya.</p>
      </div>
    `;
    return;
  }

  // Newest first — add card-visible immediately so no fade-in animation
  [...saved].reverse().forEach((verse, i) => {
    const card = buildVerseCard(verse, i);
    card.classList.add('card-visible');
    grid.appendChild(card);
  });
}

// ── Error / Not-relevant States ───────────────────────────────────────────────
// Both render as an app chat bubble with a small action button inside.

function showAppBubble(text, btnLabel, btnAction) {
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');
  document.getElementById('verses-grid').innerHTML = '';

  const thread   = document.getElementById('chat-thread');
  const typingEl = document.getElementById('typing-indicator');
  if (typingEl) typingEl.remove();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble--app';
  bubble.innerHTML = `
    <p class="cb-text">${text}</p>
    <button class="cb-back-btn">${btnLabel}</button>
  `;
  thread.appendChild(bubble);
  bubble.querySelector('.cb-back-btn').addEventListener('click', btnAction);
}

function showError(message = 'Terjadi kesalahan. Silakan coba lagi.') {
  showAppBubble(
    `😔 ${escapeHtml(message)}`,
    '← Coba Lagi',
    () => switchView('selection-view'),
  );
}

function showNotRelevant(message) {
  showAppBubble(
    `🤔 ${escapeHtml(message)}`,
    '← Ceritakan perasaanmu',
    () => switchView('selection-view'),
  );
}

// ── API Call ──────────────────────────────────────────────────────────────────

async function callAPI(feeling) {
  const res = await fetch('/api/get-ayat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeling }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

async function fetchAyat(feeling, { method = 'text', emotionId } = {}) {
  currentFeeling   = feeling;
  currentSearchCtx = { method, emotionId: emotionId || null };
  switchView('verses-view');
  showLoading();

  const startProps = { method };
  if (emotionId) startProps.emotion_id = emotionId;
  logEvent('search_started', startProps);

  try {
    // Minimum 1.5s loading so it never feels instant/jarring
    const [data] = await Promise.all([
      callAPI(feeling),
      new Promise(r => setTimeout(r, 1500)),
    ]);
    if (data.not_relevant) {
      logEvent('search_completed', { outcome: 'not_relevant' });
      showNotRelevant(data.message);
    } else {
      logEvent('search_completed', { outcome: 'success', verse_count: data.ayat?.length ?? 0 });
      renderVerses(data);
    }
  } catch (err) {
    logEvent('search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

// ── Emotion Cards ─────────────────────────────────────────────────────────────

function renderEmotionCards() {
  const grid = document.getElementById('emotion-grid');
  grid.innerHTML = emotions.map(e => `
    <button
      class="emotion-card"
      data-feeling="${e.feeling}"
      data-emotion-id="${e.id}"
      style="--ec-color: ${e.color}; --ec-bg: ${e.bg};"
      aria-label="${e.label} — ${e.desc}"
    >
      <span class="ec-emoji">${e.emoji}</span>
      <span class="ec-label">${e.label}</span>
      <span class="ec-desc">${e.desc}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () =>
      fetchAyat(card.dataset.feeling, { method: 'emotion_card', emotionId: card.dataset.emotionId })
    );
  });
}

// ── Search Input ──────────────────────────────────────────────────────────────

function initSearch() {
  const input     = document.getElementById('feeling-input');
  const clearBtn  = document.getElementById('feeling-clear');
  const submitBtn = document.getElementById('feeling-submit');

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val);
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 3);
  });

  // Ctrl/Cmd + Enter to submit from textarea
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) triggerSearch();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    submitBtn.classList.add('hidden');
    input.focus();
  });

  submitBtn.addEventListener('click', triggerSearch);
}

// ── View Switch ───────────────────────────────────────────────────────────────

function switchView(targetId) {
  if (targetId !== 'verses-view') {
    stopCurrentAudio();
    typewriterActive = false; // abort any running typewriter
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Verse of the Day ──────────────────────────────────────────────────────────

async function initVOTD() {
  const section = document.getElementById('votd-section');
  if (!section) return;

  // Show a subtle placeholder while loading
  section.innerHTML = '<div class="votd-skeleton"></div>';

  try {
    const res = await fetch('/api/verse-of-day');
    if (!res.ok) throw new Error('unavailable');
    const verse = await res.json();
    renderVOTD(verse, section);
  } catch {
    section.remove(); // silently hide when offline or endpoint missing
  }
}

function renderVOTD(verse, container) {
  const today   = new Date();
  const dateStr = today.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Local curated verses use surah_name + verse_number; API verses have ref
  const ref     = verse.ref || `QS. ${verse.surah_name}: ${verse.verse_number}`;
  const saved   = isVerseSaved(verse.id);
  const bmkHtml = saved
    ? `${BOOKMARK_FILLED_ICON} Tersimpan`
    : `${BOOKMARK_ICON} Simpan`;

  container.innerHTML = `
    <div class="votd-card">
      <div class="votd-header">
        <span class="votd-label">✦ Ayat Hari Ini</span>
        <span class="votd-date">${dateStr}</span>
      </div>
      <p class="votd-arabic">${verse.arabic}</p>
      <p class="votd-translation">"${verse.translation}"</p>
      <p class="votd-ref">${ref}</p>
      <div class="votd-actions">
        <button class="vc-btn votd-audio-btn">${PLAY_ICON} Putar</button>
        <button class="vc-btn votd-save-btn ${saved ? 'saved' : ''}">${bmkHtml}</button>
      </div>
    </div>
  `;

  container.querySelector('.votd-audio-btn').addEventListener('click',
    e => playAudio(verse, e.currentTarget)
  );
  container.querySelector('.votd-save-btn').addEventListener('click',
    e => toggleSave(verse, e.currentTarget)
  );
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('back-btn').addEventListener('click',       () => switchView('selection-view'));
document.getElementById('saved-back-btn').addEventListener('click', () => switchView('selection-view'));
document.getElementById('saved-nav-btn').addEventListener('click',  () => {
  renderSavedView();
  switchView('saved-view');
});

renderEmotionCards();
initSearch();
updateSavedBadge();
initVOTD();

// ── Service Worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
