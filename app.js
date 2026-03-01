'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let currentFeeling = '';
let currentAyat    = [];

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

async function shareVerse(verse) {
  try {
    await navigator.share({
      title: `${verse.ref} — Curhat & Temukan Ayat`,
      text: `${verse.arabic}\n\n"${verse.translation}"\n\n— ${verse.ref}`,
    });
  } catch (err) {
    if (err.name !== 'AbortError') copyVerse(verse);
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const COPY_ICON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHARE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

// ── Verse Card ────────────────────────────────────────────────────────────────

function buildVerseCard(verse, index) {
  const card = document.createElement('article');
  card.className = 'verse-card';
  card.style.animationDelay = `${index * 0.08}s`;
  card.innerHTML = `
    <div class="vc-ref">
      <span class="vc-ref-dot"></span>
      <span class="vc-ref-text">${verse.ref}</span>
    </div>
    <p class="vc-arabic">${verse.arabic}</p>
    <p class="vc-translation">"${verse.translation}"</p>
    ${verse.tafsir_summary ? `<p class="vc-reflection">${verse.tafsir_summary}</p>` : ''}
    <div class="vc-actions">
      <button class="vc-btn vc-copy-btn">${COPY_ICON} Salin</button>
      ${navigator.share ? `<button class="vc-btn vc-share-btn">${SHARE_ICON} Bagikan</button>` : ''}
    </div>
  `;
  card.querySelector('.vc-copy-btn').addEventListener('click', () => copyVerse(verse));
  if (navigator.share) {
    card.querySelector('.vc-share-btn').addEventListener('click', () => shareVerse(verse));
  }
  return card;
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────

function buildSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'verse-card skeleton-card';
  card.innerHTML = `
    <div class="sk-line sk-short"></div>
    <div class="sk-block sk-arabic-block"></div>
    <div class="sk-line"></div>
    <div class="sk-line sk-medium"></div>
    <div class="sk-line sk-short"></div>
  `;
  return card;
}

// ── Loading State ─────────────────────────────────────────────────────────────

function showLoading() {
  document.getElementById('user-quote').classList.add('hidden');
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  document.getElementById('verses-header').innerHTML = `
    <div class="loading-header">
      <div class="loading-spinner"></div>
      <p class="loading-text">Menemukan ayat untukmu<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span></p>
    </div>
  `;

  const grid = document.getElementById('verses-grid');
  grid.innerHTML = '';
  for (let i = 0; i < 3; i++) grid.appendChild(buildSkeletonCard());
}

// ── Render Verses ─────────────────────────────────────────────────────────────

function renderVerses(data) {
  currentAyat = data.ayat;

  // User quote
  const quoteEl = document.getElementById('user-quote');
  if (currentFeeling) {
    quoteEl.innerHTML = `
      <p class="user-quote-label">Kamu berkata:</p>
      <p class="user-quote-text">${escapeHtml(currentFeeling)}</p>
    `;
    quoteEl.classList.remove('hidden');
  }

  // Verses header — uses the LLM's personalised reflection message
  document.getElementById('verses-header').innerHTML = `
    <p class="vh-reflection">${escapeHtml(data.reflection)}</p>
    <p class="vh-sub">Ayat untukmu hari ini</p>
  `;

  // Verse cards
  const grid = document.getElementById('verses-grid');
  grid.innerHTML = '';
  data.ayat.forEach((verse, i) => grid.appendChild(buildVerseCard(verse, i)));

  // Action buttons
  const actionsEl = document.getElementById('verse-actions');
  actionsEl.innerHTML = `
    <button class="va-primary" id="save-btn">Simpan ayat ini</button>
    <button class="va-secondary" id="find-more-btn">Temukan ayat lain</button>
  `;
  actionsEl.classList.remove('hidden');
  document.getElementById('save-btn').addEventListener('click', saveVerses);
  document.getElementById('find-more-btn').addEventListener('click', () => switchView('selection-view'));

  // Feedback
  const feedbackEl = document.getElementById('verse-feedback');
  feedbackEl.innerHTML = `
    <p class="feedback-label">Bagaimana perasaanmu setelah membaca ini?</p>
    <div class="feedback-btns">
      <button class="feedback-btn" data-response="Alhamdulillah, semoga ketenangan itu terus menyertaimu 🤍">Lebih tenang</button>
      <button class="feedback-btn" data-response="Tidak apa-apa. Kamu sudah melangkah dengan membaca. Pelan-pelan ya ✓">Sama saja</button>
      <button class="feedback-btn" data-response="Kesedihan itu manusiawi. Allah selalu mendengar. Kamu tidak sendirian 🤍">Masih sedih</button>
    </div>
  `;
  feedbackEl.classList.remove('hidden');
  feedbackEl.querySelectorAll('.feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      feedbackEl.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      showToast(btn.dataset.response);
    });
  });
}

// ── Save Verses ───────────────────────────────────────────────────────────────

function saveVerses() {
  try {
    const saved = JSON.parse(localStorage.getItem('savedAyat') || '[]');
    saved.push({
      feeling: currentFeeling,
      ayat: currentAyat,
      date: new Date().toISOString(),
    });
    localStorage.setItem('savedAyat', JSON.stringify(saved));
    showToast('Ayat berhasil disimpan ✓');
  } catch {
    showToast('Gagal menyimpan');
  }
}

// ── Error State ───────────────────────────────────────────────────────────────

function showError(message = 'Terjadi kesalahan. Silakan coba lagi.') {
  document.getElementById('user-quote').classList.add('hidden');
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');
  document.getElementById('verses-header').innerHTML = '';
  document.getElementById('verses-grid').innerHTML = `
    <div class="error-state">
      <span class="error-emoji">😔</span>
      <p class="error-msg">${message}</p>
      <button class="error-back-btn">← Coba Lagi</button>
    </div>
  `;
  document.querySelector('.error-back-btn')
    ?.addEventListener('click', () => switchView('selection-view'));
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

async function fetchAyat(feeling) {
  currentFeeling = feeling;
  switchView('verses-view');
  showLoading();

  try {
    // Minimum 1.5s loading so it never feels instant/jarring
    const [data] = await Promise.all([
      callAPI(feeling),
      new Promise(r => setTimeout(r, 1500)),
    ]);
    renderVerses(data);
  } catch (err) {
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
      style="--ec-color: ${e.color}; --ec-bg: ${e.bg};"
      aria-label="${e.label} — ${e.desc}"
    >
      <span class="ec-emoji">${e.emoji}</span>
      <span class="ec-label">${e.label}</span>
      <span class="ec-desc">${e.desc}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () => fetchAyat(card.dataset.feeling));
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
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('back-btn').addEventListener('click', () => switchView('selection-view'));
renderEmotionCards();
initSearch();
