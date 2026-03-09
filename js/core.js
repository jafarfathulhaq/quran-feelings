'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// core.js — Shared utilities, state, and functions used across all features
// Depends on: data.js (must be loaded first)
// ══════════════════════════════════════════════════════════════════════════════

// ── Google Analytics (GA4) ────────────────────────────────────────────────────
// gtag.js is loaded async via <script> in index.html.
// We initialise the dataLayer + config here so everything stays in one JS file
// (no inline <script> needed — required by our CSP: script-src 'self').
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-NWKWSKTNS0');

// ── In-App Browser Detection ───────────────────────────────────────────────────
// Instagram, Facebook, TikTok, and LINE ship their own WebView that blocks
// navigator.share({files}) and blob URL downloads — the two mechanisms the
// share-as-image feature depends on. Detect early so we can warn the user.

const IS_IN_APP_BROWSER = /Instagram|FBAN|FBAV|TikTok|Line\//i.test(navigator.userAgent);

// ── A2HS (Add to Home Screen) ─────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function initA2HS() {
  const card = document.getElementById('a2hsCard');
  const btn  = document.getElementById('a2hsBtn');
  if (!card || !btn) return;

  // Already installed as PWA → hide card
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    card.style.display = 'none';
    return;
  }

  // Delayed entrance: slide in + fade after 1s, then glow pulse
  setTimeout(() => {
    card.classList.add('a2hs-visible');
    setTimeout(() => card.classList.add('a2hs-glow'), 500);
  }, 1000);

  // Rotating copy
  const a2hsCopies = [
    'Buka TemuQuran kapan saja, langsung dari layar utama',
    'Jadikan TemuQuran aplikasi di HP \u2014 biar inget dan cepet',
    'Simpan TemuQuran di HP \u2014 akses ayat kapan saja',
  ];
  const textEl = document.getElementById('a2hsText');
  let a2hsCopyIdx = 1; // starts at 1 because HTML already shows copy index 1 (0-indexed: copies[1])
  if (textEl) {
    setInterval(() => {
      a2hsCopyIdx = (a2hsCopyIdx + 1) % a2hsCopies.length;
      textEl.classList.add('a2hs-text-fade');
      setTimeout(() => {
        textEl.textContent = a2hsCopies[a2hsCopyIdx];
        textEl.classList.remove('a2hs-text-fade');
      }, 400);
    }, 5000);
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // iOS guide overlay helpers
  const guide      = document.getElementById('a2hsGuide');
  const guideClose = document.getElementById('a2hsGuideClose');

  function showA2HSGuide() {
    if (!guide) return;
    guide.classList.remove('hidden');
    guide.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => guide.classList.add('visible'));
  }
  function hideA2HSGuide() {
    if (!guide) return;
    guide.classList.remove('visible');
    setTimeout(() => {
      guide.classList.add('hidden');
      guide.setAttribute('aria-hidden', 'true');
    }, 300);
  }
  if (guideClose) guideClose.addEventListener('click', hideA2HSGuide);
  if (guide) guide.addEventListener('click', (e) => {
    if (e.target === guide) hideA2HSGuide();
  });

  const isAndroid = /Android/i.test(navigator.userAgent);

  btn.addEventListener('click', () => {
    if (deferredPrompt) {
      // Android / Chrome — native prompt
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') {
          card.style.display = 'none';
          logEvent('a2hs_installed', {});
        }
        deferredPrompt = null;
      });
      logEvent('a2hs_tapped', { platform: 'android' });
    } else if (isIOS) {
      // iOS — show step-by-step guide overlay
      showA2HSGuide();
      logEvent('a2hs_tapped', { platform: 'ios' });
    } else {
      // Android fallback (prompt unavailable) — swap guide to Android steps
      if (isAndroid && guide) {
        const title = guide.querySelector('.a2hs-guide-title');
        const steps = guide.querySelector('.a2hs-guide-steps');
        if (title) title.textContent = 'Pasang TemuQuran di Android';
        if (steps) steps.innerHTML = `
          <div class="a2hs-step"><span class="a2hs-step-num">1</span><span>Tap ikon <strong>⋮</strong> (titik tiga) di pojok kanan atas Chrome</span></div>
          <div class="a2hs-step"><span class="a2hs-step-num">2</span><span>Tap <strong>"Tambahkan ke layar utama"</strong> atau <strong>"Install app"</strong></span></div>
          <div class="a2hs-step"><span class="a2hs-step-num">3</span><span>Tap <strong>"Pasang"</strong> untuk konfirmasi</span></div>
        `;
      }
      showA2HSGuide();
      logEvent('a2hs_tapped', { platform: 'other' });
    }
  });
}

// ── Nuri — Belajar Bareng Nuri (Mode 5) ──────────────────────────────────────
// Multi-turn Quran learning companion. Stateful within session.

let nuriMessages = [];           // full conversation array
let nuriOptedIn = false;         // default off
let nuriSessionId = null;        // uuid, generated on session start
let nuriExchangeCount = 0;       // increments per user message
let nuriConversationMode = null; // 'deep_dive' | 'exploration' | null
let nuriIsTyping = false;        // prevent double-sends

function getNuriOpeningMessage() {
  const now = new Date();
  // Friday greeting
  if (now.getDay() === 5) {
    return `Jum'at Mubarak! \u{1F54C}\n\nSenang bertemu lagi. Mau belajar apa hari ini?`;
  }
  // Ramadan 1448H ~ Feb 28 - Mar 30, 2027 (hardcoded for v1)
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (y === 2027 && ((m === 1 && d >= 28) || (m === 2 && d <= 30))) {
    return `Ramadan Mubarak! \u{1F319}\n\nBulan penuh berkah — mau belajar Al-Qur'an bareng hari ini?`;
  }
  const idx = Math.floor(Math.random() * NURI_OPENING_MESSAGES.length);
  return NURI_OPENING_MESSAGES[idx];
}

let nuriLastFailedMessage = null; // for retry on error

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// ── Analytics ──────────────────────────────────────────────────────────────────
// Fire-and-forget: never blocks UI, never throws, never logs user input text.
// session_id: random ID per browser tab session (sessionStorage), no PII.

const SESSION_ID = (() => {
  try {
    const key = 'qf_sid';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch { return 'unknown'; }
})();

function logEvent(eventType, properties = {}) {
  // ── Supabase analytics (existing) ──────────────────────────────────────────
  fetch('/api/log-event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event_type: eventType, properties: { ...properties, session_id: SESSION_ID } }),
  }).catch(() => {}); // silently ignore network failures

  // ── GA4 (Google Analytics) ─────────────────────────────────────────────────
  if (typeof gtag === 'function') {
    gtag('event', eventType, properties);
  }
}

// ── Client-Side Result Cache ──────────────────────────────────────────────────
// Privacy-safe: keys are SHA-256 hashed (no plaintext queries stored).
// Repeat queries return instantly from localStorage — no API call needed.
// User can force-refresh with the "Muat ulang" button on cached results.

async function _hashKey(str) {
  try {
    const encoded = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch { return btoa(str).slice(0, 16); }
}

function _cacheNormalise(mode, feeling) {
  return `${mode}:${feeling.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

function getClientCache(hashedKey) {
  try {
    const raw = localStorage.getItem(CLIENT_CACHE_PREFIX + hashedKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(CLIENT_CACHE_PREFIX + hashedKey);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

function setClientCache(hashedKey, data) {
  try {
    // Evict oldest entries if at capacity
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CLIENT_CACHE_PREFIX)) {
        try {
          const entry = JSON.parse(localStorage.getItem(k));
          keys.push({ key: k, expiresAt: entry.expiresAt || 0 });
        } catch { keys.push({ key: k, expiresAt: 0 }); }
      }
    }
    if (keys.length >= CLIENT_CACHE_MAX) {
      keys.sort((a, b) => a.expiresAt - b.expiresAt);
      for (let i = 0; i < keys.length - CLIENT_CACHE_MAX + 1; i++) {
        localStorage.removeItem(keys[i].key);
      }
    }
    localStorage.setItem(CLIENT_CACHE_PREFIX + hashedKey, JSON.stringify({
      data,
      expiresAt: Date.now() + CLIENT_CACHE_TTL,
    }));
  } catch { /* localStorage full or unavailable — silently ignore */ }
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentFeeling    = '';
let currentAyat       = [];
let currentSearchCtx  = { method: 'text', emotionId: null }; // populated in fetchAyat
let typewriterActive  = false; // set false to abort an in-progress typewriter
let currentMode       = null;  // 'curhat' or 'panduan'
let expandedCardId    = null;  // panduan card ID currently expanded, or null
let currentCardIndex  = 0;     // carousel active slide index
let totalVerseCards   = 0;     // total slides (intro + verses)
let _swipeHintTimers  = [];    // timers for peek nudge + auto-advance

// ── Ajarkan Anakku state ──────────────────────────────────────────────────
let ajarkanAgeGroup       = null;   // 'under7' | '7plus' | null
let ajarkanExpandedCatId  = null;   // expanded category slug
let ajarkanCurrentData    = null;   // last result data (for age switch)
let ajarkanCurrentQId     = null;   // last question_id (for age switch re-fetch)

// ── Share sheet state ──────────────────────────────────────────────────────
let shareTheme           = 'light';   // 'light', 'dark', 'classic'
let shareIncludeQuestion = false;
let shareActiveVerse     = null;      // verse object being shared
let shareLastPlatform    = 'wa_chat'; // last selected platform (for preview aspect ratio)

// ── Share Text (WA) state ────────────────────────────────────────────────────
const DEFAULT_SHARE_PREFS = {
  feeling:     true,
  arabic:      true,
  translation: true,
  reference:   true,
  reflection:  false,
  tafsir:      false,   // false | 'ringkasan' | 'lengkap'
};

function loadSharePrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem('share_prefs'));
    if (stored && typeof stored === 'object') return { ...DEFAULT_SHARE_PREFS, ...stored };
  } catch { /* ignore */ }
  return { ...DEFAULT_SHARE_PREFS };
}

function saveSharePrefs(prefs) {
  localStorage.setItem('share_prefs', JSON.stringify(prefs));
}

let shareTextPrefs = loadSharePrefs();

// ── Push Notification ─────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(notifyHour) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const res = await fetch('/api/subscribe-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        notifyHour,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    });
    if (!res.ok) throw new Error('subscribe-push API returned ' + res.status);
    localStorage.setItem('push_subscribed', 'true');
    logEvent('push_subscribed', { hour: notifyHour });
    showToast('Siap! Kamu akan dapat pengingat dari Al-Qur\'an');
  } catch (err) {
    console.error('Push subscribe error:', err);
  }
}

function canShowPushPrompt() {
  if (!('Notification' in window) || !('PushManager' in window)) return false;
  if (localStorage.getItem('push_subscribed') === 'true') return false;
  if (Notification.permission === 'granted') return false;
  if (Notification.permission === 'denied') return false;

  const dismissedUntil = localStorage.getItem('push_dismissed_until');
  if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) return false;

  return true;
}

// If permission was granted but subscription wasn't saved (e.g. network error),
// silently retry so the user doesn't get asked again.
async function resubscribeIfNeeded() {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('push_subscribed') === 'true') return;
  try {
    await subscribeToPush(NOTIFY_TIME_OPTIONS[1].hour);
  } catch (_) { /* will retry next visit */ }
}

function showPushPermissionCard(source) {
  const existing = document.getElementById('pushPermissionCard');
  if (existing) existing.remove();

  // Context-aware copy
  let body;
  if (source === 'post_search') {
    body = 'Ayat ini menyentuh hatimu? Kami bisa kirim satu ayat setiap pagi.';
  } else if (source === 'post_install') {
    body = 'TemuQuran sudah terpasang! Mau diingatkan satu ayat setiap pagi?';
  } else {
    body = 'Mau diingatkan satu ayat setiap pagi? Tanpa spam, cuma satu.';
  }

  const card = document.createElement('div');
  card.id = 'pushPermissionCard';
  card.className = 'push-permission-card';

  card.innerHTML = `
    <div class="ppc-icon">\u{1F514}</div>
    <div class="ppc-title">Pengingat harian dari Al-Qur'an</div>
    <div class="ppc-body">${escapeHtml(body)}</div>
    <div class="ppc-actions">
      <button class="ppc-confirm-btn">Ya, ingatkan aku</button>
      <button class="ppc-dismiss-btn">Nanti saja</button>
    </div>
  `;

  card.querySelector('.ppc-confirm-btn').addEventListener('click', async () => {
    card.remove();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeToPush(NOTIFY_TIME_OPTIONS[1].hour); // default Pagi 07:00
    } else {
      logEvent('push_permission_denied', { source: source || 'engagement' });
    }
  });

  card.querySelector('.ppc-dismiss-btn').addEventListener('click', () => {
    card.remove();
    localStorage.setItem('push_dismissed_until', (Date.now() + 1 * 24 * 60 * 60 * 1000).toString());
    logEvent('push_permission_dismissed', { source: source || 'engagement' });
  });

  // Place card: on landing page or inside verses view for post-search
  if (source === 'post_search') {
    const versesView = document.getElementById('verses-view');
    if (versesView) versesView.appendChild(card);
  } else {
    const a2hsCard = document.getElementById('a2hsCard');
    if (a2hsCard) {
      a2hsCard.after(card);
    } else {
      document.getElementById('landing-view').prepend(card);
    }
  }
}

function requestPushPermission(source) {
  if (!canShowPushPrompt()) return;
  showPushPermissionCard(source);
}

// ── Bismillah Handling ───────────────────────────────────────────────────────
// In the DB, verse 1 of every surah (except At-Tawbah/9) includes the
// Bismillah as a prefix.  For Jelajahi we strip it from verse 1 and
// display it on the intro card instead for a cleaner reading experience.
// Al-Fatihah (1) keeps it because the Bismillah *is* verse 1.
const BISMILLAH_AR = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const BISMILLAH_NFC = BISMILLAH_AR.normalize('NFC');
function stripBismillah(arabic, surahNumber) {
  if (surahNumber === 1 || surahNumber === 9) return arabic;
  // NFC-normalise both sides — DB diacritics ordering may differ from our constant
  const clean = arabic.replace(/^\uFEFF/, '').normalize('NFC');
  if (clean.startsWith(BISMILLAH_NFC)) {
    return clean.slice(BISMILLAH_NFC.length).trim();
  }
  return arabic;
}
function shouldShowBismillah(surahNumber) {
  return surahNumber !== 1 && surahNumber !== 9;
}


let _loadingStepTimer = null;

function startLoadingSteps() {
  const el = document.getElementById('loading-step-text');
  if (!el) return;
  const steps = currentMode === 'jelajahi' ? LOADING_STEPS_JELAJAHI
    : currentMode === 'panduan' ? LOADING_STEPS_PANDUAN
    : currentMode === 'ajarkan' ? LOADING_STEPS_AJARKAN : LOADING_STEPS_CURHAT;
  let i = 0;
  el.textContent = steps[0];
  el.classList.remove('ls-fade');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('ls-fade');

  _loadingStepTimer = setInterval(() => {
    i = (i + 1) % steps.length;
    el.classList.remove('ls-fade');
    void el.offsetWidth;
    el.textContent = steps[i];
    el.classList.add('ls-fade');
  }, 1800);
}

function stopLoadingSteps() {
  if (_loadingStepTimer) {
    clearInterval(_loadingStepTimer);
    _loadingStepTimer = null;
  }
}

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
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let jelajahiAllVerses    = [];   // full verse array from API
let jelajahiLoadedUpTo   = 0;    // how many verse slides rendered so far
let jelajahiSurahInfo    = null; // { number, name, name_arabic, verses, type }
let juzSurahListVisible  = false; // whether juz surah list overlay is showing
let lastJuzSurahTapped   = null; // for back-nav from verses to juz list
let jelajahiMultiResults = null; // multi-result array from AI, or null
let cameFromMultiResult  = false; // whether user arrived at verses via multi-result selection


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

// ── Lazy-load html2canvas ─────────────────────────────────────────────────────
// Only fetched (~200 KB) when the user first taps "Bagikan", not on every page load.

let _h2cPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  if (_h2cPromise) return _h2cPromise;
  _h2cPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Gagal memuat library share. Coba lagi.'));
    document.head.appendChild(s);
  });
  return _h2cPromise;
}

// ── Markdown renderer (for Ibnu Kathir ID — translated + formatted) ───────────
function renderMarkdown(md) {
  const lines  = md.split('\n');
  const out    = [];
  let para     = [];
  let inQuote  = false;

  const inline = t => t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  function flushPara() {
    if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^## /.test(line)) {
      flushPara(); inQuote = false;
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (/^### /.test(line)) {
      flushPara(); inQuote = false;
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (/^> /.test(line)) {
      flushPara();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push(`<p>${inline(line.slice(2))}</p>`);
    } else if (line === '') {
      flushPara();
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }
    } else {
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }
      para.push(inline(line));
    }
  }
  flushPara();
  if (inQuote) out.push('</blockquote>');
  return out.join('\n');
}

function toGlobalAyah(surahNum, verseNum) {
  return SURAH_STARTS[surahNum - 1] + verseNum;
}

let activeAudio   = null;
let activePlayBtn = null;

function stopCurrentAudio() {
  if (activeAudio)   { activeAudio.pause(); activeAudio = null; }
  if (activePlayBtn) {
    activePlayBtn.innerHTML = PLAY_ICON + ' Dengarkan';
    activePlayBtn.classList.remove('playing');
    activePlayBtn.setAttribute('aria-label', 'Dengarkan ayat');
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
  btn.setAttribute('aria-label', 'Jeda audio');


  audio.play().catch(() => {
    showToast('Gagal memuat audio. Coba lagi.');
    stopCurrentAudio();
  });
  audio.addEventListener('ended', stopCurrentAudio);
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

// ── Mode Selection ────────────────────────────────────────────────────────

function selectMode(mode) {
  currentMode = mode;
  logEvent('mode_selected', { mode });
  if (mode === 'jelajahi')      switchView('jelajahi-view');
  else if (mode === 'panduan')  switchView('panduan-view');
  else if (mode === 'ajarkan')  switchView('ajarkan-view');
  else                          switchView('selection-view');
}

// ── Landing Card Clicks ─────────────────────────────────────────────────

function initLandingCarousel() {
  const container = document.getElementById('landing-cards');
  if (!container) return;

  // Card click → selectMode
  container.querySelectorAll('.landing-card').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
  });
}

// ── Error / Not-relevant States ───────────────────────────────────────────────
// Both render as an app chat bubble with a small action button inside.

function showAppBubble(text, btnLabel, btnAction) {
  stopLoadingSteps();
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  const carousel = document.getElementById('verses-carousel');

  if (currentMode === 'jelajahi') {
    // Jelajahi error: simple centered message, no chat bubble
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="jelajahi-loading">
          <p style="font-size:1rem; color:var(--text-dark); text-align:center; padding:0 20px;">${text}</p>
          <div style="text-align:center; margin-top:20px;">
            <button class="cb-back-btn" id="error-back-btn">${btnLabel}</button>
          </div>
        </div>
      </div>
    `;
  } else {
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="intro-chat">
          <div class="chat-thread">
            <div class="chat-bubble chat-bubble--user">${escapeHtml(currentFeeling)}</div>
            <div class="chat-bubble chat-bubble--app">${text}</div>
          </div>
          <div style="text-align:center; margin-top:20px;">
            <button class="cb-back-btn" id="error-back-btn">${btnLabel}</button>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('verses-dots').innerHTML = '';
  document.getElementById('verse-counter-text').textContent = '';
  carousel.querySelector('#error-back-btn').addEventListener('click', btnAction);
}

function getParentView() {
  if (currentMode === 'jelajahi') return 'jelajahi-view';
  if (currentMode === 'panduan')  return 'panduan-view';
  if (currentMode === 'ajarkan')  return 'ajarkan-view';
  return 'selection-view';
}

function showError(message = 'Terjadi kesalahan. Silakan coba lagi.') {
  showAppBubble(
    `😔 ${escapeHtml(message)}`,
    '← Coba Lagi',
    () => switchView(getParentView()),
  );
}

function showNotRelevant(message) {
  const btnLabel = currentMode === 'jelajahi' ? '← Coba cari lagi'
    : currentMode === 'panduan' ? '← Ajukan pertanyaan lain'
    : currentMode === 'ajarkan' ? '← Coba pertanyaan lain' : '← Ceritakan perasaanmu';
  showAppBubble(
    `🤔 ${escapeHtml(message)}`,
    btnLabel,
    () => switchView(getParentView()),
  );
}

// ── API Call ──────────────────────────────────────────────────────────────────

async function callAPI(feeling, { refresh = false } = {}) {
  // ── Client-side cache check (privacy-safe: hashed keys) ─────────────────
  const normKey = _cacheNormalise(currentMode, feeling);
  const hashedKey = await _hashKey(normKey);
  if (!refresh) {
    const cached = getClientCache(hashedKey);
    if (cached) {
      logEvent('search_cached', { source: 'client' });
      cached._fromClientCache = true;
      return cached;
    }
  }

  const res = await fetch('/api/get-ayat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeling, mode: currentMode, ...(refresh ? { refresh: true } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  if (res.headers.get('X-Cache') === 'HIT') logEvent('search_cached', { source: 'server' });

  // Cache successful results client-side (skip not_relevant and error payloads)
  if (!data.not_relevant && data.ayat) {
    setClientCache(hashedKey, data);
  }

  return data;
}

async function fetchAyat(feeling, { method = 'text', emotionId, refresh = false } = {}) {
  currentFeeling   = feeling;
  currentSearchCtx = { method, emotionId: emotionId || null };
  switchView('verses-view');

  const startProps = { method };
  if (emotionId) startProps.emotion_id = emotionId;
  logEvent('search_started', startProps);

  try {
    // Check client cache first — if hit, skip loading animation entirely
    const normKey = _cacheNormalise(currentMode, feeling);
    const hashedKey = await _hashKey(normKey);
    const quickCached = !refresh && getClientCache(hashedKey);

    if (!quickCached) showLoading();

    const data = await callAPI(feeling, { refresh });
    if (data.not_relevant) {
      logEvent('search_completed', { outcome: 'not_relevant' });
      showNotRelevant(data.message);
    } else {
      logEvent('search_completed', {
        outcome: 'success',
        verse_count: data.ayat?.length ?? 0,
        from_cache: !!data._fromClientCache,
      });
      renderVerses(data);
      // Path 4 — Post-search: ask after 5s on results page (high-intent moment)
      setTimeout(() => requestPushPermission('post_search'), 5000);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

// ── Verse Carousel Arrow Navigation ──────────────────────────────────────────

function scrollCarouselTo(index) {
  const carousel = document.getElementById('verses-carousel');
  const slideWidth = carousel.offsetWidth;
  // Use instant scroll — smooth conflicts with scroll-snap-type: x mandatory.
  // Instant scrollTo doesn't fire scroll events, so we update state manually.
  carousel.scrollTo({ left: index * slideWidth, behavior: 'instant' });
  if (index !== currentCardIndex) {
    currentCardIndex = index;
    updateCounter();
    updateDots();
    updateProgressBar();
    if (index > 0 && _swipeHintTimers.length > 0) clearSwipeHints();
    stopCurrentAudio();
    logEvent('verse_swiped', { slide_index: index, total: totalVerseCards });
    if (index === totalVerseCards - 1) showVerseActions();
  }
}
