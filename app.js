'use strict';

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
      showA2HSGuide();
      logEvent('a2hs_tapped', { platform: 'other' });
    }
  });
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

// ── Loading Steps ─────────────────────────────────────────────────────────────

const LOADING_STEPS_CURHAT = [
  'Memahami perasaanmu',
  'Menelusuri Al-Qur\'an',
  'Mencocokkan ayat yang relevan',
  'Menyiapkan refleksi untukmu',
];

const LOADING_STEPS_PANDUAN = [
  'Memahami pertanyaanmu',
  'Menelusuri Al-Qur\'an',
  'Mencocokkan ayat yang relevan',
  'Menyiapkan penjelasan untukmu',
];

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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Emotion Shortcuts ─────────────────────────────────────────────────────────

const emotions = [
  { id: 'sad',      label: 'Sedih',       emoji: '🌧️', desc: 'Merasa sedih atau patah hati',       accent: '#6B8DD6', feeling: 'Aku merasa sangat sedih dan patah hati' },
  { id: 'anxious',  label: 'Cemas',       emoji: '😰', desc: 'Merasa khawatir atau takut',          accent: '#F6AD55', feeling: 'Aku merasa sangat cemas dan khawatir tentang masa depan' },
  { id: 'hopeless', label: 'Putus Asa',   emoji: '🌑', desc: 'Merasa putus asa atau tanpa harapan', accent: '#FC8181', feeling: 'Aku merasa putus asa dan sudah tidak ada harapan lagi' },
  { id: 'grateful', label: 'Bersyukur',   emoji: '✨', desc: 'Merasa bersyukur dan beruntung',      accent: '#68D391', feeling: 'Aku merasa sangat bersyukur dan ingin mengungkapkan rasa terima kasih kepada Allah' },
  { id: 'angry',    label: 'Marah',       emoji: '🌋', desc: 'Merasa frustrasi atau marah',         accent: '#FC8181', feeling: 'Aku merasa sangat marah dan frustrasi, sulit mengendalikan emosi' },
  { id: 'lonely',   label: 'Kesepian',    emoji: '🌙', desc: 'Merasa kesepian atau sendirian',      accent: '#B794F4', feeling: 'Aku merasa sangat kesepian dan sendirian, tidak ada yang memahami aku' },
  { id: 'lost',     label: 'Kebingungan', emoji: '🧭', desc: 'Merasa bingung atau kehilangan arah', accent: '#63B3ED', feeling: 'Aku merasa bingung dan kehilangan arah tujuan hidup' },
  { id: 'stressed', label: 'Stres',       emoji: '⚡', desc: 'Merasa tertekan atau kelelahan',      accent: '#F6AD55', feeling: 'Aku merasa sangat stres dan kelelahan, beban hidup terasa terlalu berat' },
  { id: 'guilty',   label: 'Bersalah',    emoji: '🍂', desc: 'Merasa bersalah atau menyesal',       accent: '#C9A84C', feeling: 'Aku merasa sangat bersalah dan menyesal atas perbuatanku, ingin bertobat' },
  { id: 'envious',  label: 'Iri Hati',    emoji: '🌿', desc: 'Merasa iri atau membandingkan diri',  accent: '#68D391', feeling: 'Aku merasa iri hati melihat orang lain, sulit bersyukur dengan apa yang aku miliki' },
  { id: 'longing',  label: 'Rindu',       emoji: '💭', desc: 'Merasa rindu atau kehilangan seseorang', accent: '#76A9EA', feeling: 'Aku merasa sangat rindu dan kehilangan seseorang yang sangat berarti bagiku, rasa kangen ini terasa berat' },
  { id: 'disappointed', label: 'Kecewa', emoji: '🌫️', desc: 'Merasa kecewa atau patah harapan',     accent: '#94A3B8', feeling: 'Aku merasa sangat kecewa karena harapan dan ekspektasiku tidak terwujud' },
  { id: 'afraid',   label: 'Takut',       emoji: '🌪️', desc: 'Merasa takut atau tidak aman',         accent: '#E07B4A', feeling: 'Aku merasa sangat takut dan tidak berani menghadapi sesuatu yang ada di depanku' },
];

const panduanPresets = [
  { id: 'ibadah',      label: 'Ingin Ibadah Lebih Baik',    emoji: '🕌',     query: 'Saya ingin memperbaiki dan meningkatkan kualitas ibadah saya' },
  { id: 'dekat-allah', label: 'Ingin Lebih Dekat Allah',    emoji: '🤲',     query: 'Saya ingin memperdalam hubungan saya dengan Allah melalui doa dan dzikir' },
  { id: 'taubat',      label: 'Ingin Bertaubat',            emoji: '❤️‍🩹',    query: 'Saya ingin bertaubat dan kembali ke jalan yang benar' },
  { id: 'hati-niat',   label: 'Menjaga Hati & Niat',       emoji: '🪞',     query: 'Saya ingin menjaga keikhlasan dan kebersihan niat dalam hidup' },
  { id: 'halal-haram', label: 'Halal atau Haram?',          emoji: '⚖️',     query: 'Saya ingin memahami batasan halal dan haram dalam kehidupan sehari-hari' },
  { id: 'rezeki',      label: 'Rezeki & Harta',             emoji: '💰',     query: 'Saya mencari panduan tentang rezeki halal, sedekah, dan pengelolaan harta' },
  { id: 'keluarga',    label: 'Menjaga Keluarga',           emoji: '👨‍👩‍👧',   query: 'Saya ingin panduan membangun dan menjaga keharmonisan keluarga' },
  { id: 'pernikahan',  label: 'Mempersiapkan Pernikahan',   emoji: '💍',     query: 'Saya ingin panduan tentang pernikahan menurut Al-Qur\'an' },
  { id: 'akhlak',      label: 'Bergaul dengan Baik',        emoji: '🤝',     query: 'Saya ingin panduan berakhlak baik dan menjaga hubungan dengan sesama' },
  { id: 'akhirat',     label: 'Mengingat Akhirat',          emoji: '🌙',     query: 'Saya ingin merenungkan kehidupan akhirat dan mempersiapkan diri' },
];

// ── Sub-Questions for Panduan Presets ─────────────────────────────────────────
// Keyed by hyphenated card ID to match panduanPresets.
// PRD's 'bergaul' maps to existing 'akhlak' preset ID.

const PANDUAN_SUB_QUESTIONS = {
  'ibadah': [
    "Bagaimana menjaga konsistensi sholat lima waktu?",
    "Apa keutamaan sholat tahajjud dan qiyamul lail?",
    "Bagaimana cara khusyu' dalam beribadah?",
    "Apa panduan puasa sunnah dalam Al-Qur'an?",
    "Bagaimana keutamaan membaca Al-Qur'an setiap hari?",
    "Apa yang Allah firmankan tentang orang yang lalai dalam ibadah?",
    "Bagaimana menjaga ibadah tetap semangat saat sibuk?",
    "Apa panduan Al-Qur'an tentang bersedekah dan zakat?",
  ],
  'dekat-allah': [
    "Bagaimana cara merasakan kehadiran Allah dalam keseharian?",
    "Doa apa yang diajarkan Al-Qur'an saat merasa jauh dari Allah?",
    "Bagaimana menjaga istiqomah dalam berdzikir?",
    "Apa yang Allah firmankan tentang orang yang berserah diri?",
    "Bagaimana cara bertawakal dengan benar?",
    "Apa makna cinta Allah kepada hamba-Nya?",
    "Bagaimana cara bersyukur yang diajarkan Al-Qur'an?",
    "Apa yang terjadi ketika hamba memanggil Allah?",
  ],
  'taubat': [
    "Saya terus mengulangi dosa yang sama, bagaimana caranya berhenti?",
    "Apakah Allah masih menerima taubat saya?",
    "Bagaimana cara bertaubat yang benar menurut Al-Qur'an?",
    "Saya merasa sudah terlalu banyak dosa untuk diampuni",
    "Bagaimana menghapus rasa bersalah setelah bertaubat?",
    "Apa yang Allah janjikan bagi orang yang bertaubat dengan sungguh-sungguh?",
    "Bagaimana cara menebus kesalahan kepada orang lain?",
    "Apakah dosa besar masih bisa diampuni?",
  ],
  'hati-niat': [
    "Bagaimana menjaga keikhlasan dalam beramal?",
    "Saya sering riya' dalam beribadah, bagaimana mengatasinya?",
    "Apa yang Al-Qur'an katakan tentang penyakit hati?",
    "Bagaimana cara membersihkan hati dari dengki dan iri?",
    "Bagaimana mengontrol amarah menurut Al-Qur'an?",
    "Apa panduan Al-Qur'an tentang sifat sombong dan takabur?",
    "Bagaimana menjaga niat tetap lurus saat dipuji orang?",
    "Apa yang Al-Qur'an ajarkan tentang sabar dan menahan diri?",
  ],
  'halal-haram': [
    "Bagaimana hukum riba dan bunga bank dalam Islam?",
    "Apa panduan Al-Qur'an tentang makanan dan minuman halal?",
    "Bagaimana hukum bermuamalah dengan non-Muslim?",
    "Apa batasan aurat dan berpakaian menurut Al-Qur'an?",
    "Bagaimana hukum jual beli dan perdagangan dalam Islam?",
    "Apa panduan Al-Qur'an tentang sumpah dan janji?",
    "Bagaimana hukum memakan harta anak yatim?",
    "Apa yang Al-Qur'an katakan tentang minuman keras dan judi?",
  ],
  'rezeki': [
    "Bagaimana panduan Al-Qur'an tentang sedekah dan infaq?",
    "Apa yang Allah janjikan tentang rezeki bagi orang beriman?",
    "Bagaimana hukum zakat dan kepada siapa harus diberikan?",
    "Saya khawatir soal keuangan, apa panduan Al-Qur'an?",
    "Bagaimana sikap Islam terhadap kemiskinan dan kekayaan?",
    "Apa panduan Al-Qur'an tentang utang piutang?",
    "Bagaimana cara mencari nafkah yang halal dan berkah?",
    "Apa yang Al-Qur'an katakan tentang menimbun harta?",
  ],
  'keluarga': [
    "Bagaimana cara mendidik anak menurut Al-Qur'an?",
    "Apa hak dan kewajiban suami istri dalam Islam?",
    "Bagaimana berbakti kepada orang tua yang sudah lanjut usia?",
    "Bagaimana menghadapi konflik dalam rumah tangga?",
    "Apa panduan Al-Qur'an tentang menjaga silaturahmi?",
    "Bagaimana hukum dan etika perceraian dalam Islam?",
    "Apa tanggung jawab orang tua terhadap anak dalam Al-Qur'an?",
    "Bagaimana menjaga keharmonisan dengan keluarga besar?",
  ],
  'pernikahan': [
    "Apa kriteria memilih pasangan menurut Al-Qur'an?",
    "Bagaimana mawaddah wa rahmah dalam pernikahan?",
    "Apa hak dan tanggung jawab dalam pernikahan Islam?",
    "Bagaimana panduan Al-Qur'an tentang mahar dan walimah?",
    "Apa adab pergaulan sebelum menikah menurut Islam?",
    "Bagaimana mempersiapkan diri secara spiritual untuk menikah?",
    "Apa yang Al-Qur'an ajarkan tentang sakinah dalam rumah tangga?",
    "Bagaimana panduan Al-Qur'an tentang menikah beda suku atau budaya?",
  ],
  'akhlak': [
    "Bagaimana adab bertetangga dalam Islam?",
    "Apa panduan Al-Qur'an tentang memaafkan orang lain?",
    "Bagaimana menghadapi orang yang menyakiti kita?",
    "Apa yang Al-Qur'an ajarkan tentang menjaga lisan?",
    "Bagaimana etika berbisnis dan bekerja dengan orang lain?",
    "Apa panduan Al-Qur'an tentang tolong-menolong?",
    "Bagaimana menghadapi ghibah dan fitnah?",
    "Apa yang Al-Qur'an katakan tentang persatuan dan persaudaraan?",
  ],
  'akhirat': [
    "Apa yang Al-Qur'an ceritakan tentang hari kiamat?",
    "Bagaimana gambaran surga dalam Al-Qur'an?",
    "Apa amalan yang berat di timbangan akhirat?",
    "Bagaimana cara mempersiapkan diri menghadapi kematian?",
    "Apa yang terjadi di alam kubur menurut Al-Qur'an?",
    "Bagaimana gambaran neraka sebagai peringatan?",
    "Apa yang Al-Qur'an katakan tentang syafaat di hari akhir?",
    "Bagaimana mengingat akhirat tanpa melupakan kehidupan dunia?",
  ],
};

// ── Surah Metadata (114 surahs — hardcoded, never changes) ──────────────────
const SURAH_META = [
  { number: 1, name: 'Al-Fatihah', name_arabic: 'الفاتحة', verses: 7, type: 'Makkiyyah' },
  { number: 2, name: 'Al-Baqarah', name_arabic: 'البقرة', verses: 286, type: 'Madaniyyah' },
  { number: 3, name: 'Ali Imran', name_arabic: 'آل عمران', verses: 200, type: 'Madaniyyah' },
  { number: 4, name: 'An-Nisa', name_arabic: 'النساء', verses: 176, type: 'Madaniyyah' },
  { number: 5, name: 'Al-Ma\'idah', name_arabic: 'المائدة', verses: 120, type: 'Madaniyyah' },
  { number: 6, name: 'Al-An\'am', name_arabic: 'الأنعام', verses: 165, type: 'Makkiyyah' },
  { number: 7, name: 'Al-A\'raf', name_arabic: 'الأعراف', verses: 206, type: 'Makkiyyah' },
  { number: 8, name: 'Al-Anfal', name_arabic: 'الأنفال', verses: 75, type: 'Madaniyyah' },
  { number: 9, name: 'At-Taubah', name_arabic: 'التوبة', verses: 129, type: 'Madaniyyah' },
  { number: 10, name: 'Yunus', name_arabic: 'يونس', verses: 109, type: 'Makkiyyah' },
  { number: 11, name: 'Hud', name_arabic: 'هود', verses: 123, type: 'Makkiyyah' },
  { number: 12, name: 'Yusuf', name_arabic: 'يوسف', verses: 111, type: 'Makkiyyah' },
  { number: 13, name: 'Ar-Ra\'d', name_arabic: 'الرعد', verses: 43, type: 'Madaniyyah' },
  { number: 14, name: 'Ibrahim', name_arabic: 'إبراهيم', verses: 52, type: 'Makkiyyah' },
  { number: 15, name: 'Al-Hijr', name_arabic: 'الحجر', verses: 99, type: 'Makkiyyah' },
  { number: 16, name: 'An-Nahl', name_arabic: 'النحل', verses: 128, type: 'Makkiyyah' },
  { number: 17, name: 'Al-Isra\'', name_arabic: 'الإسراء', verses: 111, type: 'Makkiyyah' },
  { number: 18, name: 'Al-Kahf', name_arabic: 'الكهف', verses: 110, type: 'Makkiyyah' },
  { number: 19, name: 'Maryam', name_arabic: 'مريم', verses: 98, type: 'Makkiyyah' },
  { number: 20, name: 'Ta Ha', name_arabic: 'طه', verses: 135, type: 'Makkiyyah' },
  { number: 21, name: 'Al-Anbiya', name_arabic: 'الأنبياء', verses: 112, type: 'Makkiyyah' },
  { number: 22, name: 'Al-Hajj', name_arabic: 'الحج', verses: 78, type: 'Madaniyyah' },
  { number: 23, name: 'Al-Mu\'minun', name_arabic: 'المؤمنون', verses: 118, type: 'Makkiyyah' },
  { number: 24, name: 'An-Nur', name_arabic: 'النور', verses: 64, type: 'Madaniyyah' },
  { number: 25, name: 'Al-Furqan', name_arabic: 'الفرقان', verses: 77, type: 'Makkiyyah' },
  { number: 26, name: 'Asy-Syu\'ara\'', name_arabic: 'الشعراء', verses: 227, type: 'Makkiyyah' },
  { number: 27, name: 'An-Naml', name_arabic: 'النمل', verses: 93, type: 'Makkiyyah' },
  { number: 28, name: 'Al-Qasas', name_arabic: 'القصص', verses: 88, type: 'Makkiyyah' },
  { number: 29, name: 'Al-\'Ankabut', name_arabic: 'العنكبوت', verses: 69, type: 'Makkiyyah' },
  { number: 30, name: 'Ar-Rum', name_arabic: 'الروم', verses: 60, type: 'Makkiyyah' },
  { number: 31, name: 'Luqman', name_arabic: 'لقمان', verses: 34, type: 'Makkiyyah' },
  { number: 32, name: 'As-Sajdah', name_arabic: 'السجدة', verses: 30, type: 'Makkiyyah' },
  { number: 33, name: 'Al-Ahzab', name_arabic: 'الأحزاب', verses: 73, type: 'Madaniyyah' },
  { number: 34, name: 'Saba\'', name_arabic: 'سبأ', verses: 54, type: 'Makkiyyah' },
  { number: 35, name: 'Fatir', name_arabic: 'فاطر', verses: 45, type: 'Makkiyyah' },
  { number: 36, name: 'Ya Sin', name_arabic: 'يس', verses: 83, type: 'Makkiyyah' },
  { number: 37, name: 'As-Saffat', name_arabic: 'الصافات', verses: 182, type: 'Makkiyyah' },
  { number: 38, name: 'Sad', name_arabic: 'ص', verses: 88, type: 'Makkiyyah' },
  { number: 39, name: 'Az-Zumar', name_arabic: 'الزمر', verses: 75, type: 'Makkiyyah' },
  { number: 40, name: 'Ghafir', name_arabic: 'غافر', verses: 85, type: 'Makkiyyah' },
  { number: 41, name: 'Fussilat', name_arabic: 'فصلت', verses: 54, type: 'Makkiyyah' },
  { number: 42, name: 'Asy-Syura', name_arabic: 'الشورى', verses: 53, type: 'Makkiyyah' },
  { number: 43, name: 'Az-Zukhruf', name_arabic: 'الزخرف', verses: 89, type: 'Makkiyyah' },
  { number: 44, name: 'Ad-Dukhan', name_arabic: 'الدخان', verses: 59, type: 'Makkiyyah' },
  { number: 45, name: 'Al-Jasiyah', name_arabic: 'الجاثية', verses: 37, type: 'Makkiyyah' },
  { number: 46, name: 'Al-Ahqaf', name_arabic: 'الأحقاف', verses: 35, type: 'Makkiyyah' },
  { number: 47, name: 'Muhammad', name_arabic: 'محمد', verses: 38, type: 'Madaniyyah' },
  { number: 48, name: 'Al-Fath', name_arabic: 'الفتح', verses: 29, type: 'Madaniyyah' },
  { number: 49, name: 'Al-Hujurat', name_arabic: 'الحجرات', verses: 18, type: 'Madaniyyah' },
  { number: 50, name: 'Qaf', name_arabic: 'ق', verses: 45, type: 'Makkiyyah' },
  { number: 51, name: 'Az-Zariyat', name_arabic: 'الذاريات', verses: 60, type: 'Makkiyyah' },
  { number: 52, name: 'At-Tur', name_arabic: 'الطور', verses: 49, type: 'Makkiyyah' },
  { number: 53, name: 'An-Najm', name_arabic: 'النجم', verses: 62, type: 'Makkiyyah' },
  { number: 54, name: 'Al-Qamar', name_arabic: 'القمر', verses: 55, type: 'Makkiyyah' },
  { number: 55, name: 'Ar-Rahman', name_arabic: 'الرحمن', verses: 78, type: 'Madaniyyah' },
  { number: 56, name: 'Al-Waqi\'ah', name_arabic: 'الواقعة', verses: 96, type: 'Makkiyyah' },
  { number: 57, name: 'Al-Hadid', name_arabic: 'الحديد', verses: 29, type: 'Madaniyyah' },
  { number: 58, name: 'Al-Mujadilah', name_arabic: 'المجادلة', verses: 22, type: 'Madaniyyah' },
  { number: 59, name: 'Al-Hasyr', name_arabic: 'الحشر', verses: 24, type: 'Madaniyyah' },
  { number: 60, name: 'Al-Mumtahanah', name_arabic: 'الممتحنة', verses: 13, type: 'Madaniyyah' },
  { number: 61, name: 'As-Saff', name_arabic: 'الصف', verses: 14, type: 'Madaniyyah' },
  { number: 62, name: 'Al-Jumu\'ah', name_arabic: 'الجمعة', verses: 11, type: 'Madaniyyah' },
  { number: 63, name: 'Al-Munafiqun', name_arabic: 'المنافقون', verses: 11, type: 'Madaniyyah' },
  { number: 64, name: 'At-Tagabun', name_arabic: 'التغابن', verses: 18, type: 'Madaniyyah' },
  { number: 65, name: 'At-Talaq', name_arabic: 'الطلاق', verses: 12, type: 'Madaniyyah' },
  { number: 66, name: 'At-Tahrim', name_arabic: 'التحريم', verses: 12, type: 'Madaniyyah' },
  { number: 67, name: 'Al-Mulk', name_arabic: 'الملك', verses: 30, type: 'Makkiyyah' },
  { number: 68, name: 'Al-Qalam', name_arabic: 'القلم', verses: 52, type: 'Makkiyyah' },
  { number: 69, name: 'Al-Haqqah', name_arabic: 'الحاقة', verses: 52, type: 'Makkiyyah' },
  { number: 70, name: 'Al-Ma\'arij', name_arabic: 'المعارج', verses: 44, type: 'Makkiyyah' },
  { number: 71, name: 'Nuh', name_arabic: 'نوح', verses: 28, type: 'Makkiyyah' },
  { number: 72, name: 'Al-Jinn', name_arabic: 'الجن', verses: 28, type: 'Makkiyyah' },
  { number: 73, name: 'Al-Muzzammil', name_arabic: 'المزمل', verses: 20, type: 'Makkiyyah' },
  { number: 74, name: 'Al-Muddassir', name_arabic: 'المدثر', verses: 56, type: 'Makkiyyah' },
  { number: 75, name: 'Al-Qiyamah', name_arabic: 'القيامة', verses: 40, type: 'Makkiyyah' },
  { number: 76, name: 'Al-Insan', name_arabic: 'الإنسان', verses: 31, type: 'Madaniyyah' },
  { number: 77, name: 'Al-Mursalat', name_arabic: 'المرسلات', verses: 50, type: 'Makkiyyah' },
  { number: 78, name: 'An-Naba\'', name_arabic: 'النبأ', verses: 40, type: 'Makkiyyah' },
  { number: 79, name: 'An-Nazi\'at', name_arabic: 'النازعات', verses: 46, type: 'Makkiyyah' },
  { number: 80, name: '\'Abasa', name_arabic: 'عبس', verses: 42, type: 'Makkiyyah' },
  { number: 81, name: 'At-Takwir', name_arabic: 'التكوير', verses: 29, type: 'Makkiyyah' },
  { number: 82, name: 'Al-Infitar', name_arabic: 'الانفطار', verses: 19, type: 'Makkiyyah' },
  { number: 83, name: 'Al-Mutaffifin', name_arabic: 'المطففين', verses: 36, type: 'Makkiyyah' },
  { number: 84, name: 'Al-Insyiqaq', name_arabic: 'الانشقاق', verses: 25, type: 'Makkiyyah' },
  { number: 85, name: 'Al-Buruj', name_arabic: 'البروج', verses: 22, type: 'Makkiyyah' },
  { number: 86, name: 'At-Tariq', name_arabic: 'الطارق', verses: 17, type: 'Makkiyyah' },
  { number: 87, name: 'Al-A\'la', name_arabic: 'الأعلى', verses: 19, type: 'Makkiyyah' },
  { number: 88, name: 'Al-Gasyiyah', name_arabic: 'الغاشية', verses: 26, type: 'Makkiyyah' },
  { number: 89, name: 'Al-Fajr', name_arabic: 'الفجر', verses: 30, type: 'Makkiyyah' },
  { number: 90, name: 'Al-Balad', name_arabic: 'البلد', verses: 20, type: 'Makkiyyah' },
  { number: 91, name: 'Asy-Syams', name_arabic: 'الشمس', verses: 15, type: 'Makkiyyah' },
  { number: 92, name: 'Al-Lail', name_arabic: 'الليل', verses: 21, type: 'Makkiyyah' },
  { number: 93, name: 'Ad-Duha', name_arabic: 'الضحى', verses: 11, type: 'Makkiyyah' },
  { number: 94, name: 'Al-Insyirah', name_arabic: 'الشرح', verses: 8, type: 'Makkiyyah' },
  { number: 95, name: 'At-Tin', name_arabic: 'التين', verses: 8, type: 'Makkiyyah' },
  { number: 96, name: 'Al-\'Alaq', name_arabic: 'العلق', verses: 19, type: 'Makkiyyah' },
  { number: 97, name: 'Al-Qadr', name_arabic: 'القدر', verses: 5, type: 'Makkiyyah' },
  { number: 98, name: 'Al-Bayyinah', name_arabic: 'البينة', verses: 8, type: 'Madaniyyah' },
  { number: 99, name: 'Az-Zalzalah', name_arabic: 'الزلزلة', verses: 8, type: 'Madaniyyah' },
  { number: 100, name: 'Al-\'Adiyat', name_arabic: 'العاديات', verses: 11, type: 'Makkiyyah' },
  { number: 101, name: 'Al-Qari\'ah', name_arabic: 'القارعة', verses: 11, type: 'Makkiyyah' },
  { number: 102, name: 'At-Takasur', name_arabic: 'التكاثر', verses: 8, type: 'Makkiyyah' },
  { number: 103, name: 'Al-\'Asr', name_arabic: 'العصر', verses: 3, type: 'Makkiyyah' },
  { number: 104, name: 'Al-Humazah', name_arabic: 'الهمزة', verses: 9, type: 'Makkiyyah' },
  { number: 105, name: 'Al-Fil', name_arabic: 'الفيل', verses: 5, type: 'Makkiyyah' },
  { number: 106, name: 'Quraisy', name_arabic: 'قريش', verses: 4, type: 'Makkiyyah' },
  { number: 107, name: 'Al-Ma\'un', name_arabic: 'الماعون', verses: 7, type: 'Makkiyyah' },
  { number: 108, name: 'Al-Kausar', name_arabic: 'الكوثر', verses: 3, type: 'Makkiyyah' },
  { number: 109, name: 'Al-Kafirun', name_arabic: 'الكافرون', verses: 6, type: 'Makkiyyah' },
  { number: 110, name: 'An-Nasr', name_arabic: 'النصر', verses: 3, type: 'Madaniyyah' },
  { number: 111, name: 'Al-Lahab', name_arabic: 'المسد', verses: 5, type: 'Makkiyyah' },
  { number: 112, name: 'Al-Ikhlas', name_arabic: 'الإخلاص', verses: 4, type: 'Makkiyyah' },
  { number: 113, name: 'Al-Falaq', name_arabic: 'الفلق', verses: 5, type: 'Makkiyyah' },
  { number: 114, name: 'An-Nas', name_arabic: 'الناس', verses: 6, type: 'Makkiyyah' },
];

const JUZ_30_SURAHS = SURAH_META.filter(s => s.number >= 78 && s.number <= 114);

// ── Surah Browser Groupings ─────────────────────────────────────────────────
const SURAH_BROWSER = [
  { label: 'Juz 1 – 5',   surahs: [1, 2, 3, 4] },
  { label: 'Juz 6 – 10',  surahs: [5, 6, 7, 8, 9] },
  { label: 'Juz 11 – 15', surahs: [10, 11, 12, 13, 14, 15, 16, 17] },
  { label: 'Juz 16 – 20', surahs: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29] },
  { label: 'Juz 21 – 25', surahs: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
  { label: 'Juz 26',      surahs: [46, 47, 48, 49, 50, 51] },
  { label: 'Juz 27',      surahs: [52, 53, 54, 55, 56, 57] },
  { label: 'Juz 28',      surahs: [58, 59, 60, 61, 62, 63, 64, 65, 66] },
  { label: 'Juz 29',      surahs: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77] },
  { label: 'Juz 30',      surahs: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114] },
];

const LOADING_STEPS_JELAJAHI = [
  'Membuka surah...',
  'Menyiapkan ayat-ayat...',
  'Mempersiapkan bacaan...',
  'Hampir siap...',
];

const LOADING_STEPS_AJARKAN = [
  'Mencari pertanyaan...',
  'Menyiapkan penjelasan...',
  'Menyusun ide ngobrol...',
  'Hampir siap...',
];

const AJARKAN_CATEGORIES = [
  {
    id: 'aqidah',
    emoji: '\u{1F932}',
    label: 'Aqidah',
    subcategories: [
      {
        id: 'siapa-allah',
        name: 'Siapa Allah',
        questions: [
          { id: 'siapa-allah-01', text: 'Siapa itu Allah?' },
          { id: 'siapa-allah-02', text: 'Di mana Allah berada?' },
          { id: 'siapa-allah-03', text: 'Kenapa kita tidak bisa lihat Allah?' },
          { id: 'siapa-allah-04', text: 'Apakah Allah selalu ada?' },
          { id: 'siapa-allah-05', text: 'Apakah Allah mendengar doa kita?' },
          { id: 'siapa-allah-06', text: 'Apakah Allah sayang kepada kita?' },
          { id: 'siapa-allah-07', text: 'Kenapa Allah menciptakan kita?' },
          { id: 'siapa-allah-08', text: 'Apakah Allah punya nama lain?' },
          { id: 'siapa-allah-09', text: 'Apa itu Asmaul Husna?' },
          { id: 'siapa-allah-10', text: 'Apa artinya Allah Maha Mengetahui?' },
          { id: 'siapa-allah-11', text: 'Apa artinya Allah Maha Kuasa?' },
          { id: 'siapa-allah-12', text: 'Kenapa kita harus percaya kepada Allah?' },
          { id: 'siapa-allah-13', text: 'Apa bedanya Allah dengan manusia?' },
          { id: 'siapa-allah-14', text: 'Apakah Allah pernah tidur?' },
          { id: 'siapa-allah-15', text: 'Apakah Allah pernah marah?' },
          { id: 'siapa-allah-16', text: 'Kenapa Allah tidak terlihat tapi kita harus percaya?' },
          { id: 'siapa-allah-17', text: 'Kenapa hanya ada satu Allah?' },
          { id: 'siapa-allah-18', text: 'Bagaimana cara kita mengenal Allah lebih dalam?' },
          { id: 'siapa-allah-19', text: 'Kenapa Allah menciptakan alam semesta?' },
          { id: 'siapa-allah-20', text: 'Apakah Allah selalu bersama kita?' },
          { id: 'siapa-allah-21', text: 'Kenapa Allah memberikan ujian kepada kita?' },
          { id: 'siapa-allah-22', text: 'Apakah Allah senang ketika kita berdoa?' },
          { id: 'siapa-allah-23', text: 'Bagaimana Allah bisa dengar semua doa semua orang sekaligus?' },
          { id: 'siapa-allah-24', text: 'Apa yang dimaksud dengan ridha Allah?' },
        ]
      },
      {
        id: 'quran-wahyu',
        name: 'Quran dan Wahyu',
        questions: [
          { id: 'quran-wahyu-01', text: 'Apa itu Al-Qur\'an?' },
          { id: 'quran-wahyu-02', text: 'Siapa yang membuat Al-Qur\'an?' },
          { id: 'quran-wahyu-03', text: 'Kenapa kita harus baca Al-Qur\'an?' },
          { id: 'quran-wahyu-04', text: 'Apa isi Al-Qur\'an?' },
          { id: 'quran-wahyu-05', text: 'Kenapa Al-Qur\'an ditulis dalam bahasa Arab?' },
          { id: 'quran-wahyu-06', text: 'Bagaimana Al-Qur\'an sampai ke kita?' },
          { id: 'quran-wahyu-07', text: 'Siapa itu Nabi Muhammad dan apa hubungannya dengan Qur\'an?' },
          { id: 'quran-wahyu-08', text: 'Apa itu wahyu?' },
          { id: 'quran-wahyu-09', text: 'Kenapa Al-Qur\'an tidak berubah sampai sekarang?' },
          { id: 'quran-wahyu-10', text: 'Apa manfaat membaca Al-Qur\'an setiap hari?' },
          { id: 'quran-wahyu-11', text: 'Kenapa kita harus hafal Al-Qur\'an?' },
          { id: 'quran-wahyu-12', text: 'Apa itu surah dan ayat?' },
          { id: 'quran-wahyu-13', text: 'Kenapa ada surah yang panjang dan ada yang pendek?' },
          { id: 'quran-wahyu-14', text: 'Apa itu Bismillah dan kenapa kita selalu mulai dengannya?' },
          { id: 'quran-wahyu-15', text: 'Apa itu Al-Fatihah dan kenapa sangat penting?' },
          { id: 'quran-wahyu-16', text: 'Kenapa kita harus wudu sebelum pegang Al-Qur\'an?' },
          { id: 'quran-wahyu-17', text: 'Apa bedanya membaca Qur\'an dengan buku biasa?' },
          { id: 'quran-wahyu-18', text: 'Apakah Allah senang kalau kita baca Qur\'an?' },
          { id: 'quran-wahyu-19', text: 'Kenapa ada orang yang hafal seluruh Al-Qur\'an?' },
          { id: 'quran-wahyu-20', text: 'Apa yang terjadi kalau kita rajin baca Qur\'an?' },
          { id: 'quran-wahyu-21', text: 'Apa itu tajwid dan kenapa cara baca Quran itu penting?' },
          { id: 'quran-wahyu-22', text: 'Kenapa kita membaca Quran dengan pelan dan tartil?' },
        ]
      },
      {
        id: 'malaikat',
        name: 'Malaikat dan Makhluk Gaib',
        questions: [
          { id: 'malaikat-01', text: 'Apa itu malaikat?' },
          { id: 'malaikat-02', text: 'Apakah malaikat bisa dilihat?' },
          { id: 'malaikat-03', text: 'Apa tugas malaikat?' },
          { id: 'malaikat-04', text: 'Berapa jumlah malaikat?' },
          { id: 'malaikat-05', text: 'Siapa malaikat Jibril?' },
          { id: 'malaikat-06', text: 'Siapa malaikat Mikail?' },
          { id: 'malaikat-07', text: 'Siapa malaikat Izrail?' },
          { id: 'malaikat-08', text: 'Siapa malaikat Israfil?' },
          { id: 'malaikat-09', text: 'Apa itu malaikat Raqib dan Atid?' },
          { id: 'malaikat-10', text: 'Apakah ada malaikat yang menjaga kita?' },
          { id: 'malaikat-11', text: 'Apa itu jin?' },
          { id: 'malaikat-12', text: 'Apa bedanya jin dengan setan?' },
          { id: 'malaikat-13', text: 'Kenapa ada setan di dunia ini?' },
          { id: 'malaikat-14', text: 'Bagaimana cara melindungi diri dari gangguan setan?' },
          { id: 'malaikat-15', text: 'Kenapa kita membaca Bismillah untuk menjauhkan setan?' },
        ]
      },
      {
        id: 'nabi-rasul',
        name: 'Nabi dan Rasul',
        questions: [
          { id: 'nabi-rasul-01', text: 'Siapa itu nabi dan rasul?' },
          { id: 'nabi-rasul-02', text: 'Apa bedanya nabi dan rasul?' },
          { id: 'nabi-rasul-03', text: 'Kenapa Allah mengutus nabi dan rasul?' },
          { id: 'nabi-rasul-04', text: 'Siapa nabi pertama?' },
          { id: 'nabi-rasul-05', text: 'Siapa nabi terakhir?' },
          { id: 'nabi-rasul-06', text: 'Kenapa Nabi Muhammad sangat istimewa?' },
          { id: 'nabi-rasul-07', text: 'Bagaimana akhlak Nabi Muhammad?' },
          { id: 'nabi-rasul-08', text: 'Apa itu sunnah Nabi?' },
          { id: 'nabi-rasul-09', text: 'Kenapa kita harus mencintai Nabi Muhammad?' },
          { id: 'nabi-rasul-10', text: 'Apa itu shalawat dan kenapa kita membacanya?' },
          { id: 'nabi-rasul-11', text: 'Siapa itu Nabi Ibrahim?' },
          { id: 'nabi-rasul-12', text: 'Apa yang bisa kita pelajari dari Nabi Ibrahim?' },
          { id: 'nabi-rasul-13', text: 'Siapa itu Nabi Musa?' },
          { id: 'nabi-rasul-14', text: 'Siapa itu Nabi Isa?' },
          { id: 'nabi-rasul-15', text: 'Siapa itu Nabi Yusuf dan apa pelajaran dari kisahnya?' },
          { id: 'nabi-rasul-16', text: 'Siapa itu Nabi Yunus?' },
          { id: 'nabi-rasul-17', text: 'Apa pelajaran dari kisah Nabi Yunus?' },
          { id: 'nabi-rasul-18', text: 'Siapa itu Nabi Ayyub dan apa yang bisa dipelajari?' },
          { id: 'nabi-rasul-19', text: 'Kenapa kisah para nabi diceritakan di Al-Qur\'an?' },
          { id: 'nabi-rasul-20', text: 'Bagaimana cara kita meneladani para nabi?' },
          { id: 'nabi-rasul-21', text: 'Siapa Khadijah dan kenapa beliau istimewa?' },
          { id: 'nabi-rasul-22', text: 'Bagaimana Nabi Muhammad memperlakukan anak-anak?' },
        ]
      },
      {
        id: 'hari-kiamat',
        name: 'Hari Kiamat dan Akhirat',
        questions: [
          { id: 'hari-kiamat-01', text: 'Apa itu hari kiamat?' },
          { id: 'hari-kiamat-02', text: 'Apa yang terjadi setelah kita meninggal?' },
          { id: 'hari-kiamat-03', text: 'Apa itu surga?' },
          { id: 'hari-kiamat-04', text: 'Apa itu neraka?' },
          { id: 'hari-kiamat-05', text: 'Siapa yang masuk surga?' },
          { id: 'hari-kiamat-06', text: 'Apa itu hari perhitungan amal?' },
          { id: 'hari-kiamat-07', text: 'Apa itu buku catatan amal?' },
          { id: 'hari-kiamat-08', text: 'Kenapa setiap perbuatan kita dicatat?' },
          { id: 'hari-kiamat-09', text: 'Apa itu Mizan \u2014 timbangan amal?' },
          { id: 'hari-kiamat-10', text: 'Apa itu Shirath \u2014 jembatan menuju surga?' },
          { id: 'hari-kiamat-11', text: 'Kenapa kita harus berbuat baik sejak kecil?' },
          { id: 'hari-kiamat-12', text: 'Apakah anak kecil juga dihisab?' },
          { id: 'hari-kiamat-13', text: 'Kenapa kehidupan di akhirat lebih penting dari dunia?' },
          { id: 'hari-kiamat-14', text: 'Apa itu alam barzakh?' },
          { id: 'hari-kiamat-15', text: 'Kenapa kita tidak takut mati kalau kita beriman?' },
          { id: 'hari-kiamat-16', text: 'Apa itu doa untuk orang yang sudah meninggal dan kenapa penting?' },
        ]
      },
    ]
  },
  {
    id: 'ibadah',
    emoji: '\u{1F54C}',
    label: 'Ibadah',
    subcategories: [
      {
        id: 'sholat',
        name: 'Sholat',
        questions: [
          { id: 'sholat-01', text: 'Apa itu sholat?' },
          { id: 'sholat-02', text: 'Kenapa kita harus sholat?' },
          { id: 'sholat-03', text: 'Kenapa sholat harus 5 kali sehari?' },
          { id: 'sholat-04', text: 'Kenapa sholat harus menghadap kiblat?' },
          { id: 'sholat-05', text: 'Apa itu kiblat?' },
          { id: 'sholat-06', text: 'Kenapa kita harus wudu sebelum sholat?' },
          { id: 'sholat-07', text: 'Apa itu wudu?' },
          { id: 'sholat-08', text: 'Kenapa kita pakai mukena atau sarung saat sholat?' },
          { id: 'sholat-09', text: 'Apa yang kita katakan saat sholat?' },
          { id: 'sholat-10', text: 'Kenapa gerakan sholat seperti itu \u2014 berdiri, rukuk, sujud?' },
          { id: 'sholat-11', text: 'Apa artinya sujud?' },
          { id: 'sholat-12', text: 'Kenapa sholat subuh dilakukan waktu masih gelap?' },
          { id: 'sholat-13', text: 'Apakah Allah mendengar sholat kita?' },
          { id: 'sholat-14', text: 'Apa yang terjadi kalau kita tidak sholat?' },
          { id: 'sholat-15', text: 'Kenapa sholat berjamaah lebih baik?' },
          { id: 'sholat-16', text: 'Apa itu sholat Jumat?' },
          { id: 'sholat-17', text: 'Kenapa laki-laki wajib sholat Jumat?' },
          { id: 'sholat-18', text: 'Apa itu adzan dan kenapa ada adzan?' },
          { id: 'sholat-19', text: 'Kenapa kita diam dan dengarkan adzan?' },
          { id: 'sholat-20', text: 'Apa itu iqamah?' },
          { id: 'sholat-21', text: 'Bagaimana sholat bisa membuat hati tenang?' },
          { id: 'sholat-22', text: 'Kenapa sholat disebut tiang agama?' },
          { id: 'sholat-23', text: 'Apa itu sholat sunnah?' },
          { id: 'sholat-24', text: 'Kenapa kita sholat meski sedang lelah?' },
          { id: 'sholat-25', text: 'Bagaimana sholat menghubungkan kita dengan Allah?' },
          { id: 'sholat-26', text: 'Apa itu tayamum dan kapan boleh digunakan?' },
          { id: 'sholat-27', text: 'Kenapa kita harus menjaga kebersihan dalam Islam?' },
          { id: 'sholat-28', text: 'Apa itu masjid dan kenapa kita pergi ke sana?' },
        ]
      },
      {
        id: 'puasa-ramadan',
        name: 'Puasa dan Ramadan',
        questions: [
          { id: 'puasa-ramadan-01', text: 'Apa itu puasa?' },
          { id: 'puasa-ramadan-02', text: 'Kenapa kita berpuasa di bulan Ramadan?' },
          { id: 'puasa-ramadan-03', text: 'Apa itu bulan Ramadan?' },
          { id: 'puasa-ramadan-04', text: 'Kenapa Ramadan istimewa?' },
          { id: 'puasa-ramadan-05', text: 'Kenapa tidak boleh makan dan minum saat puasa?' },
          { id: 'puasa-ramadan-06', text: 'Apa manfaat puasa untuk tubuh kita?' },
          { id: 'puasa-ramadan-07', text: 'Apa manfaat puasa untuk hati kita?' },
          { id: 'puasa-ramadan-08', text: 'Apa itu sahur dan kenapa penting?' },
          { id: 'puasa-ramadan-09', text: 'Apa itu buka puasa?' },
          { id: 'puasa-ramadan-10', text: 'Kenapa kita makan kurma saat buka puasa?' },
          { id: 'puasa-ramadan-11', text: 'Apa itu tarawih?' },
          { id: 'puasa-ramadan-12', text: 'Apa itu Lailatul Qadar?' },
          { id: 'puasa-ramadan-13', text: 'Kenapa Lailatul Qadar sangat istimewa?' },
          { id: 'puasa-ramadan-14', text: 'Apa itu Idul Fitri?' },
          { id: 'puasa-ramadan-15', text: 'Kenapa kita pakai baju baru saat Lebaran?' },
          { id: 'puasa-ramadan-16', text: 'Apa itu zakat fitrah?' },
          { id: 'puasa-ramadan-17', text: 'Kenapa kita bayar zakat fitrah sebelum Lebaran?' },
          { id: 'puasa-ramadan-18', text: 'Apa itu mudik dan kenapa banyak orang pulang kampung saat Lebaran?' },
          { id: 'puasa-ramadan-19', text: 'Kenapa anak kecil belum wajib puasa penuh?' },
          { id: 'puasa-ramadan-20', text: 'Bagaimana puasa mengajarkan kita tentang orang yang kelaparan?' },
        ]
      },
      {
        id: 'doa',
        name: 'Doa',
        questions: [
          { id: 'doa-01', text: 'Apa itu doa?' },
          { id: 'doa-02', text: 'Apakah Allah selalu mengabulkan doa kita?' },
          { id: 'doa-03', text: 'Kenapa kadang doa kita tidak langsung terkabul?' },
          { id: 'doa-04', text: 'Kapan waktu terbaik untuk berdoa?' },
          { id: 'doa-05', text: 'Apakah doa harus pakai bahasa Arab?' },
          { id: 'doa-06', text: 'Kenapa kita mengangkat tangan saat berdoa?' },
          { id: 'doa-07', text: 'Apa itu doa sehari-hari yang penting dihafalkan?' },
          { id: 'doa-08', text: 'Kenapa kita berdoa sebelum makan?' },
          { id: 'doa-09', text: 'Kenapa kita berdoa sebelum tidur?' },
          { id: 'doa-10', text: 'Kenapa kita berdoa sebelum bepergian?' },
          { id: 'doa-11', text: 'Apakah doa anak kecil didengar Allah?' },
          { id: 'doa-12', text: 'Kenapa kita harus berdoa dengan sungguh-sungguh?' },
          { id: 'doa-13', text: 'Apa bedanya doa dan sholat?' },
          { id: 'doa-14', text: 'Kenapa kita harus berdoa untuk orang tua kita?' },
          { id: 'doa-15', text: 'Apa itu doa yang mustajab?' },
          { id: 'doa-16', text: 'Kenapa kita mengucap Amin setelah berdoa?' },
          { id: 'doa-17', text: 'Apakah Allah senang ketika anak-anak berdoa?' },
        ]
      },
      {
        id: 'zakat-sedekah',
        name: 'Zakat dan Sedekah',
        questions: [
          { id: 'zakat-sedekah-01', text: 'Apa itu zakat?' },
          { id: 'zakat-sedekah-02', text: 'Kenapa kita harus bayar zakat?' },
          { id: 'zakat-sedekah-03', text: 'Apa bedanya zakat dan sedekah?' },
          { id: 'zakat-sedekah-04', text: 'Kenapa berbagi itu penting dalam Islam?' },
          { id: 'zakat-sedekah-05', text: 'Apa yang terjadi kalau kita sering bersedekah?' },
          { id: 'zakat-sedekah-06', text: 'Apakah sedekah bisa mengurangi uang kita?' },
          { id: 'zakat-sedekah-07', text: 'Apa itu infak?' },
          { id: 'zakat-sedekah-08', text: 'Kepada siapa kita sebaiknya bersedekah?' },
          { id: 'zakat-sedekah-09', text: 'Apakah senyum itu termasuk sedekah?' },
          { id: 'zakat-sedekah-10', text: 'Apa itu wakaf?' },
          { id: 'zakat-sedekah-11', text: 'Kenapa orang kaya harus bantu orang miskin dalam Islam?' },
          { id: 'zakat-sedekah-12', text: 'Apakah anak kecil bisa bersedekah?' },
          { id: 'zakat-sedekah-13', text: 'Apa itu sedekah jariyah?' },
          { id: 'zakat-sedekah-14', text: 'Kenapa rezeki yang dibagi tidak akan habis?' },
        ]
      },
      {
        id: 'haji-umrah',
        name: 'Haji dan Umrah',
        questions: [
          { id: 'haji-umrah-01', text: 'Apa itu haji?' },
          { id: 'haji-umrah-02', text: 'Kenapa orang pergi ke Mekkah?' },
          { id: 'haji-umrah-03', text: 'Apa itu Ka\'bah?' },
          { id: 'haji-umrah-04', text: 'Kenapa Ka\'bah sangat istimewa?' },
          { id: 'haji-umrah-05', text: 'Apa itu umrah dan bedanya dengan haji?' },
          { id: 'haji-umrah-06', text: 'Kenapa haji dilakukan sekali seumur hidup?' },
          { id: 'haji-umrah-07', text: 'Apa itu Masjidil Haram?' },
          { id: 'haji-umrah-08', text: 'Kenapa banyak orang menangis saat haji?' },
          { id: 'haji-umrah-09', text: 'Apa itu Madinah dan kenapa istimewa?' },
          { id: 'haji-umrah-10', text: 'Apa itu Masjid Nabawi?' },
        ]
      },
    ]
  },
  {
    id: 'akhlak',
    emoji: '\u{1F48E}',
    label: 'Akhlak',
    subcategories: [
      {
        id: 'kejujuran',
        name: 'Kejujuran dan Amanah',
        questions: [
          { id: 'kejujuran-01', text: 'Kenapa harus jujur?' },
          { id: 'kejujuran-02', text: 'Apa yang terjadi kalau kita berbohong?' },
          { id: 'kejujuran-03', text: 'Apa itu amanah?' },
          { id: 'kejujuran-04', text: 'Kenapa kita harus menepati janji?' },
          { id: 'kejujuran-05', text: 'Apa yang terjadi kalau kita sering ingkar janji?' },
          { id: 'kejujuran-06', text: 'Kenapa kita harus jujur meski tidak ada yang lihat?' },
          { id: 'kejujuran-07', text: 'Apa itu munafik?' },
          { id: 'kejujuran-08', text: 'Kenapa sifat munafik sangat berbahaya?' },
          { id: 'kejujuran-09', text: 'Bagaimana cara melatih diri untuk selalu jujur?' },
          { id: 'kejujuran-10', text: 'Apa itu integritas dalam Islam?' },
          { id: 'kejujuran-11', text: 'Kenapa pedagang yang jujur dicintai Allah?' },
          { id: 'kejujuran-12', text: 'Apa bedanya jujur dan kasar?' },
          { id: 'kejujuran-13', text: 'Bolehkah berbohong untuk kebaikan?' },
          { id: 'kejujuran-14', text: 'Bagaimana Islam mengajarkan kita untuk berkata benar meski sulit?' },
        ]
      },
      {
        id: 'sabar-syukur',
        name: 'Sabar dan Syukur',
        questions: [
          { id: 'sabar-syukur-01', text: 'Apa itu sabar?' },
          { id: 'sabar-syukur-02', text: 'Bagaimana cara bersabar saat marah?' },
          { id: 'sabar-syukur-03', text: 'Apa yang Allah janjikan untuk orang yang sabar?' },
          { id: 'sabar-syukur-04', text: 'Apa bedanya sabar dan pasrah?' },
          { id: 'sabar-syukur-05', text: 'Bagaimana cara melatih kesabaran?' },
          { id: 'sabar-syukur-06', text: 'Apa itu syukur?' },
          { id: 'sabar-syukur-07', text: 'Kenapa kita harus bersyukur?' },
          { id: 'sabar-syukur-08', text: 'Bagaimana cara bersyukur dalam kehidupan sehari-hari?' },
          { id: 'sabar-syukur-09', text: 'Apa yang terjadi kalau kita sering bersyukur?' },
          { id: 'sabar-syukur-10', text: 'Kenapa orang yang bersyukur hidupnya lebih bahagia?' },
          { id: 'sabar-syukur-11', text: 'Apa itu qanaah \u2014 merasa cukup?' },
          { id: 'sabar-syukur-12', text: 'Bagaimana cara bersyukur saat keadaan sulit?' },
          { id: 'sabar-syukur-13', text: 'Apa hubungan antara sabar dan syukur?' },
        ]
      },
      {
        id: 'rendah-hati-ikhlas',
        name: 'Rendah Hati dan Ikhlas',
        questions: [
          { id: 'rendah-hati-ikhlas-01', text: 'Apa itu sombong dan kenapa tidak boleh?' },
          { id: 'rendah-hati-ikhlas-02', text: 'Apa itu tawadhu \u2014 rendah hati?' },
          { id: 'rendah-hati-ikhlas-03', text: 'Bagaimana cara menjadi rendah hati?' },
          { id: 'rendah-hati-ikhlas-04', text: 'Apa itu ikhlas?' },
          { id: 'rendah-hati-ikhlas-05', text: 'Kenapa ikhlas itu penting?' },
          { id: 'rendah-hati-ikhlas-06', text: 'Bagaimana cara berbuat baik dengan ikhlas?' },
          { id: 'rendah-hati-ikhlas-07', text: 'Apa itu riya \u2014 pamer kebaikan?' },
          { id: 'rendah-hati-ikhlas-08', text: 'Kenapa riya merusak pahala?' },
          { id: 'rendah-hati-ikhlas-09', text: 'Bagaimana cara menghindari sifat riya?' },
          { id: 'rendah-hati-ikhlas-10', text: 'Apa itu hasad \u2014 iri hati?' },
          { id: 'rendah-hati-ikhlas-11', text: 'Kenapa iri hati itu merusak diri sendiri?' },
          { id: 'rendah-hati-ikhlas-12', text: 'Bagaimana cara mengubah iri hati menjadi motivasi?' },
          { id: 'rendah-hati-ikhlas-13', text: 'Apa itu tawakkal \u2014 berserah kepada Allah?' },
          { id: 'rendah-hati-ikhlas-14', text: 'Bagaimana cara hidup dengan tawakkal?' },
        ]
      },
      {
        id: 'tanggung-jawab',
        name: 'Tanggung Jawab dan Usaha',
        questions: [
          { id: 'tanggung-jawab-01', text: 'Kenapa kita harus rajin dan tidak malas?' },
          { id: 'tanggung-jawab-02', text: 'Apa kata Islam tentang bekerja keras?' },
          { id: 'tanggung-jawab-03', text: 'Apa itu rezeki dan dari mana asalnya?' },
          { id: 'tanggung-jawab-04', text: 'Kenapa kita harus berusaha dulu sebelum berdoa?' },
          { id: 'tanggung-jawab-05', text: 'Apa itu ikhtiar?' },
          { id: 'tanggung-jawab-06', text: 'Bagaimana hubungan antara usaha dan doa?' },
          { id: 'tanggung-jawab-07', text: 'Kenapa kita harus bertanggung jawab atas perbuatan kita?' },
          { id: 'tanggung-jawab-08', text: 'Apa itu amal saleh?' },
          { id: 'tanggung-jawab-09', text: 'Kenapa niat itu penting sebelum melakukan sesuatu?' },
          { id: 'tanggung-jawab-10', text: 'Bagaimana cara menjaga niat tetap baik?' },
          { id: 'tanggung-jawab-11', text: 'Kenapa kita harus menyelesaikan apa yang sudah dimulai?' },
          { id: 'tanggung-jawab-12', text: 'Apa itu istiqamah \u2014 konsisten dalam kebaikan?' },
          { id: 'tanggung-jawab-13', text: 'Bagaimana cara membangun kebiasaan baik?' },
          { id: 'tanggung-jawab-14', text: 'Kenapa disiplin itu bagian dari ibadah?' },
        ]
      },
    ]
  },
  {
    id: 'kehidupan-takdir',
    emoji: '\u{1F33F}',
    label: 'Kehidupan & Takdir',
    subcategories: [
      {
        id: 'ujian-cobaan',
        name: 'Kehidupan, Ujian, dan Takdir',
        questions: [
          { id: 'ujian-cobaan-01', text: 'Kenapa ada orang yang sakit?' },
          { id: 'ujian-cobaan-02', text: 'Apa itu cobaan dan kenapa Allah memberikan cobaan?' },
          { id: 'ujian-cobaan-03', text: 'Kenapa hidup tidak selalu berjalan sesuai keinginan kita?' },
          { id: 'ujian-cobaan-04', text: 'Apa itu takdir?' },
          { id: 'ujian-cobaan-05', text: 'Apa bedanya takdir dan usaha kita sendiri?' },
          { id: 'ujian-cobaan-06', text: 'Kenapa ada orang yang hidupnya susah dan ada yang mudah?' },
          { id: 'ujian-cobaan-07', text: 'Apa yang harus kita lakukan saat menghadapi kesulitan?' },
          { id: 'ujian-cobaan-08', text: 'Bagaimana Islam mengajarkan kita untuk bangkit setelah gagal?' },
          { id: 'ujian-cobaan-09', text: 'Kenapa kita tidak boleh putus asa?' },
          { id: 'ujian-cobaan-10', text: 'Bagaimana cara menghibur diri saat sedih menurut Islam?' },
          { id: 'ujian-cobaan-11', text: 'Apa yang dimaksud dengan hidup di dunia hanya sementara?' },
          { id: 'ujian-cobaan-12', text: 'Kenapa kita tidak boleh terlalu cinta dunia?' },
          { id: 'ujian-cobaan-13', text: 'Apa itu zuhud \u2014 tidak tamak terhadap dunia?' },
          { id: 'ujian-cobaan-14', text: 'Bagaimana cara mensyukuri hidup saat keadaan sulit?' },
          { id: 'ujian-cobaan-15', text: 'Kenapa kematian itu pasti dan bagaimana kita menyikapinya?' },
          { id: 'ujian-cobaan-16', text: 'Apa yang bisa kita siapkan untuk kehidupan setelah mati?' },
          { id: 'ujian-cobaan-17', text: 'Bagaimana cara hidup yang bermakna menurut Islam?' },
        ]
      },
      {
        id: 'emosi-perasaan',
        name: 'Emosi dan Perasaan',
        questions: [
          { id: 'emosi-perasaan-01', text: 'Apa yang harus dilakukan saat merasa sedih?' },
          { id: 'emosi-perasaan-02', text: 'Kenapa kita kadang merasa marah?' },
          { id: 'emosi-perasaan-03', text: 'Bagaimana cara menenangkan hati saat marah?' },
          { id: 'emosi-perasaan-04', text: 'Kenapa kita kadang merasa iri kepada orang lain?' },
          { id: 'emosi-perasaan-05', text: 'Kenapa kita harus memaafkan orang yang menyakiti kita?' },
          { id: 'emosi-perasaan-06', text: 'Bagaimana cara memaafkan kalau masih merasa sakit hati?' },
          { id: 'emosi-perasaan-07', text: 'Apa yang harus dilakukan saat merasa takut?' },
          { id: 'emosi-perasaan-08', text: 'Bagaimana cara merasa lebih tenang saat khawatir?' },
          { id: 'emosi-perasaan-09', text: 'Kenapa kita kadang merasa kecewa?' },
          { id: 'emosi-perasaan-10', text: 'Bagaimana cara bangkit setelah gagal?' },
          { id: 'emosi-perasaan-11', text: 'Kenapa kita harus tetap berharap kepada Allah saat susah?' },
          { id: 'emosi-perasaan-12', text: 'Apa yang harus kita lakukan saat merasa sendirian?' },
          { id: 'emosi-perasaan-13', text: 'Bagaimana cara menjaga hati tetap baik?' },
          { id: 'emosi-perasaan-14', text: 'Kenapa hati kita bisa merasa damai saat mengingat Allah?' },
          { id: 'emosi-perasaan-15', text: 'Apa yang harus dilakukan saat merasa bersalah?' },
          { id: 'emosi-perasaan-16', text: 'Kenapa kita kadang merasa malu dan apa yang harus dilakukan?' },
          { id: 'emosi-perasaan-17', text: 'Bagaimana cara menghadapi rasa takut sendirian di malam hari?' },
        ]
      },
    ]
  },
  {
    id: 'keluarga-sosial',
    emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
    label: 'Keluarga & Sosial',
    subcategories: [
      {
        id: 'keluarga-hubungan',
        name: 'Keluarga dan Hubungan',
        questions: [
          { id: 'keluarga-hubungan-01', text: 'Kenapa kita harus sayang dan hormat kepada orang tua?' },
          { id: 'keluarga-hubungan-02', text: 'Apa itu birrul walidain \u2014 berbakti kepada orang tua?' },
          { id: 'keluarga-hubungan-03', text: 'Kenapa kita tidak boleh membantah orang tua dengan kasar?' },
          { id: 'keluarga-hubungan-04', text: 'Apa yang bisa kita lakukan untuk membahagiakan orang tua?' },
          { id: 'keluarga-hubungan-05', text: 'Kenapa mendoakan orang tua itu penting?' },
          { id: 'keluarga-hubungan-06', text: 'Apa yang terjadi setelah orang tua meninggal \u2014 bagaimana kita masih bisa berbakti?' },
          { id: 'keluarga-hubungan-07', text: 'Kenapa kita harus sayang kepada adik dan kakak?' },
          { id: 'keluarga-hubungan-08', text: 'Bagaimana cara bersikap baik kepada saudara?' },
          { id: 'keluarga-hubungan-09', text: 'Apa itu silaturahmi?' },
          { id: 'keluarga-hubungan-10', text: 'Kenapa silaturahmi bisa memanjangkan umur dan meluaskan rezeki?' },
          { id: 'keluarga-hubungan-11', text: 'Bagaimana cara menjaga hubungan baik dengan keluarga besar?' },
          { id: 'keluarga-hubungan-12', text: 'Kenapa kita harus baik kepada tetangga?' },
          { id: 'keluarga-hubungan-13', text: 'Apa yang harus dilakukan kalau bertengkar dengan teman?' },
          { id: 'keluarga-hubungan-14', text: 'Apa itu ukhuwah \u2014 persaudaraan dalam Islam?' },
          { id: 'keluarga-hubungan-15', text: 'Bagaimana cara memilih teman yang baik?' },
          { id: 'keluarga-hubungan-16', text: 'Kenapa bergaul dengan orang baik itu penting?' },
          { id: 'keluarga-hubungan-17', text: 'Apa yang dimaksud dengan tolong-menolong dalam Islam?' },
        ]
      },
      {
        id: 'situasi-sosial-anak',
        name: 'Situasi Sosial Anak',
        questions: [
          { id: 'situasi-sosial-anak-01', text: 'Kenapa kita tidak boleh mengejek orang lain?' },
          { id: 'situasi-sosial-anak-02', text: 'Apa yang harus dilakukan kalau teman mengejek kita?' },
          { id: 'situasi-sosial-anak-03', text: 'Kenapa kita harus berbagi dengan teman?' },
          { id: 'situasi-sosial-anak-04', text: 'Apa yang harus dilakukan kalau teman berbohong kepada kita?' },
          { id: 'situasi-sosial-anak-05', text: 'Bagaimana cara meminta maaf dengan benar?' },
          { id: 'situasi-sosial-anak-06', text: 'Kenapa kita harus memaafkan teman yang berbuat salah?' },
          { id: 'situasi-sosial-anak-07', text: 'Apa yang harus dilakukan kalau kita bertengkar dengan teman?' },
          { id: 'situasi-sosial-anak-08', text: 'Kenapa kita harus berkata baik kepada orang lain?' },
          { id: 'situasi-sosial-anak-09', text: 'Bagaimana cara menjadi teman yang baik?' },
          { id: 'situasi-sosial-anak-10', text: 'Kenapa kita tidak boleh menyakiti perasaan orang lain?' },
          { id: 'situasi-sosial-anak-11', text: 'Apa yang harus dilakukan kalau melihat orang lain diperlakukan tidak baik?' },
          { id: 'situasi-sosial-anak-12', text: 'Kenapa kita harus membantu teman yang kesulitan?' },
          { id: 'situasi-sosial-anak-13', text: 'Bagaimana cara menyelesaikan masalah tanpa bertengkar?' },
          { id: 'situasi-sosial-anak-14', text: 'Kenapa kita harus menghargai perbedaan?' },
          { id: 'situasi-sosial-anak-15', text: 'Bagaimana cara berteman dengan orang yang berbeda dari kita?' },
          { id: 'situasi-sosial-anak-16', text: 'Apa yang harus dilakukan kalau melihat teman di-bully?' },
          { id: 'situasi-sosial-anak-17', text: 'Kenapa kita tidak boleh pelit kepada teman?' },
        ]
      },
    ]
  },
  {
    id: 'alam-rasa-ingin-tahu',
    emoji: '\u{1F30D}',
    label: 'Alam & Rasa Ingin Tahu',
    subcategories: [
      {
        id: 'alam-ciptaan',
        name: 'Alam dan Ciptaan Allah',
        questions: [
          { id: 'alam-ciptaan-01', text: 'Siapa yang menciptakan langit, bumi, dan semua isinya?' },
          { id: 'alam-ciptaan-02', text: 'Kenapa ada siang dan malam?' },
          { id: 'alam-ciptaan-03', text: 'Kenapa ada musim hujan dan musim kemarau?' },
          { id: 'alam-ciptaan-04', text: 'Kenapa kita harus menjaga alam dan lingkungan?' },
          { id: 'alam-ciptaan-05', text: 'Kenapa manusia diciptakan berbeda-beda suku dan bangsa?' },
          { id: 'alam-ciptaan-06', text: 'Kenapa kita tidak boleh menyakiti hewan tanpa alasan?' },
          { id: 'alam-ciptaan-07', text: 'Bagaimana kita bisa melihat kebesaran Allah melalui alam?' },
        ]
      },
      {
        id: 'rasa-ingin-tahu',
        name: 'Pertanyaan Rasa Ingin Tahu Anak',
        questions: [
          { id: 'rasa-ingin-tahu-01', text: 'Apakah hewan juga beribadah kepada Allah?' },
          { id: 'rasa-ingin-tahu-02', text: 'Kenapa ada orang yang kaya dan ada yang miskin?' },
          { id: 'rasa-ingin-tahu-03', text: 'Kenapa kita harus belajar ilmu?' },
          { id: 'rasa-ingin-tahu-04', text: 'Kenapa manusia harus bekerja untuk mendapatkan rezeki?' },
          { id: 'rasa-ingin-tahu-05', text: 'Kenapa ada orang yang baik dan ada yang jahat?' },
          { id: 'rasa-ingin-tahu-06', text: 'Kenapa Allah menciptakan begitu banyak jenis makhluk?' },
          { id: 'rasa-ingin-tahu-07', text: 'Bagaimana alam menunjukkan kebesaran Allah?' },
        ]
      },
    ]
  },
];

const AJARKAN_POPULAR = [
  { questionId: 'siapa-allah-01', text: 'Siapa itu Allah?' },
  { questionId: 'sholat-02', text: 'Kenapa kita harus sholat?' },
  { questionId: 'puasa-ramadan-02', text: 'Kenapa kita berpuasa di bulan Ramadan?' },
  { questionId: 'kejujuran-01', text: 'Kenapa harus jujur?' },
  { questionId: 'emosi-perasaan-07', text: 'Apa yang harus dilakukan saat merasa takut?' },
  { questionId: 'keluarga-hubungan-01', text: 'Kenapa kita harus sayang dan hormat kepada orang tua?' },
  { questionId: 'alam-ciptaan-01', text: 'Siapa yang menciptakan langit, bumi, dan semua isinya?' },
];


const JELAJAHI_BATCH_SIZE = 15;
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

// ── Share Sheet ────────────────────────────────────────────────────────────────

// Theme config for share image backgrounds (used by html2canvas)
const SHARE_THEME_BG = { light: '#FFFFFF', dark: '#1A1D2E', classic: '#F5EFE0' };

// Build the off-screen share image HTML element
function buildShareElement(verse, options) {
  const { theme, width, height, includeQuestion, compact } = options;
  const el = document.createElement('div');
  el.className = `si-wrap si-theme-${theme}`;
  el.style.width  = width + 'px';
  el.style.height = height + 'px';
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  if (compact) el.style.padding = '6% 12%';

  // Build content — branding header at top, then verse content centered
  let html = '';

  // Branding header (top) — smaller in compact/square mode
  html += `
    <div class="si-header" style="${compact ? 'margin-bottom:16px;' : ''}">
      <span class="si-header-brand" style="${compact ? 'font-size:18px;' : ''}">TemuQuran.com</span>
      <span class="si-header-sub" style="${compact ? 'font-size:10px;' : ''}">Temukan Jawaban Dalam Al-Qur'an</span>
      <div class="si-header-divider" style="${compact ? 'margin-top:10px;' : ''}"></div>
    </div>
  `;

  // Optional user feeling/question — truncate in compact mode
  if (includeQuestion && verse._userQuestion) {
    let qText = verse._userQuestion;
    if (compact && qText.length > 60) qText = qText.slice(0, 60) + '...';
    const qStyle = compact ? 'font-size:13px;margin-bottom:14px;' : '';
    html += `<p class="si-question" style="${qStyle}">"${escapeHtml(qText)}"</p>`;
  }

  // Arabic text — smaller in compact mode
  const arabicStyle = compact ? 'font-size:24px;line-height:1.9;margin-bottom:14px;' : '';
  html += `<p class="si-arabic" style="${arabicStyle}">${escapeHtml(verse.arabic)}</p>`;

  // Translation — smaller in compact mode
  const transStyle = compact ? 'font-size:12px;line-height:1.7;margin-bottom:10px;' : '';
  html += `<p class="si-translation" style="${transStyle}">"${escapeHtml(verse.translation)}"</p>`;

  // Surah reference
  const refStyle = compact ? 'font-size:10px;padding:4px 12px;' : '';
  html += `<span class="si-ref" style="${refStyle}">${escapeHtml(verse.ref)}</span>`;

  el.innerHTML = html;
  return el;
}

// Get dimensions for a platform
function getShareDimensions(platform) {
  if (platform === 'ig_story' || platform === 'wa_status') {
    return { width: 1080, height: 1920 }; // 9:16
  }
  return { width: 1080, height: 1080 }; // 1:1
}

// Generate the share image blob
async function generateShareImage(verse, platform) {
  await loadHtml2Canvas();

  const dims    = getShareDimensions(platform);
  const isSquare = dims.width === dims.height;
  const el = buildShareElement(verse, {
    theme:           shareTheme,
    width:           dims.width / 2, // render at half-size, html2canvas scale: 2 → full res
    height:          dims.height / 2,
    includeQuestion: shareIncludeQuestion,
    compact:         isSquare,
  });

  const container = document.getElementById('share-render');
  container.appendChild(el);

  // Ensure fonts loaded
  await document.fonts.load('400 34px Amiri');
  await document.fonts.ready;

  const canvas = await html2canvas(el, {
    scale:           2,
    useCORS:         true,
    backgroundColor: SHARE_THEME_BG[shareTheme],
    logging:         false,
  });

  container.removeChild(el);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}

// Open the share bottom sheet
function openShareSheet(verse) {
  shareActiveVerse = verse;

  // Attach user question from current feeling text (for curhat/panduan modes)
  if (currentMode !== 'jelajahi' && currentFeeling) {
    verse._userQuestion = currentFeeling;
  }

  logEvent('share_sheet_opened', { mode: currentMode, card_index: currentCardIndex });

  const overlay = document.getElementById('share-overlay');
  const sheet   = document.getElementById('share-sheet');

  // Show/hide question toggle based on mode
  const qToggle = document.getElementById('share-toggle-question');
  if (currentMode === 'jelajahi' || currentMode === 'ajarkan' || !currentFeeling) {
    qToggle.style.display = 'none';
  } else {
    qToggle.style.display = '';
  }

  // Reset toggles
  document.getElementById('share-include-question').checked = false;
  shareIncludeQuestion = false;

  // Reset theme to light
  shareTheme = 'light';
  document.querySelectorAll('.theme-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.theme === 'light');
  });

  // Reset preview aspect ratio
  const preview = document.getElementById('share-preview');
  preview.classList.remove('ratio-story');

  // Show sheet
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    sheet.classList.add('visible');
  });

  // Render initial preview
  updateSharePreview();
}

// Close the share bottom sheet
function closeShareSheet() {
  const overlay = document.getElementById('share-overlay');
  const sheet   = document.getElementById('share-sheet');

  sheet.style.transition = '';
  sheet.style.transform = '';
  overlay.classList.remove('visible');
  sheet.classList.remove('visible');

  setTimeout(() => {
    overlay.classList.add('hidden');
    sheet.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    sheet.setAttribute('aria-hidden', 'true');
  }, 300);

  shareActiveVerse = null;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAFSIR SUMMARY OVERLAY — Full-Screen Study Mode
// ══════════════════════════════════════════════════════════════════════════════

const TAFSIR_CARD_LABELS = {
  makna_utama:        'Makna Utama',
  hidup_kita:         'Makna Untuk Hidup Kita',
  konteks_turun:      'Kenapa Ayat Ini Turun',
  penjelasan_penting: 'Penjelasan Penting',
};

const TAFSIR_SOURCE_NAMES = {
  kemenag:        'Tafsir Kemenag',
  ibnu_kathir:    'Ibnu Katsir',
  quraish_shihab: 'Quraish Shihab',
  asbabun_nuzul:  'Asbabun Nuzul',
};

function formatTafsirSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const names = sources.map(s => TAFSIR_SOURCE_NAMES[s] || s);
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

let _tafsirOverlayVerse    = null; // verse currently shown in overlay
let _tafsirLastCardViewed  = 0;    // 0-based index of last card swiped to

function openTafsirOverlay(verse) {
  const overlay  = document.getElementById('tafsir-overlay');
  const summary  = verse.tafsir_summary;
  if (!overlay || !summary || !summary.makna_utama) return;

  _tafsirOverlayVerse   = verse;
  _tafsirLastCardViewed = 0;

  // ── Determine which cards exist ──────────────────────────────────────────
  const cardKeys = ['makna_utama', 'hidup_kita', 'konteks_turun', 'penjelasan_penting'];
  const cards = cardKeys.filter(k => summary[k] && summary[k].text);
  const totalCards = cards.length;

  // ── Build carousel slides ────────────────────────────────────────────────
  const slidesHtml = cards.map(key => {
    const card = summary[key];
    const sources = formatTafsirSources(card.sources);
    return `
      <div class="to-slide">
        <div class="to-card">
          <div class="to-label-wrap">
            <span class="to-label-line"></span>
            <span class="to-label">${TAFSIR_CARD_LABELS[key]}</span>
            <span class="to-label-line"></span>
          </div>
          <div class="to-text">${escapeHtml(card.text)}</div>
          <div class="to-source">Ringkasan berdasarkan: ${escapeHtml(sources)}</div>
        </div>
      </div>`;
  }).join('');

  // ── Build dots ───────────────────────────────────────────────────────────
  const dotsHtml = cards.map((_, i) =>
    `<div class="to-dot${i === 0 ? ' active' : ''}"></div>`
  ).join('');

  // ── Build full tafsir tabs ───────────────────────────────────────────────
  const fullTafsirSources = [];
  if (verse.tafsir_kemenag)        fullTafsirSources.push({ id: 'kemenag', label: 'Kemenag',        text: verse.tafsir_kemenag, isMarkdown: false });
  const ikText = verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir;
  if (ikText)                      fullTafsirSources.push({ id: 'ik',      label: 'Ibnu Katsir',    text: ikText, isMarkdown: true });
  const asbabFullText = verse.asbabun_nuzul_id || verse.asbabun_nuzul;
  if (asbabFullText)               fullTafsirSources.push({ id: 'asbab',   label: 'Asbabun Nuzul',  text: asbabFullText, isMarkdown: true });

  const fullTabsHtml = fullTafsirSources.length > 0 ? `
    <div class="to-full-section">
      <button class="to-full-btn" id="to-full-btn">
        Baca tafsir lengkap
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="to-full-content" id="to-full-content">
        ${fullTafsirSources.map((s, i) => `
          <div class="tfl-item">
            <button class="tfl-toggle" data-tfl-id="${s.id}">
              <span>${s.label}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="tfl-answer">
              <div class="tfl-body vc-tafsir-md">
                ${s.isMarkdown ? renderMarkdown(s.text) : '<p>' + escapeHtml(s.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // ── Verse reference ──────────────────────────────────────────────────────
  const verseRef = `${verse.surah_name}: ${verse.verse_number}`;

  // ── Assemble overlay HTML ────────────────────────────────────────────────
  overlay.innerHTML = `
    <div class="to-header">
      <button class="to-back" id="to-back-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        Kembali
      </button>
      <span class="to-counter" id="to-counter">1 / ${totalCards}</span>
    </div>
    <div class="to-ref" id="to-ref">
      <button class="to-ref-toggle" id="to-ref-toggle">
        <span class="to-ref-text">${escapeHtml(verseRef)}</span>
        <svg class="to-ref-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="to-ref-expand" id="to-ref-expand">
        <div class="to-ref-card">
          <div class="to-ref-arabic-wrap">
            <p class="to-ref-arabic">${escapeHtml(verse.arabic)}</p>
          </div>
          <p class="to-ref-translation">"${escapeHtml(verse.translation)}"</p>
        </div>
      </div>
      <div class="to-ref-divider"></div>
    </div>
    <div class="to-carousel" id="to-carousel">${slidesHtml}</div>
    <div class="to-dots-section">
      <div class="to-dots" id="to-dots">${dotsHtml}</div>
      <div class="to-hint" id="to-hint">
        <span>Geser untuk lanjut</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>
    ${fullTabsHtml}
  `;

  // ── Show overlay ─────────────────────────────────────────────────────────
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('tafsir-locked');
  history.pushState({ tafsirOverlay: true }, '');

  // ── Carousel scroll → update dots + counter ──────────────────────────────
  const carousel = document.getElementById('to-carousel');
  const dots     = document.getElementById('to-dots');
  const counter  = document.getElementById('to-counter');
  const hint     = document.getElementById('to-hint');
  let scrollTimer;

  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
      _tafsirLastCardViewed = Math.max(_tafsirLastCardViewed, idx);
      // Update dots
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === idx));
      // Update counter
      counter.textContent = `${idx + 1} / ${totalCards}`;
      // Hide hint after first swipe
      if (idx > 0 && hint) hint.classList.add('faded');
      // Log swipe
      if (idx > 0) {
        logEvent('tafsir_summary_swiped', {
          mode: currentMode, surah: verse.surah_name,
          ayah: verse.verse_number, to_card: idx + 1,
        });
      }
    }, 50);
  });

  // ── Back button ──────────────────────────────────────────────────────────
  document.getElementById('to-back-btn').addEventListener('click', () => {
    closeTafsirOverlay();
    // Go back in history to match the pushState
    if (history.state && history.state.tafsirOverlay) history.back();
  });

  // ── Verse ref expand/collapse ────────────────────────────────────────────
  const refToggle = document.getElementById('to-ref-toggle');
  const refExpand = document.getElementById('to-ref-expand');
  if (refToggle && refExpand) {
    refToggle.addEventListener('click', () => {
      const isOpen = refExpand.classList.toggle('open');
      refToggle.classList.toggle('open', isOpen);
    });
  }

  // ── Full tafsir expand/collapse ──────────────────────────────────────────
  const fullBtn     = document.getElementById('to-full-btn');
  const fullContent = document.getElementById('to-full-content');

  if (fullBtn && fullContent && fullTafsirSources.length > 0) {
    fullBtn.addEventListener('click', () => {
      const isExpanded = fullContent.classList.toggle('expanded');
      fullBtn.classList.toggle('expanded', isExpanded);
      if (isExpanded) {
        // Scroll the full-tafsir section into view so user can read it
        setTimeout(() => {
          const section = fullBtn.closest('.to-full-section');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        logEvent('tafsir_full_opened', {
          mode: currentMode, surah: verse.surah_name, ayah: verse.verse_number,
        });
      }
    });

    // Accordion toggles (single-open behavior)
    fullContent.querySelectorAll('.tfl-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const answer = btn.closest('.tfl-item').querySelector('.tfl-answer');
        const isOpen = btn.classList.contains('open');

        // Close all open items
        fullContent.querySelectorAll('.tfl-toggle.open').forEach(t => {
          t.classList.remove('open');
          t.closest('.tfl-item').querySelector('.tfl-answer').classList.remove('open');
        });

        // If clicked item wasn't open, open it
        if (!isOpen) {
          btn.classList.add('open');
          answer.classList.add('open');
        }

        logEvent('tafsir_full_tab_switched', { source: btn.dataset.tflId });
      });
    });
  }
}

function closeTafsirOverlay() {
  const overlay = document.getElementById('tafsir-overlay');
  if (!overlay) return;

  overlay.classList.remove('active');
  document.body.classList.remove('tafsir-locked');

  // Log close event
  if (_tafsirOverlayVerse) {
    logEvent('tafsir_overlay_closed', {
      mode: currentMode,
      surah: _tafsirOverlayVerse.surah_name,
      ayah: _tafsirOverlayVerse.verse_number,
      last_card_viewed: _tafsirLastCardViewed + 1,
    });
  }

  // Clear after transition
  setTimeout(() => {
    overlay.innerHTML = '';
    overlay.setAttribute('aria-hidden', 'true');
  }, 300);

  _tafsirOverlayVerse   = null;
  _tafsirLastCardViewed = 0;
}

// Close tafsir overlay on browser back button
window.addEventListener('popstate', () => {
  const tafsirOv = document.getElementById('tafsir-overlay');
  if (tafsirOv && tafsirOv.classList.contains('active')) {
    closeTafsirOverlay();
    return;
  }
  const aboutOv = document.getElementById('aboutOverlay');
  if (aboutOv && aboutOv.classList.contains('active')) {
    closeAbout();
  }
});

// ── About / FAQ Overlay ───────────────────────────────────────────────────────
function openAbout() {
  const overlay = document.getElementById('aboutOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('about-locked');
  history.pushState({ about: true }, '');
  logEvent('about_opened', {});
}

function closeAbout() {
  const overlay = document.getElementById('aboutOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('about-locked');
  // Collapse any open accordion item
  overlay.querySelectorAll('.ao-toggle.open').forEach(b => {
    b.classList.remove('open');
    b.nextElementSibling.classList.remove('open');
  });
}

function initAbout() {
  // Trigger button
  const trigger = document.getElementById('aboutTrigger');
  if (trigger) trigger.addEventListener('click', openAbout);

  // Back button
  const back = document.getElementById('aboutBack');
  if (back) back.addEventListener('click', closeAbout);

  // Accordion toggles (single-open behavior)
  document.querySelectorAll('#aboutOverlay .ao-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const isOpen = btn.classList.contains('open');
      const faqKey = btn.getAttribute('data-faq');

      // Close all open items
      document.querySelectorAll('#aboutOverlay .ao-toggle.open').forEach(b => {
        b.classList.remove('open');
        b.nextElementSibling.classList.remove('open');
      });

      // Toggle the clicked item
      if (!isOpen) {
        btn.classList.add('open');
        answer.classList.add('open');
        if (faqKey) logEvent('about_faq_tapped', { item: faqKey });
      }
    });
  });

  // QRIS save button — blob download for reliable mobile support
  const qrisBtn = document.getElementById('qrisSaveBtn');
  if (qrisBtn) {
    qrisBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const resp = await fetch('qris.png');
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = 'QRIS-TemuQuran.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: open image in new tab
        window.open('qris.png', '_blank');
      }
      logEvent('qris_saved');
    });
  }
}

// Update the live preview thumbnail (CSS-styled, not canvas)
function updateSharePreview() {
  if (!shareActiveVerse) return;
  const verse   = shareActiveVerse;
  const preview = document.getElementById('share-preview');

  let html = `<div class="si-wrap si-theme-${shareTheme}" style="width:100%;position:relative;padding:8% 12%;">`;

  // Branding header (top)
  html += `
    <div class="si-header">
      <span class="si-header-brand" style="font-size:14px;">TemuQuran.com</span>
      <span class="si-header-sub" style="font-size:8px;">Temukan Jawaban Dalam Al-Qur'an</span>
      <div class="si-header-divider"></div>
    </div>
  `;

  // Optional feeling/question
  if (shareIncludeQuestion && verse._userQuestion && currentMode !== 'jelajahi') {
    html += `<p class="si-question" style="font-size:9px;">"${escapeHtml(verse._userQuestion)}"</p>`;
  }

  // Arabic (smaller for preview)
  html += `<p class="si-arabic" style="font-size:18px;line-height:1.9;margin-bottom:10px;max-width:92%;">${escapeHtml(verse.arabic)}</p>`;

  // Translation — full text, no truncation
  html += `<p class="si-translation" style="font-size:9px;line-height:1.6;margin-bottom:8px;">"${escapeHtml(verse.translation)}"</p>`;

  // Ref
  html += `<span class="si-ref" style="font-size:7px;padding:3px 8px;">${escapeHtml(verse.ref)}</span>`;

  // Footer
  html += `<div class="si-footer" style="font-size:7px;margin-top:12px;">TemuQuran.com</div>`;

  html += '</div>';
  preview.innerHTML = html;
}

// Share to a platform
async function shareToPlatform(platform) {
  if (!shareActiveVerse) return;

  if (IS_IN_APP_BROWSER) {
    showToast('Buka di Chrome/Safari untuk berbagi gambar 🌐');
    return;
  }

  logEvent('share_completed', {
    platform,
    theme: shareTheme,
    include_question: shareIncludeQuestion,
    include_question: shareIncludeQuestion,
  });

  showToast('Membuat gambar...');

  let blob = null;
  try {
    blob = await generateShareImage(shareActiveVerse, platform);
  } catch (imgErr) {
    console.warn('Image generation failed:', imgErr);
    showToast('Gagal membuat gambar. Coba lagi.');
    return;
  }

  if (!blob) return;

  const safeName = shareActiveVerse.ref.replace(/[^a-zA-Z0-9]/g, '-');
  const file     = new File([blob], `${safeName}.png`, { type: 'image/png' });

  if (platform === 'download') {
    // Direct download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${safeName}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Gambar tersimpan ✓');
    return;
  }

  // IG Story / WA Status / WA Chat → try Web Share API, fall back to download
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: shareActiveVerse.ref, files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${safeName}.png`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Gambar tersimpan ✓');
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

// ── Icons ─────────────────────────────────────────────────────────────────────

const COPY_ICON           = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const EXPAND_ICON         = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const COLLAPSE_ICON       = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const SHARE_ICON          = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const PLAY_ICON           = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const PAUSE_ICON          = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const WA_ICON             = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
const IG_ICON             = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>`;
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
    activePlayBtn.innerHTML = PLAY_ICON + ' Dengarkan';
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

// ── Verse Card ────────────────────────────────────────────────────────────────

function buildVerseCard(verse, index) {
  const card    = document.createElement('article');
  card.className = 'verse-card';

  // ── Build tafsir tabs (only include tabs that have content) ──────────────
  const tafsirTabs = [];
  if (verse.tafsir_quraish_shihab) tafsirTabs.push({ id: 'quraish', label: 'Quraish Shihab', text: verse.tafsir_quraish_shihab, note: 'Tafsir M. Quraish Shihab' });
  if (verse.tafsir_kemenag)     tafsirTabs.push({ id: 'kemenag', label: 'Kemenag RI',     text: verse.tafsir_kemenag,     note: 'Tafsir Kemenag RI' });
  if (verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir) {
    const ikIsId = !!verse.tafsir_ibnu_kathir_id;
    tafsirTabs.push({
      id:         'ik',
      label:      'Ibnu Kathir',
      text:       verse.tafsir_ibnu_kathir_id || verse.tafsir_ibnu_kathir,
      note:       ikIsId ? 'Ibnu Kathir · Bahasa Indonesia' : 'Ibnu Kathir · English',
      isMarkdown: ikIsId,
    });
  }

  // ── Build tafsir collapsible (fallback when no JSONB summary) ────────────
  const fallbackTafsirHtml = tafsirTabs.length > 0 ? `
    <button class="vc-tafsir-btn vc-tafsir-toggle">
      <span>${EXPAND_ICON} Baca Tafsir</span>
      <span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>
    </button>
    <div class="vc-tafsir-panel hidden">
      <div class="vc-tafsir-tabs">
        ${tafsirTabs.map((t, i) =>
          `<button class="vc-tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
        ).join('')}
      </div>
      ${tafsirTabs.map((t, i) => {
        const long    = t.text.length > 400;
        const content = t.isMarkdown
          ? `<div class="vc-tafsir-md">${renderMarkdown(t.text)}</div>`
          : `<p class="vc-tafsir-text">${escapeHtml(t.text)}</p>`;
        return `
        <div class="vc-tab-content${i === 0 ? '' : ' hidden'}" data-content="${t.id}">
          <div class="vc-tafsir-text-wrap${long ? '' : ' expanded'}">
            ${content}
          </div>
          ${long ? `<button class="vc-read-more-btn">${EXPAND_ICON} Baca Selengkapnya</button>` : ''}
          <p class="vc-tafsir-note">${t.note}</p>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  // ── Build asbabun nuzul section (fallback) ────────────────────────────
  const asbabText = verse.asbabun_nuzul_id || verse.asbabun_nuzul;
  const asbabIsId = !!verse.asbabun_nuzul_id;
  const fallbackAsbabHtml = asbabText ? (() => {
    const long    = asbabText.length > 400;
    const content = asbabIsId
      ? `<div class="vc-tafsir-md">${renderMarkdown(asbabText)}</div>`
      : `<p class="vc-tafsir-text">${escapeHtml(asbabText)}</p>`;
    return `
    <button class="vc-tafsir-btn vc-asbab-toggle">
      <span>${EXPAND_ICON} Kenapa Ayat Ini Diturunkan?</span>
      <span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>
    </button>
    <div class="vc-asbab-panel hidden">
      <div class="vc-asbab-body">
        <div class="vc-tafsir-text-wrap${long ? '' : ' expanded'}">
          ${content}
        </div>
        ${long ? `<button class="vc-read-more-btn">${EXPAND_ICON} Baca Selengkapnya</button>` : ''}
        <p class="vc-tafsir-note">${asbabIsId ? 'Asbabun Nuzul · Al-Wahidi · Bahasa Indonesia' : 'Asbabun Nuzul · Al-Wahidi · English'}</p>
      </div>
    </div>
  `;
  })() : '';

  // ── Tafsir Summary teaser (replaces collapsibles when JSONB exists) ────
  const summaryData = verse.tafsir_summary; // JSONB from pre-generated AI summaries
  const CHEVRON_RIGHT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>`;
  let teaserHtml = '';
  let cardCount  = 0;

  if (summaryData && typeof summaryData === 'object' && summaryData.makna_utama) {
    cardCount = [summaryData.makna_utama, summaryData.hidup_kita,
      summaryData.konteks_turun, summaryData.penjelasan_penting].filter(Boolean).length;
    const previewText = summaryData.makna_utama.text || '';
    teaserHtml = `
      <div class="tafsir-cta-link" data-verse-id="${verse.id}">
        <span class="tafsir-cta-icon">📖</span>
        <span class="tafsir-cta-text">Pahami ayat ini lebih dalam</span>
        ${CHEVRON_RIGHT}
      </div>`;
  }

  // Use teaser if available, otherwise fall back to collapsibles
  const tafsirSectionHtml = teaserHtml
    ? teaserHtml
    : (fallbackTafsirHtml + fallbackAsbabHtml);

  const perVerseText = verse.relevance || verse.resonance || '';
  const perVerseClass = verse.relevance ? 'vc-relevance' : 'vc-resonance';
  const resonanceHtml = perVerseText
    ? `<div class="${perVerseClass}">${escapeHtml(perVerseText)}</div>`
    : '';

  // Surah number for the circle badge
  const surahNum = verse.surah_number || verse.id.split(':')[0];

  card.innerHTML = `
    <div class="vc-arabic-section">
      <div class="vc-ref-row">
        <span class="vc-ref-label">${escapeHtml(verse.ref)}</span>
        <span class="vc-surah-number">${surahNum}</span>
      </div>
      <p class="vc-arabic-text">${escapeHtml(verse.arabic)}</p>
    </div>
    <div class="vc-content">
      <p class="vc-translation">"${escapeHtml(verse.translation)}"</p>
      ${resonanceHtml}
      ${tafsirSectionHtml}
      <div class="vc-action-row">
        <button class="vc-action-btn vc-audio-btn">${PLAY_ICON} Dengarkan</button>
        <button class="vc-action-btn vc-share-btn">Bagikan Ayat ${IG_ICON} ${WA_ICON}</button>
      </div>
    </div>
  `;

  card.querySelector('.vc-audio-btn').addEventListener('click', e => playAudio(verse, e.currentTarget));
  card.querySelector('.vc-share-btn').addEventListener('click', () => openShareSheet(verse));

  // ── Tafsir CTA click → open overlay ────────────────────────────────────
  const tafsirCta = card.querySelector('.tafsir-cta-link');
  if (tafsirCta) {
    tafsirCta.addEventListener('click', () => {
      openTafsirOverlay(verse);
      logEvent('tafsir_summary_opened', {
        mode: currentMode, surah: verse.surah_name,
        ayah: verse.verse_number, card_count: cardCount,
      });
    });
  }

  // ── Tafsir accordion toggle (fallback only) ────────────────────────────
  const tafsirToggle = card.querySelector('.vc-tafsir-toggle');
  if (tafsirToggle) {
    const panel = card.querySelector('.vc-tafsir-panel');

    tafsirToggle.addEventListener('click', () => {
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      tafsirToggle.classList.toggle('open', !isOpen);
      tafsirToggle.innerHTML = isOpen
        ? `<span>${EXPAND_ICON} Baca Tafsir</span><span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>`
        : `<span>${COLLAPSE_ICON} Tutup Tafsir</span><span class="vc-tafsir-btn-arrow">${COLLAPSE_ICON}</span>`;
      logEvent('tafsir_opened', { surah_name: verse.surah_name, open: !isOpen });
    });

    // ── Tab switching ──────────────────────────────────────────────────────
    card.querySelectorAll('.vc-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.vc-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        card.querySelectorAll('.vc-tab-content').forEach(c => c.classList.add('hidden'));
        card.querySelector(`.vc-tab-content[data-content="${btn.dataset.tab}"]`).classList.remove('hidden');
        logEvent('tafsir_tab', { surah_name: verse.surah_name, tab: btn.dataset.tab });
      });
    });

    // ── Baca Selengkapnya expand (tafsir panel only) ────────────────────────
    panel.querySelectorAll('.vc-read-more-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap     = btn.previousElementSibling;
        const expanded = wrap.classList.toggle('expanded');
        btn.innerHTML  = expanded
          ? `${COLLAPSE_ICON} Sembunyikan`
          : `${EXPAND_ICON} Baca Selengkapnya`;
      });
    });
  }

  // ── Asbabun Nuzul accordion toggle ───────────────────────────────────────
  const asbabToggle = card.querySelector('.vc-asbab-toggle');
  if (asbabToggle) {
    const asbabPanel = card.querySelector('.vc-asbab-panel');

    asbabToggle.addEventListener('click', () => {
      const isOpen = !asbabPanel.classList.contains('hidden');
      asbabPanel.classList.toggle('hidden', isOpen);
      asbabToggle.classList.toggle('open', !isOpen);
      asbabToggle.innerHTML = isOpen
        ? `<span>${EXPAND_ICON} Kenapa Ayat Ini Diturunkan?</span><span class="vc-tafsir-btn-arrow">${EXPAND_ICON}</span>`
        : `<span>${COLLAPSE_ICON} Tutup Asbabun Nuzul</span><span class="vc-tafsir-btn-arrow">${COLLAPSE_ICON}</span>`;
      logEvent('asbabun_nuzul_opened', { surah_name: verse.surah_name, open: !isOpen });
    });

    // ── Baca Selengkapnya for asbabun nuzul ──────────────────────────────
    asbabPanel.querySelectorAll('.vc-read-more-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap     = btn.previousElementSibling;
        const expanded = wrap.classList.toggle('expanded');
        btn.innerHTML  = expanded
          ? `${COLLAPSE_ICON} Sembunyikan`
          : `${EXPAND_ICON} Baca Selengkapnya`;
      });
    });
  }

  return card;
}

// ── Loading State ─────────────────────────────────────────────────────────────
// Dark-gradient chat header with user feeling bubble on the right
// and a typing-indicator app bubble on the left while the API call is in flight.

function showLoading() {
  typewriterActive = false;
  stopLoadingSteps();
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // Reset carousel state
  currentCardIndex = 0;
  totalVerseCards  = 0;

  const carousel = document.getElementById('verses-carousel');

  if (currentMode === 'jelajahi' || currentMode === 'ajarkan') {
    // Centered spinner loading (no user chat bubble)
    const icon = currentMode === 'ajarkan' ? '🌙' : '📜';
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="jelajahi-loading">
          <span class="jl-icon">${icon}</span>
          <span class="ls-step-wrap"><span class="ls-step-text" id="loading-step-text"></span></span>
        </div>
      </div>
    `;
  } else {
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="intro-chat">
          <div class="chat-thread">
            <div class="chat-bubble chat-bubble--user">${escapeHtml(currentFeeling)}</div>
            <div class="chat-bubble chat-bubble--app chat-bubble--typing">
              <span class="ls-step-wrap"><span class="ls-step-text" id="loading-step-text"></span></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('verses-dots').innerHTML = '';
  document.getElementById('verse-counter-text').textContent = '';

  startLoadingSteps();
}

// ── Render Verses ─────────────────────────────────────────────────────────────
// Sequence: typewrite reflection → stagger verse cards in → reveal feedback

function renderVerses(data) {
  currentAyat = data.ayat;
  stopLoadingSteps();

  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // ── Carousel state ──────────────────────────────────────────────────────────
  totalVerseCards  = data.ayat.length + 1; // intro + verse slides
  currentCardIndex = 0;

  // ── A: Build intro slide (chat-bubble style) ───────────────────────────────
  const introSlide = document.createElement('div');
  introSlide.className = 'verse-slide';
  introSlide.innerHTML = `
    <div class="intro-chat">
      <div class="chat-thread">
        <div class="chat-bubble chat-bubble--user">${escapeHtml(currentFeeling)}</div>
        <div class="chat-bubble chat-bubble--app chat-bubble--typing-active">
          <span class="cb-text" id="intro-typewriter"></span>
        </div>
      </div>
      <div class="swipe-hint-pill" id="intro-swipe-hint" style="display:none;">Geser untuk menemukan ayat <span class="swipe-hint-arrow">→</span></div>
    </div>
  `;
  carousel.appendChild(introSlide);

  // ── B: Build verse slides ───────────────────────────────────────────────────
  data.ayat.forEach((verse, i) => {
    const slide = document.createElement('div');
    slide.className = 'verse-slide';
    const card = buildVerseCard(verse, i);
    card.classList.add('card-visible'); // no entrance animation in carousel
    slide.appendChild(card);
    carousel.appendChild(slide);
  });

  // ── C: Pagination dots ──────────────────────────────────────────────────────
  renderDots();
  updateCounter();

  // ── D: Typewriter on intro text ─────────────────────────────────────────────
  const reflection = data.explanation || data.reflection || '';
  const introTextEl = document.getElementById('intro-typewriter');
  typewriterActive = true;
  let pos = 0;

  function tick() {
    if (!typewriterActive) return;
    pos = Math.min(pos + 3, reflection.length);
    introTextEl.textContent = reflection.slice(0, pos);
    if (pos < reflection.length) {
      setTimeout(tick, 15);
    } else {
      // Remove blinking cursor
      const appBubble = introTextEl.closest('.chat-bubble--app');
      if (appBubble) appBubble.classList.remove('chat-bubble--typing-active');
      typewriterActive = false;
      // Show swipe hint + start hint sequence
      const hint = document.getElementById('intro-swipe-hint');
      if (hint) hint.style.display = '';
      startSwipeHintSequence();
    }
  }

  if (reflection) tick(); else {
    const appBubble = introTextEl.closest('.chat-bubble--app');
    if (appBubble) appBubble.classList.remove('chat-bubble--typing-active');
    typewriterActive = false;
    const hint = document.getElementById('intro-swipe-hint');
    if (hint) hint.style.display = '';
    startSwipeHintSequence();
  }

  // ── E: Scroll listener for carousel ─────────────────────────────────────────
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // ── F: Hide actions/feedback until last card ────────────────────────────────
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');
}

// ── Swipe hint sequence (pill → peek → auto-advance) ─────────────────────────

function startSwipeHintSequence() {
  // Cancel any previous hint timers
  _swipeHintTimers.forEach(clearTimeout);
  _swipeHintTimers = [];

  const carousel = document.getElementById('verses-carousel');
  if (!carousel || totalVerseCards < 2) return;

  // 1. Peek nudge after 1.5s — reveal edge of next card
  _swipeHintTimers.push(setTimeout(() => {
    if (currentCardIndex !== 0) return;
    carousel.scrollTo({ left: 50, behavior: 'smooth' });
    setTimeout(() => {
      if (currentCardIndex === 0) carousel.scrollTo({ left: 0, behavior: 'smooth' });
    }, 600);
  }, 1500));

  // 2. Auto-advance to first verse after 5s
  _swipeHintTimers.push(setTimeout(() => {
    if (currentCardIndex !== 0) return;
    const slideWidth = carousel.offsetWidth;
    carousel.scrollTo({ left: slideWidth, behavior: 'smooth' });
  }, 5000));
}

function clearSwipeHints() {
  _swipeHintTimers.forEach(clearTimeout);
  _swipeHintTimers = [];
  document.querySelectorAll('.swipe-hint-pill').forEach(el => {
    el.classList.add('hint-faded');
  });
}

// ── Carousel Helpers ──────────────────────────────────────────────────────────

function onCarouselScroll() {
  const carousel   = document.getElementById('verses-carousel');
  const slideWidth = carousel.offsetWidth;
  if (slideWidth === 0) return;
  const newIndex = Math.round(carousel.scrollLeft / slideWidth);
  if (newIndex === currentCardIndex) return;

  currentCardIndex = newIndex;
  updateCounter();
  updateDots();
  updateProgressBar();

  // Clear swipe hints on first move away from intro
  if (newIndex > 0 && _swipeHintTimers.length > 0) clearSwipeHints();

  // Auto-pause audio when swiping away
  stopCurrentAudio();

  logEvent('verse_swiped', { slide_index: newIndex, total: totalVerseCards });

  // Jelajahi lazy loading — load more when within 3 slides of end
  if (currentMode === 'jelajahi' && jelajahiAllVerses.length > 0) {
    const nearEnd = currentCardIndex >= jelajahiLoadedUpTo - 3; // preload 3 slides early
    if (nearEnd && jelajahiLoadedUpTo < jelajahiAllVerses.length) {
      loadNextJelajahiBatch();
    }
  }

  // Show actions + feedback when reaching last card
  if (newIndex === totalVerseCards - 1) {
    showVerseActions();
  }
}

function showVerseActions() {
  const actionsEl  = document.getElementById('verse-actions');
  if (!actionsEl.classList.contains('hidden')) return; // already shown

  const parentView = currentMode === 'jelajahi' ? 'jelajahi-view'
    : currentMode === 'panduan' ? 'panduan-view'
    : currentMode === 'ajarkan' ? 'ajarkan-view' : 'selection-view';
  const moreLabel  = currentMode === 'jelajahi' ? 'Surah lain'
    : currentMode === 'panduan' ? 'Topik lain'
    : currentMode === 'ajarkan' ? 'Pertanyaan lain' : 'Perasaan lain';

  // Jelajahi doesn't have "try other verses" (no AI), just back button
  if (currentMode === 'jelajahi') {
    actionsEl.innerHTML = `
      <button class="va-secondary" id="find-more-btn">${moreLabel}</button>
    `;
    actionsEl.classList.remove('hidden');
    document.getElementById('find-more-btn')
      .addEventListener('click', () => {
        if (lastJuzSurahTapped) {
          switchView('jelajahi-view');
          setTimeout(() => showJuzSurahList(), 50);
        } else {
          switchView(parentView);
        }
      });
  } else {
    actionsEl.innerHTML = `
      <button class="va-refresh" id="refresh-btn">↺ Coba ayat lain</button>
      <button class="va-secondary" id="find-more-btn">${moreLabel}</button>
    `;
    actionsEl.classList.remove('hidden');
    document.getElementById('refresh-btn')
      .addEventListener('click', () => fetchAyat(currentFeeling, { ...currentSearchCtx, refresh: true }));
    document.getElementById('find-more-btn')
      .addEventListener('click', () => switchView(parentView));
    renderFeedback();
  }
}

function updateCounter() {
  const el = document.getElementById('verse-counter-text');
  if (currentCardIndex === 0) {
    if (currentMode === 'jelajahi') {
      el.textContent = jelajahiSurahInfo ? jelajahiSurahInfo.name : 'Info Surah';
    } else if (currentMode === 'ajarkan') {
      el.textContent = 'Ajarkan Anakku';
    } else {
      el.textContent = currentMode === 'panduan' ? 'Penjelasan' : 'Refleksi';
    }
  } else {
    el.textContent = `${currentCardIndex} / ${totalVerseCards - 1}`;
  }

  // Disable arrows at edges
  const prevBtn = document.getElementById('verse-prev');
  const nextBtn = document.getElementById('verse-next');
  if (prevBtn) prevBtn.disabled = currentCardIndex === 0;
  if (nextBtn) nextBtn.disabled = currentCardIndex === totalVerseCards - 1;
}

function useProgressBar() {
  return currentMode === 'jelajahi' && totalVerseCards > 16; // > 15 verses + intro
}

function renderDots() {
  const dotsEl = document.getElementById('verses-dots');
  dotsEl.innerHTML = '';

  if (useProgressBar()) {
    dotsEl.innerHTML = `<div class="reading-progress"><div class="reading-progress-fill" id="reading-progress-fill"></div></div>`;
    updateProgressBar();
    return;
  }

  for (let i = 0; i < totalVerseCards; i++) {
    const dot = document.createElement('span');
    dot.className = 'verse-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  }
}

function updateDots() {
  if (useProgressBar()) return; // handled by updateProgressBar
  const dots = document.querySelectorAll('#verses-dots .verse-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === currentCardIndex));
}

function updateProgressBar() {
  const fill = document.getElementById('reading-progress-fill');
  if (!fill) return;
  const pct = totalVerseCards > 1 ? (currentCardIndex / (totalVerseCards - 1)) * 100 : 0;
  fill.style.width = `${pct}%`;
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
          .addEventListener('click', () => switchView(currentMode === 'panduan' ? 'panduan-view' : 'selection-view'));
      }
    });
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
  const res = await fetch('/api/get-ayat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeling, mode: currentMode, ...(refresh ? { refresh: true } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  if (res.headers.get('X-Cache') === 'HIT') logEvent('search_cached');
  return data;
}

async function fetchAyat(feeling, { method = 'text', emotionId, refresh = false } = {}) {
  currentFeeling   = feeling;
  currentSearchCtx = { method, emotionId: emotionId || null };
  switchView('verses-view');
  showLoading();

  const startProps = { method };
  if (emotionId) startProps.emotion_id = emotionId;
  logEvent('search_started', startProps);

  try {
    const data = await callAPI(feeling, { refresh });
    if (data.not_relevant) {
      logEvent('search_completed', { outcome: 'not_relevant' });
      showNotRelevant(data.message);
    } else {
      logEvent('search_completed', { outcome: 'success', verse_count: data.ayat?.length ?? 0 });
      renderVerses(data);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

// ── Emotion Carousel Effect ───────────────────────────────────────────────────

function initCarouselEffect() {
  const carousel = document.getElementById('emotion-grid');
  if (!carousel) return;

  // Scale + fade cards based on distance from visible centre
  function update() {
    const visibleWidth = carousel.offsetWidth;
    const center = carousel.scrollLeft + visibleWidth / 2;

    carousel.querySelectorAll('.emotion-card').forEach(card => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      const maxDist = visibleWidth * 0.65;
      const ratio = Math.min(dist / maxDist, 1);

      const scale   = (1 - ratio * 0.10).toFixed(3);
      const opacity = (1 - ratio * 0.42).toFixed(3);
      card.style.transform = `scale(${scale})`;
      card.style.opacity   = opacity;
    });
  }

  carousel.addEventListener('scroll', update, { passive: true });

  // Desktop drag-to-scroll
  let isDragging = false, startX = 0, scrollStart = 0;

  carousel.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    scrollStart = carousel.scrollLeft;
    carousel.classList.add('is-dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    carousel.scrollLeft = scrollStart - (e.pageX - startX);
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    carousel.classList.remove('is-dragging');
  });

  // Run once after paint so offsetLeft values are ready
  requestAnimationFrame(() => requestAnimationFrame(update));
}

// ── Emotion Cards ─────────────────────────────────────────────────────────────

function renderEmotionCards() {
  const grid = document.getElementById('emotion-grid');
  grid.innerHTML = emotions.map(e => `
    <button
      class="emotion-card"
      data-feeling="${e.feeling}"
      data-emotion-id="${e.id}"
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

  initCarouselEffect();
}

// ── Panduan Cards ──────────────────────────────────────────────────────────

function renderPanduanCards() {
  const grid = document.getElementById('panduan-grid');
  if (!grid) return;
  grid.innerHTML = panduanPresets.map(p => `
    <button
      class="emotion-card"
      data-query="${escapeHtml(p.query)}"
      data-preset-id="${p.id}"
      aria-label="${p.label}"
    >
      <span class="ec-emoji">${p.emoji}</span>
      <span class="ec-label">${p.label}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () => expandPanduanCard(card.dataset.presetId));
  });

  initPanduanCarouselEffect();
}

function initPanduanCarouselEffect() {
  const carousel = document.getElementById('panduan-grid');
  if (!carousel) return;

  function update() {
    const visibleWidth = carousel.offsetWidth;
    const center = carousel.scrollLeft + visibleWidth / 2;

    carousel.querySelectorAll('.emotion-card').forEach(card => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      const maxDist = visibleWidth * 0.65;
      const ratio = Math.min(dist / maxDist, 1);

      const scale   = (1 - ratio * 0.10).toFixed(3);
      const opacity = (1 - ratio * 0.42).toFixed(3);
      card.style.transform = `scale(${scale})`;
      card.style.opacity   = opacity;
    });
  }

  carousel.addEventListener('scroll', update, { passive: true });

  let isDragging = false, startX = 0, scrollStart = 0;
  carousel.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    scrollStart = carousel.scrollLeft;
    carousel.classList.add('is-dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    carousel.scrollLeft = scrollStart - (e.pageX - startX);
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    carousel.classList.remove('is-dragging');
  });

  requestAnimationFrame(() => requestAnimationFrame(update));
}

// ── Panduan Search Input ──────────────────────────────────────────────────

function initPanduanSearch() {
  const input     = document.getElementById('panduan-input');
  const clearBtn  = document.getElementById('panduan-clear');
  const submitBtn = document.getElementById('panduan-submit');
  if (!input) return;

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val, { method: 'text' });
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 3);
  });

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

  const CHEVRON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  container.innerHTML = `
    <div class="votd-wrap">
      <button class="votd-trigger" aria-expanded="false">
        <div class="votd-trigger-info">
          <span class="votd-label">✦ Ayat Hari Ini</span>
          <span class="votd-date">${dateStr}</span>
        </div>
        <span class="votd-chevron">${CHEVRON}</span>
      </button>
      <div class="votd-body">
        <div class="votd-card">
          <p class="votd-arabic">${escapeHtml(verse.arabic)}</p>
          <p class="votd-translation">"${escapeHtml(verse.translation)}"</p>
          <p class="votd-ref">${escapeHtml(ref)}</p>
          <div class="votd-actions">
            <button class="vc-btn votd-audio-btn">${PLAY_ICON} Putar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Toggle expand/collapse
  container.querySelector('.votd-trigger').addEventListener('click', function () {
    const expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', !expanded);
    container.querySelector('.votd-body').classList.toggle('open', !expanded);
  });

  container.querySelector('.votd-audio-btn').addEventListener('click',
    e => playAudio(verse, e.currentTarget)
  );
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

// ── Sub-Questions Drill-Down ─────────────────────────────────────────────────

const BACK_ARROW_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`;
const CHEVRON_RIGHT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

function expandPanduanCard(cardId) {
  expandedCardId = cardId;

  const preset = panduanPresets.find(p => p.id === cardId);
  if (!preset) return;

  const subQuestions = PANDUAN_SUB_QUESTIONS[cardId] || [];

  const container = document.getElementById('panduan-expanded');
  container.innerHTML = `
    <div class="panduan-expanded-inner">
      <button class="panduan-expanded-back" id="expanded-back-btn">
        ${BACK_ARROW_SVG} Kembali
      </button>
      <div class="panduan-expanded-header">
        <span class="panduan-expanded-emoji">${preset.emoji}</span>
        <h2 class="panduan-expanded-title">${preset.label}</h2>
        <p class="panduan-expanded-desc">${escapeHtml(preset.query)}</p>
      </div>
      <div class="sub-questions-list">
        ${subQuestions.map((q, i) => `
          <button class="sub-question-row" data-index="${i}" data-card-id="${cardId}">
            <span>${escapeHtml(q)}</span>
            <span class="sub-question-arrow">${CHEVRON_RIGHT_SVG}</span>
          </button>
        `).join('')}
      </div>
      <div class="tulis-sendiri-section" id="tulis-sendiri-section">
        <button class="tulis-sendiri-row" id="tulis-sendiri-btn">
          <span>✏️</span>
          <span>Tulis sendiri...</span>
        </button>
      </div>
    </div>
  `;

  // Show expanded, animate in
  container.classList.remove('hidden', 'slide-down');
  container.classList.add('slide-up');

  // Wire sub-question taps
  container.querySelectorAll('.sub-question-row').forEach(row => {
    row.addEventListener('click', () => {
      const qIndex = parseInt(row.dataset.index, 10);
      const qText  = subQuestions[qIndex];
      selectSubQuestion(qText, cardId, qIndex);
    });
  });

  // Wire back button
  container.querySelector('#expanded-back-btn').addEventListener('click', collapsePanduanCard);

  // Wire "Tulis sendiri"
  container.querySelector('#tulis-sendiri-btn').addEventListener('click', () => showTulisSendiri(cardId));

  window.scrollTo({ top: 0, behavior: 'smooth' });
  logEvent('card_expanded', { card_id: cardId, mode: 'panduan' });
}

function collapsePanduanCard() {
  const container = document.getElementById('panduan-expanded');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');

  container.addEventListener('animationend', function handler() {
    container.removeEventListener('animationend', handler);
    container.classList.add('hidden');
    container.classList.remove('slide-down');
    container.innerHTML = '';
    expandedCardId = null;
  });
}

function selectSubQuestion(questionText, cardId, index) {
  logEvent('sub_question_selected', { card_id: cardId, question_index: index, mode: 'panduan' });
  fetchAyat(questionText, { method: 'panduan_sub_question', emotionId: cardId });
}

function showTulisSendiri(cardId) {
  logEvent('tulis_sendiri_opened', { card_id: cardId, mode: 'panduan' });

  const section = document.getElementById('tulis-sendiri-section');
  section.innerHTML = `
    <div class="tulis-sendiri-form">
      <textarea id="tulis-sendiri-input" placeholder="Tulis pertanyaanmu di sini..." rows="3"></textarea>
      <button class="tulis-sendiri-submit" id="tulis-sendiri-submit" disabled>Cari Panduan</button>
    </div>
  `;

  const input  = document.getElementById('tulis-sendiri-input');
  const submit = document.getElementById('tulis-sendiri-submit');

  input.focus();

  // Scroll so textarea is visible
  setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);

  input.addEventListener('input', () => {
    submit.disabled = input.value.trim().length < 3;
  });

  const doSubmit = () => {
    const val = input.value.trim();
    if (val.length >= 3) fetchAyat(val, { method: 'panduan_tulis_sendiri', emotionId: cardId });
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSubmit();
  });
}

// ── Jelajahi Cards ──────────────────────────────────────────────────────────

function loadSurahFromBrowser(surahNum, source) {
  const meta = SURAH_META[surahNum - 1];
  logEvent('jelajahi_surah_browser', { surah: surahNum, name: meta.name, source });
  lastJuzSurahTapped = null;
  cameFromMultiResult = false;
  fetchJelajahi(null, { type: 'surah', surah: surahNum });
}

function toggleJuzGroup(groupEl) {
  const currentlyOpen = document.querySelector('.juz-group.expanded');
  if (currentlyOpen && currentlyOpen !== groupEl) {
    currentlyOpen.classList.remove('expanded');
  }
  groupEl.classList.toggle('expanded');

  if (groupEl.classList.contains('expanded')) {
    const label = groupEl.querySelector('.juz-group-label');
    logEvent('jelajahi_juz_group_opened', { group: label ? label.textContent : '' });
    setTimeout(() => {
      groupEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function renderSurahBrowser() {
  const container = document.getElementById('surah-browser');
  if (!container) return;

  let html = '';

  // All juz accordion groups (including Juz 1–5)
  SURAH_BROWSER.forEach((group, idx) => {
    const surahRows = group.surahs.map(num => {
      const s = SURAH_META[num - 1];
      return `
        <button class="sb-accordion-row" data-surah="${num}">
          <span class="sb-num">${num}</span>
          <span class="sb-name">${escapeHtml(s.name)}</span>
          <span class="sb-info">${s.verses} ayat</span>
        </button>
      `;
    }).join('');

    html += `
      <div class="juz-group" id="juz-group-${idx}">
        <button class="juz-group-header">
          <span class="juz-group-left">
            <span class="juz-group-label">${group.label}</span>
            <span class="juz-group-count">${group.surahs.length} surat</span>
          </span>
          <span class="juz-group-arrow">›</span>
        </button>
        <div class="juz-group-content">
          ${surahRows}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Accordion header click handlers
  container.querySelectorAll('.juz-group-header').forEach(header => {
    header.addEventListener('click', () => {
      toggleJuzGroup(header.parentElement);
    });
  });

  // Accordion surah row click handlers
  container.querySelectorAll('.sb-accordion-row').forEach(row => {
    row.addEventListener('click', () => {
      const groupLabel = row.closest('.juz-group').querySelector('.juz-group-label').textContent;
      loadSurahFromBrowser(parseInt(row.dataset.surah, 10), groupLabel);
    });
  });
}

function showJuzSurahList() {
  juzSurahListVisible = true;
  // Clone node to drop any stale animationend listeners from a prior
  // hideJuzSurahList that never fired (view switched away mid-animation).
  const old = document.getElementById('juz-surah-list');
  const container = old.cloneNode(false);
  old.parentNode.replaceChild(container, old);

  container.innerHTML = `
    <div class="juz-surah-inner">
      <div class="juz-surah-header">
        <button class="panduan-expanded-back" id="juz-back-btn">
          ${BACK_ARROW_SVG} Kembali
        </button>
        <span class="juz-surah-title">Juz Amma</span>
      </div>
      <div class="juz-surah-rows">
        ${JUZ_30_SURAHS.map(s => `
          <button class="juz-surah-row" data-surah="${s.number}">
            <span class="juz-surah-num">${s.number}</span>
            <span class="juz-surah-name">${escapeHtml(s.name)}</span>
            <span class="juz-surah-info">${s.verses} ayat</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.classList.remove('hidden');
  container.classList.add('slide-up');
  container.classList.remove('slide-down');

  container.querySelector('#juz-back-btn').addEventListener('click', hideJuzSurahList);
  container.querySelectorAll('.juz-surah-row').forEach(row => {
    row.addEventListener('click', () => {
      const surahNum = parseInt(row.dataset.surah, 10);
      const meta = SURAH_META[surahNum - 1];
      logEvent('jelajahi_juz_surah_selected', { juz: 30, surah: surahNum, name: meta.name });
      lastJuzSurahTapped = surahNum;
      hideJuzSurahList();
      fetchJelajahi(null, { type: 'surah', surah: surahNum });
    });
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideJuzSurahList() {
  const container = document.getElementById('juz-surah-list');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');

  container.addEventListener('animationend', function handler() {
    container.removeEventListener('animationend', handler);
    container.classList.add('hidden');
    container.classList.remove('slide-down');
    juzSurahListVisible = false;
  });
}

// ── Jelajahi Multi-Result ─────────────────────────────────────────────────

function toggleJelajahiLanding(show) {
  const jView = document.getElementById('jelajahi-view');
  const display = show ? '' : 'none';
  ['.header', '.input-card', '.home-content'].forEach(sel => {
    const el = jView.querySelector(sel);
    if (el) el.style.display = display;
  });
}

function showMultiResults(results) {
  jelajahiMultiResults = results;
  const container = document.getElementById('jelajahi-multi');

  // Hide landing content
  toggleJelajahiLanding(false);

  container.innerHTML = `
    <p class="multi-result-heading">Kami menemukan beberapa surat yang cocok</p>
    <p class="multi-result-subheading">Pilih salah satu untuk mulai membaca:</p>
    ${results.map((r, i) => `
      <button class="multi-result-card" data-idx="${i}">
        <span class="juz-surah-num">${r.surah}</span>
        <div class="multi-card-body">
          <div class="multi-card-header">
            <span class="multi-card-name">${escapeHtml(r.name)}</span>
            <span class="multi-card-info">${r.verse_count} ayat</span>
          </div>
          <p class="multi-card-reason">${escapeHtml(r.reason)}</p>
        </div>
      </button>
    `).join('')}
  `;

  container.classList.remove('hidden');

  container.querySelectorAll('.multi-result-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx, 10);
      const chosen = results[idx];
      logEvent('jelajahi_multi_selected', { surah: chosen.surah, name: chosen.name, position: idx + 1 });
      cameFromMultiResult = true;
      // Hide multi UI but preserve results for back navigation
      container.classList.add('hidden');
      container.innerHTML = '';
      toggleJelajahiLanding(true);
      fetchJelajahi(null, { type: 'surah', surah: chosen.surah });
    });
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideMultiResults() {
  const container = document.getElementById('jelajahi-multi');
  container.classList.add('hidden');
  container.innerHTML = '';
  jelajahiMultiResults = null;
  toggleJelajahiLanding(true);
}

// ── Jelajahi Search Input ──────────────────────────────────────────────────

function initJelajahiSearch() {
  const input     = document.getElementById('jelajahi-input');
  const clearBtn  = document.getElementById('jelajahi-clear');
  const submitBtn = document.getElementById('jelajahi-submit');
  if (!input) return;

  const triggerSearch = () => {
    const val = input.value.trim();
    if (val.length >= 2) {
      logEvent('jelajahi_search', { query_length: val.length });
      lastJuzSurahTapped = null;
      cameFromMultiResult = false;
      jelajahiMultiResults = null;
      fetchJelajahi(val, null);
    }
  };

  input.addEventListener('input', () => {
    const len = input.value.length;
    clearBtn.classList.toggle('hidden', len === 0);
    submitBtn.classList.toggle('hidden', len < 2);
  });

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

// ── Jelajahi API Call ────────────────────────────────────────────────────────

async function fetchJelajahi(queryText, presetIntent) {
  currentMode = 'jelajahi';
  currentFeeling = queryText || (presetIntent ? `Surah ${SURAH_META[(presetIntent.surah || 1) - 1].name}` : '');
  currentSearchCtx = { method: presetIntent ? 'jelajahi_preset' : 'jelajahi_search' };

  switchView('verses-view');
  showLoading();

  try {
    const body = { mode: 'jelajahi' };
    if (presetIntent) {
      body.intent = presetIntent;
    } else {
      body.feeling = queryText;
    }

    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');

    // Handle surah_list response (e.g. juz query from typed input)
    if (data.type === 'surah_list') {
      switchView('jelajahi-view');
      // Render inline surah list similar to juz amma
      showJuzSurahList();
      return;
    }

    // Handle multi-result response (user picks from 2-3 suggestions)
    if (data.type === 'multi' && Array.isArray(data.results)) {
      stopLoadingSteps();
      switchView('jelajahi-view');
      showMultiResults(data.results);
      return;
    }

    if (data.not_relevant) {
      showNotRelevant(data.message || 'Tidak ditemukan ayat yang cocok.');
      return;
    }

    // Normalize verse data from API
    const verses = (data.ayat || data.verses || []).map(v => ({
      id:                    v.id || `${v.surah_number || v.surah}:${v.verse_number || v.ayah}`,
      ref:                   v.ref || `QS. ${SURAH_META[(v.surah_number || v.surah || 1) - 1].name} : ${v.verse_number || v.ayah}`,
      surah_name:            v.surah_name || SURAH_META[(v.surah_number || v.surah || 1) - 1].name,
      surah_number:          v.surah_number || v.surah,
      verse_number:          v.verse_number || v.ayah,
      arabic:                v.arabic || v.text_arabic,
      translation:           v.translation || v.text_indonesian,
      tafsir_quraish_shihab: v.tafsir_quraish_shihab || null,
      tafsir_summary:        v.tafsir_summary || null,
      tafsir_kemenag:        v.tafsir_kemenag || null,
      tafsir_ibnu_kathir:    v.tafsir_ibnu_kathir || null,
      tafsir_ibnu_kathir_id: v.tafsir_ibnu_kathir_id || null,
      asbabun_nuzul:         v.asbabun_nuzul || null,
      asbabun_nuzul_id:      v.asbabun_nuzul_id || null,
    }));

    if (verses.length === 0) throw new Error('Tidak ditemukan ayat.');

    // Store surah info — prefer SURAH_META (has all fields) over API surah_info
    const firstSurah = verses[0].surah_number;
    jelajahiSurahInfo = SURAH_META[firstSurah - 1] || data.surah_info || null;

    renderJelajahiVerses(verses);

  } catch (err) {
    stopLoadingSteps();
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

// ── Jelajahi Verse Rendering ────────────────────────────────────────────────

function renderJelajahiVerses(verses) {
  jelajahiAllVerses  = verses;
  jelajahiLoadedUpTo = 0;
  currentAyat        = verses;
  stopLoadingSteps();

  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // Strip Bismillah from verse 1 (it lives on the intro card instead)
  const surahNum = verses[0] ? (verses[0].surah_number || 0) : 0;
  if (verses.length > 0 && verses[0].verse_number === 1) {
    verses[0].arabic = stripBismillah(verses[0].arabic, surahNum);
  }

  // Total includes intro + all verses (even if lazy loaded later)
  totalVerseCards  = verses.length + 1;
  currentCardIndex = 0;

  // ── A: Build intro slide (static surah info) ────────────────────────────
  const introSlide = document.createElement('div');
  introSlide.className = 'verse-slide verse-slide-intro';

  const info = jelajahiSurahInfo;
  const totalVersesDisplay = info ? info.verses : verses.length;
  const surahLabel = info
    ? `Surah ke-${info.number}`
    : '';
  const typeLabel = info ? info.type : '';
  const showBismillah = shouldShowBismillah(surahNum);

  introSlide.innerHTML = `
    <div class="jelajahi-intro">
      <span class="ji-emoji">📜</span>
      ${info ? `<h2 class="ji-name">${escapeHtml(info.name)}</h2>` : ''}
      ${info && info.name_arabic ? `<p class="ji-arabic-name">${escapeHtml(info.name_arabic)}</p>` : ''}
      ${surahLabel ? `<p class="ji-meta">${surahLabel}</p>` : ''}
      <p class="ji-meta">${totalVersesDisplay} Ayat${typeLabel ? ` · ${typeLabel}` : ''}</p>
      ${showBismillah ? `<p class="ji-bismillah">${BISMILLAH_AR}</p>` : ''}
      <div class="swipe-hint-pill ji-hint-pill">Geser untuk mulai baca <span class="swipe-hint-arrow">→</span></div>
    </div>
  `;
  carousel.appendChild(introSlide);

  // ── B: Build first batch of verse slides ──────────────────────────────
  loadNextJelajahiBatch();

  // ── C: Pagination dots or progress bar ────────────────────────────────
  renderDots();
  updateCounter();

  // ── D: Scroll listener ────────────────────────────────────────────────
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // ── E: Hide actions/feedback until last card ────────────────────────────
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // ── F: Start swipe hint sequence ──────────────────────────────────────
  startSwipeHintSequence();
}

function loadNextJelajahiBatch() {
  const carousel = document.getElementById('verses-carousel');
  const end = Math.min(jelajahiLoadedUpTo + JELAJAHI_BATCH_SIZE, jelajahiAllVerses.length);

  for (let i = jelajahiLoadedUpTo; i < end; i++) {
    const slide = document.createElement('div');
    slide.className = 'verse-slide';
    const card = buildVerseCard(jelajahiAllVerses[i], i);
    card.classList.add('card-visible');
    slide.appendChild(card);
    carousel.appendChild(slide);
  }

  jelajahiLoadedUpTo = end;

  // Update dots if new slides added (for short surahs with dots)
  if (!useProgressBar()) {
    // Dots were already rendered for all totalVerseCards, no update needed
  }
}

// ── Verse Carousel Arrow Navigation ──────────────────────────────────────────

function scrollCarouselTo(index) {
  const carousel = document.getElementById('verses-carousel');
  const slideWidth = carousel.offsetWidth;
  carousel.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
}

// ════════════════════════════════════════════════════════════════════════════════
//  AJARKAN ANAKKU — Functions
// ════════════════════════════════════════════════════════════════════════════════

// ── Render Input View ─────────────────────────────────────────────────────────

function renderAjarkanView() {
  renderAjarkanAgePills();
  renderAjarkanPopular();
  renderAjarkanCategories();
  initAjarkanSearch();
  initAjarkanFilter();
}

function renderAjarkanAgePills() {
  document.querySelectorAll('.ak-age-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const age = pill.dataset.age;
      ajarkanAgeGroup = age;
      document.querySelectorAll('.ak-age-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      logEvent(age === 'under7' ? 'ajarkan_age_under7_selected' : 'ajarkan_age_7plus_selected');
      // Remove warning if any
      const warn = document.querySelector('.ak-age-warning');
      if (warn) warn.remove();
    });
  });
}

function renderAjarkanPopular() {
  const container = document.getElementById('ak-popular-pills');
  if (!container) return;
  container.innerHTML = '';
  AJARKAN_POPULAR.forEach(q => {
    const pill = document.createElement('button');
    pill.className = 'ak-popular-pill';
    pill.textContent = q.text;
    pill.addEventListener('click', () => {
      if (!ensureAjarkanAge()) return;
      logEvent('ajarkan_question_selected', { question_id: q.questionId, source: 'popular' });
      fetchAjarkanPreset(q.questionId);
    });
    container.appendChild(pill);
  });
}

function renderAjarkanCategories() {
  const grid = document.getElementById('ak-category-grid');
  if (!grid) return;
  grid.innerHTML = '';
  AJARKAN_CATEGORIES.forEach(cat => {
    const total = cat.subcategories.reduce((s, sc) => s + sc.questions.length, 0);
    const card = document.createElement('button');
    card.className = 'ak-category-card';
    card.innerHTML = `
      <span class="ak-category-emoji">${cat.emoji}</span>
      <span class="ak-category-label">${cat.label}</span>
      <span class="ak-category-count">${total} pertanyaan</span>
    `;
    card.addEventListener('click', () => {
      logEvent('ajarkan_category_tapped', { category: cat.id });
      expandAjarkanCategory(cat.id);
    });
    grid.appendChild(card);
  });
}

function expandAjarkanCategory(catId) {
  ajarkanExpandedCatId = catId;
  const cat = AJARKAN_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const container = document.getElementById('ajarkan-expanded');
  container.innerHTML = `
    <div class="panduan-expanded-inner">
      <button class="panduan-expanded-back" id="ak-expanded-back-btn">
        ${BACK_ARROW_SVG} Kembali
      </button>
      <div class="panduan-expanded-header">
        <span class="panduan-expanded-emoji">${cat.emoji}</span>
        <h3 class="panduan-expanded-title">${cat.label}</h3>
        <p class="panduan-expanded-desc">${cat.subcategories.length} topik</p>
      </div>
      <div class="sub-questions-list" id="ak-subcategory-list"></div>
    </div>
  `;

  const list = container.querySelector('#ak-subcategory-list');
  cat.subcategories.forEach(sub => {
    // Subcategory header
    const header = document.createElement('div');
    header.className = 'ak-subcategory-header';
    header.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-mid);margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.5px;';
    header.textContent = `${sub.name} (${sub.questions.length})`;
    list.appendChild(header);

    // Questions
    sub.questions.forEach(q => {
      const row = document.createElement('button');
      row.className = 'sub-question-row';
      row.innerHTML = `<span>${escapeHtml(q.text)}</span>${CHEVRON_RIGHT_SVG}`;
      row.addEventListener('click', () => {
        if (!ensureAjarkanAge()) return;
        logEvent('ajarkan_question_selected', { question_id: q.id, source: 'category' });
        fetchAjarkanPreset(q.id);
      });
      list.appendChild(row);
    });
  });

  container.classList.remove('hidden');
  container.classList.remove('slide-down');
  container.classList.add('slide-up');

  container.querySelector('#ak-expanded-back-btn').addEventListener('click', collapseAjarkanCategory);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collapseAjarkanCategory() {
  ajarkanExpandedCatId = null;
  const container = document.getElementById('ajarkan-expanded');
  container.classList.remove('slide-up');
  container.classList.add('slide-down');
  setTimeout(() => {
    container.classList.add('hidden');
    container.classList.remove('slide-down');
  }, 250);
}

function ensureAjarkanAge() {
  if (ajarkanAgeGroup) return true;
  // Show warning
  if (!document.querySelector('.ak-age-warning')) {
    const warn = document.createElement('p');
    warn.className = 'ak-age-warning';
    warn.textContent = 'Pilih kelompok usia anak dulu';
    const selector = document.querySelector('.ak-age-selector');
    if (selector) selector.after(warn);
  }
  return false;
}

function initAjarkanSearch() {
  const input   = document.getElementById('ajarkan-input');
  const clear   = document.getElementById('ajarkan-clear');
  const submit  = document.getElementById('ajarkan-submit');
  if (!input || !submit) return;

  input.addEventListener('input', () => {
    const hasText = input.value.trim().length > 0;
    clear.classList.toggle('hidden', !hasText);
    submit.classList.toggle('hidden', !hasText);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    submit.classList.add('hidden');
    input.focus();
  });

  submit.addEventListener('click', () => {
    const query = input.value.trim();
    if (!query) return;
    if (!ensureAjarkanAge()) return;
    logEvent('ajarkan_search_started', { query_length: query.length });
    fetchAjarkanFreeform(query);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit.click();
    }
  });
}

function initAjarkanFilter() {
  const filterInput = document.getElementById('ak-filter-input');
  if (!filterInput) return;

  let filterTimeout;
  filterInput.addEventListener('input', () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      const query = filterInput.value.trim().toLowerCase();
      filterAjarkanQuestions(query);
    }, 200);
  });
}

function filterAjarkanQuestions(query) {
  const grid = document.getElementById('ak-category-grid');
  if (!grid) return;

  if (!query || query.length < 2) {
    // Show categories, hide filtered list
    grid.style.display = '';
    const existing = document.getElementById('ak-filtered-results');
    if (existing) existing.remove();
    return;
  }

  logEvent('ajarkan_question_filtered', { query_length: query.length });

  // Hide category grid
  grid.style.display = 'none';

  // Build flat filtered list
  const matches = [];
  AJARKAN_CATEGORIES.forEach(cat => {
    cat.subcategories.forEach(sub => {
      sub.questions.forEach(q => {
        if (q.text.toLowerCase().includes(query)) {
          matches.push({ ...q, category: cat.label, subcategory: sub.name });
        }
      });
    });
  });

  let container = document.getElementById('ak-filtered-results');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ak-filtered-results';
    container.className = 'ak-filtered-list';
    grid.parentNode.appendChild(container);
  }
  container.innerHTML = '';

  if (matches.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">Tidak ada pertanyaan yang cocok</p>';
    return;
  }

  matches.slice(0, 20).forEach(m => {
    const item = document.createElement('button');
    item.className = 'ak-filtered-item';
    item.innerHTML = `<span>${escapeHtml(m.text)}</span><span class="ak-filtered-cat">${m.subcategory}</span>`;
    item.addEventListener('click', () => {
      if (!ensureAjarkanAge()) return;
      logEvent('ajarkan_question_selected', { question_id: m.id, source: 'filter' });
      fetchAjarkanPreset(m.id);
    });
    container.appendChild(item);
  });

  if (matches.length > 20) {
    const more = document.createElement('p');
    more.style.cssText = 'text-align:center;color:var(--text-muted);font-size:12px;padding:8px;';
    more.textContent = `+${matches.length - 20} pertanyaan lainnya`;
    container.appendChild(more);
  }
}

// ── Fetch Functions ───────────────────────────────────────────────────────────

async function fetchAjarkanPreset(questionId) {
  ajarkanCurrentQId = questionId;
  // Find question text for display
  let questionText = '';
  for (const cat of AJARKAN_CATEGORIES) {
    for (const sub of cat.subcategories) {
      const q = sub.questions.find(q => q.id === questionId);
      if (q) { questionText = q.text; break; }
    }
    if (questionText) break;
  }
  currentFeeling = questionText;
  switchView('verses-view');
  showLoading();

  try {
    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ajarkan',
        questionId,
        ageGroup: ajarkanAgeGroup,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    if (data.error === 'not_available') {
      logEvent('ajarkan_not_available', { question_id: questionId });
      showNotRelevant(data.message || 'Pertanyaan ini belum tersedia. Silakan coba pertanyaan lain.');
    } else {
      logEvent('ajarkan_search_completed', { question_id: questionId, age_group: ajarkanAgeGroup });
      ajarkanCurrentData = data;
      renderAjarkanResults(data);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('ajarkan_search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

async function fetchAjarkanFreeform(query) {
  ajarkanCurrentQId = null;
  currentFeeling = query;
  switchView('verses-view');
  showLoading();

  try {
    const res = await fetch('/api/get-ayat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'ajarkan',
        feeling: query,
        ageGroup: ajarkanAgeGroup,
        freeform: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');

    if (data.error === 'not_available') {
      logEvent('ajarkan_not_available', { query_length: query.length });
      // Show suggestions if available
      if (data.suggestions && data.suggestions.length > 0) {
        showAjarkanSuggestions(data.message, data.suggestions);
      } else {
        showNotRelevant(data.message || 'Pertanyaan ini belum tersedia.');
      }
    } else {
      ajarkanCurrentQId = data.question_id;
      ajarkanCurrentData = data;
      if (data.also_relevant) {
        logEvent('ajarkan_search_partial_match', { question_id: data.question_id });
      } else {
        logEvent('ajarkan_search_completed', { question_id: data.question_id, age_group: ajarkanAgeGroup });
      }
      renderAjarkanResults(data);
    }
  } catch (err) {
    stopLoadingSteps();
    logEvent('ajarkan_search_completed', { outcome: 'error' });
    showError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
  }
}

function showAjarkanSuggestions(message, suggestions) {
  stopLoadingSteps();
  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = `
    <div class="verse-slide">
      <div class="intro-chat">
        <div class="chat-thread">
          <div class="chat-bubble chat-bubble--app">
            <p style="margin-bottom:12px;">${escapeHtml(message)}</p>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Mungkin maksudmu:</p>
            <div id="ak-suggestion-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          </div>
        </div>
        <button class="find-more-btn" id="ak-suggestions-back">← Coba pertanyaan lain</button>
      </div>
    </div>
  `;
  const list = carousel.querySelector('#ak-suggestion-list');
  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'sub-question-row';
    btn.style.cssText = 'font-size:13px;padding:10px 12px;';
    btn.innerHTML = `<span>${escapeHtml(s.text)}</span>${CHEVRON_RIGHT_SVG}`;
    btn.addEventListener('click', () => {
      logEvent('ajarkan_suggestion_tapped', { question_id: s.questionId });
      fetchAjarkanPreset(s.questionId);
    });
    list.appendChild(btn);
  });
  carousel.querySelector('#ak-suggestions-back').addEventListener('click', () => switchView('ajarkan-view'));
}

// ── Result Renderers ──────────────────────────────────────────────────────────

function renderAjarkanResults(data) {
  stopLoadingSteps();
  const carousel = document.getElementById('verses-carousel');
  carousel.innerHTML = '';

  // Ensure pembuka_percakapan is an object (may come as string from DB)
  if (typeof data.pembuka_percakapan === 'string') {
    try { data.pembuka_percakapan = JSON.parse(data.pembuka_percakapan); } catch { data.pembuka_percakapan = {}; }
  }

  const verses = data.ayat || [];
  // Cards: Penjelasan + Ide Ngobrol + Coba Lakukan + N verse cards
  totalVerseCards = 3 + verses.length;
  currentCardIndex = 0;

  // Card 0: Penjelasan
  carousel.appendChild(buildAjarkanPenjelasanCard(data, verses));
  // Card 1: Ide Ngobrol
  carousel.appendChild(buildAjarkanNgobrolCard(data));
  // Card 2: Coba Lakukan
  carousel.appendChild(buildAjarkanAktivitasCard(data));
  // Cards 3-N: Verse cards
  verses.forEach((v, i) => {
    carousel.appendChild(buildAjarkanVerseCard(v, data, i));
  });

  renderDots();
  updateCounter();

  // Set up carousel snapping + scroll listener for index tracking
  setupCarouselSnapping();
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // Hide actions/feedback for ajarkan
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');

  // Typewriter on penjelasan_anak
  const typeEl = document.getElementById('ak-penjelasan-text');
  if (typeEl && data.penjelasan_anak) {
    typewriterActive = true;
    typewriteAjarkan(typeEl, data.penjelasan_anak, 12);
  }
}

function typewriteAjarkan(el, text, speed) {
  el.innerHTML = '';
  let i = 0;
  const cursor = document.createElement('span');
  cursor.className = 'ak-typewriter-cursor';
  el.appendChild(cursor);

  const timer = setInterval(() => {
    if (!typewriterActive) { clearInterval(timer); cursor.remove(); return; }
    if (i < text.length) {
      cursor.before(document.createTextNode(text.charAt(i)));
      i++;
    } else {
      clearInterval(timer);
      setTimeout(() => cursor.remove(), 1200);
    }
  }, speed);
}

function setupCarouselSnapping() {
  const carousel = document.getElementById('verses-carousel');
  let touchStartX = 0, isDragging = false;

  carousel.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  carousel.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      const newIdx = diff > 0
        ? Math.min(currentCardIndex + 1, totalVerseCards - 1)
        : Math.max(currentCardIndex - 1, 0);
      scrollCarouselTo(newIdx);
    }
  }, { passive: true });
}

// ── Card Builders ─────────────────────────────────────────────────────────────

function buildAjarkanPenjelasanCard(data, verses) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';

  const firstVerse = verses[0];
  let verseTeaserHtml = '';
  if (firstVerse) {
    verseTeaserHtml = `
      <div class="ak-verse-teaser">
        <div class="ak-verse-teaser-label">Referensi Ayat</div>
        <div class="ak-verse-teaser-row" data-ak-toggle="vt">
          <span class="ak-verse-teaser-name">${escapeHtml(firstVerse.surah_name || '')} \u2022 Ayat ${firstVerse.ayah || ''}</span>
          <span class="ak-verse-teaser-action">lihat ayat <span class="ak-verse-teaser-chevron">\u25BC</span></span>
        </div>
        <div class="ak-verse-teaser-detail">
          ${firstVerse.verse_relevance ? `<div style="display:flex;gap:8px;margin-bottom:14px;"><span style="font-size:14px;flex-shrink:0;margin-top:2px;">\uD83D\uDCCC</span><span style="font-size:13.5px;font-style:italic;color:var(--text-mid);line-height:1.6;">${escapeHtml(firstVerse.verse_relevance)}</span></div>` : ''}
          <p class="ak-verse-arabic">${firstVerse.arabic || ''}</p>
          <p class="ak-verse-translation">${escapeHtml(firstVerse.translation || '')}</p>
          <div class="ak-action-row">
            <button class="ak-action-btn" data-ak-audio="${firstVerse.surah || ''}:${firstVerse.ayah || ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Dengarkan
            </button>
            <button class="ak-action-btn" data-ak-share="${0}">Bagikan Ayat</button>
          </div>
        </div>
      </div>
    `;
  }

  const ageLabel = (data.age_group === 'under7') ? 'Di bawah 7 tahun' : '7 tahun ke atas';
  const otherAge = (data.age_group === 'under7') ? '7plus' : 'under7';
  const otherLabel = (data.age_group === 'under7') ? 'Ganti ke 7+' : 'Ganti ke <7';

  slide.innerHTML = `
    <div class="ak-age-badge" data-ak-switch-age="${otherAge}" title="${otherLabel}">${ageLabel}</div>
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83E\uDDD2</span> Penjelasan untuk anak</div>
      <h2 class="ak-intro-question">${escapeHtml(data.question_text || currentFeeling)}</h2>
      <div style="position:relative;">
        <span class="ak-explanation-text" id="ak-penjelasan-text"></span>
        <span class="ak-inline-salin" data-ak-copy="penjelasan"><span class="ak-salin-icon">\uD83D\uDCCB</span><span class="ak-salin-tooltip">Tersalin!</span></span>
      </div>
      ${verseTeaserHtml}
    </div></div>
    <div class="ak-swipe-cta" data-ak-goto="1">
      <span class="ak-swipe-cta-icon">\uD83D\uDCAC</span>
      <span class="ak-swipe-cta-text">Ide ngobrol bareng anak</span>
      <span class="ak-swipe-cta-arrow">Geser \u2192</span>
    </div>
  `;

  wireAjarkanCardEvents(slide, data, verses);
  return slide;
}

function buildAjarkanNgobrolCard(data) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';
  const p = data.pembuka_percakapan || {};

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83D\uDCAC</span> Ide ngobrol bareng anak</div>

      <div class="ak-pembuka-opt">
        <div class="ak-approach-label">Mulai dari Pertanyaan</div>
        <div style="position:relative;">
          <span class="ak-pembuka-text">${escapeHtml(p.pertanyaan || '')}</span>
          <span class="ak-inline-salin" data-ak-copy="pertanyaan"><span class="ak-salin-icon">\uD83D\uDCCB</span><span class="ak-salin-tooltip">Tersalin!</span></span>
        </div>
        <p class="ak-panduan-text">${escapeHtml(p.panduan_pertanyaan || '')}</p>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83C\uDF19</span>
          <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
        </div>
      </div>

      <div class="ak-pembuka-opt">
        <div class="ak-approach-label">Mulai dari Cerita</div>
        <div style="position:relative;">
          <span class="ak-pembuka-text">${escapeHtml(p.cerita || '')}</span>
          <span class="ak-inline-salin" data-ak-copy="cerita"><span class="ak-salin-icon">\uD83D\uDCCB</span><span class="ak-salin-tooltip">Tersalin!</span></span>
        </div>
        <p class="ak-panduan-text">${escapeHtml(p.panduan_cerita || '')}</p>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83C\uDF19</span>
          <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
        </div>
      </div>

      <div class="ak-mini-cta" data-ak-goto="2">
        <span class="ak-mini-cta-icon">\u2728</span>
        <span class="ak-mini-cta-text">Coba lakukan bersama anak</span>
        <span class="ak-mini-cta-arrow">\u2192</span>
      </div>
    </div></div>
  `;

  wireAjarkanCardEvents(slide, data);
  return slide;
}

function buildAjarkanAktivitasCard(data) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';
  const p = data.pembuka_percakapan || {};
  const hasVerses = (data.ayat || []).length > 0;

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\u2728</span> Coba lakukan bersama anak</div>
      <div class="ak-activity-box"><p class="ak-activity-text">${data.aktivitas_bersama || ''}</p></div>

      <div class="ak-expand-row" data-ak-expand>
        <span class="ak-expand-row-icon">\uD83C\uDF19</span>
        <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
        <span class="ak-expand-row-chevron">\u25BC</span>
      </div>
      <div class="ak-expand-content">
        <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
      </div>
      <div class="ak-expand-row" data-ak-expand>
        <span class="ak-expand-row-icon">\uD83D\uDCAC</span>
        <span class="ak-expand-row-label">Lihat kalimat pembuka untuk anak</span>
        <span class="ak-expand-row-chevron">\u25BC</span>
      </div>
      <div class="ak-expand-content">
        <p class="ak-xref-approach">Mulai dari Pertanyaan</p>
        <p class="ak-xref-pembuka">${escapeHtml(p.pertanyaan || '')}</p>
        <p class="ak-xref-panduan">${escapeHtml(p.panduan_pertanyaan || '')}</p>
      </div>

      ${hasVerses ? `<div class="ak-mini-cta" data-ak-goto="3">
        <span class="ak-mini-cta-icon">\uD83D\uDCD6</span>
        <span class="ak-mini-cta-text">Referensi ayat pendukung lainnya</span>
        <span class="ak-mini-cta-arrow">\u2192</span>
      </div>` : ''}
    </div></div>
  `;

  wireAjarkanCardEvents(slide, data);
  return slide;
}

function buildAjarkanVerseCard(verse, data, index) {
  const slide = document.createElement('div');
  slide.className = 'verse-slide';
  const p = data.pembuka_percakapan || {};
  // Alternate between pertanyaan and cerita for cross-refs
  const isEven = index % 2 === 0;
  const approachLabel = isEven ? 'Mulai dari Cerita' : 'Mulai dari Pertanyaan';
  const approachText = isEven ? (p.cerita || '') : (p.pertanyaan || '');
  const approachGuide = isEven ? (p.panduan_cerita || '') : (p.panduan_pertanyaan || '');

  slide.innerHTML = `
    <div class="ak-card"><div class="ak-card-body">
      <div class="ak-section-label"><span class="ak-sl-icon">\uD83D\uDCD6</span> Ayat dari Al-Qur'an</div>
      ${verse.verse_relevance ? `
        <div class="ak-verse-relevance">
          <span class="ak-verse-relevance-icon">\uD83D\uDCCC</span>
          <p class="ak-verse-relevance-text">${escapeHtml(verse.verse_relevance)}</p>
        </div>` : ''}
      <div class="ak-verse-row" data-ak-toggle="verse">
        <span class="ak-verse-name">${escapeHtml(verse.surah_name || '')} \u2022 Ayat ${verse.ayah || ''}</span>
        <span class="ak-verse-toggle">lihat ayat <span class="ak-verse-chevron">\u25BC</span></span>
      </div>
      <div class="ak-verse-dropdown">
        <p class="ak-verse-arabic">${verse.arabic || ''}</p>
        <p class="ak-verse-translation">${escapeHtml(verse.translation || '')}</p>
      </div>
      <div class="ak-action-row">
        <button class="ak-action-btn" data-ak-audio="${verse.surah || ''}:${verse.ayah || ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Dengarkan
        </button>
        <button class="ak-action-btn" data-ak-share="${index}">Bagikan Ayat</button>
      </div>
      <div class="ak-verse-refs">
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83C\uDF19</span>
          <span class="ak-expand-row-label">Lihat penjelasan untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${escapeHtml(data.penjelasan_anak || '')}</p>
        </div>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\uD83D\uDCAC</span>
          <span class="ak-expand-row-label">Lihat kalimat pembuka untuk anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-xref-approach">${approachLabel}</p>
          <p class="ak-xref-pembuka">${escapeHtml(approachText)}</p>
          <p class="ak-xref-panduan">${escapeHtml(approachGuide)}</p>
        </div>
        <div class="ak-expand-row" data-ak-expand>
          <span class="ak-expand-row-icon">\u2728</span>
          <span class="ak-expand-row-label">Lihat aktivitas bersama anak</span>
          <span class="ak-expand-row-chevron">\u25BC</span>
        </div>
        <div class="ak-expand-content">
          <p class="ak-expand-text">${data.aktivitas_bersama || ''}</p>
        </div>
      </div>
    </div></div>
  `;

  wireAjarkanCardEvents(slide, data);
  return slide;
}

// ── Card Event Wiring ─────────────────────────────────────────────────────────

function wireAjarkanCardEvents(slide, data, verses) {
  // Expand/collapse rows
  slide.querySelectorAll('[data-ak-expand]').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.toggle('open');
      const content = row.nextElementSibling;
      if (content) content.classList.toggle('open');
    });
  });

  // Verse teaser toggle
  slide.querySelectorAll('[data-ak-toggle="vt"]').forEach(row => {
    row.addEventListener('click', () => {
      const detail = row.nextElementSibling;
      if (detail) detail.classList.toggle('open');
      row.querySelector('.ak-verse-teaser-action')?.classList.toggle('open');
    });
  });

  // Verse dropdown toggle
  slide.querySelectorAll('[data-ak-toggle="verse"]').forEach(row => {
    row.addEventListener('click', () => {
      const dd = row.nextElementSibling;
      if (dd) dd.classList.toggle('open');
      row.querySelector('.ak-verse-toggle')?.classList.toggle('open');
      logEvent('ajarkan_verse_expanded');
    });
  });

  // Inline copy
  slide.querySelectorAll('[data-ak-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.akCopy;
      let text = '';
      if (key === 'penjelasan') text = data.penjelasan_anak || '';
      else if (key === 'pertanyaan') text = (data.pembuka_percakapan || {}).pertanyaan || '';
      else if (key === 'cerita') text = (data.pembuka_percakapan || {}).cerita || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        const tip = btn.querySelector('.ak-salin-tooltip');
        if (tip) tip.classList.add('show');
        logEvent(key === 'penjelasan' ? 'ajarkan_penjelasan_copied' : 'ajarkan_conversation_copied', { key });
        setTimeout(() => {
          btn.classList.remove('copied');
          if (tip) tip.classList.remove('show');
        }, 1400);
      }).catch(() => {});
    });
  });

  // CTAs (goto)
  slide.querySelectorAll('[data-ak-goto]').forEach(el => {
    el.addEventListener('click', () => {
      const target = parseInt(el.dataset.akGoto, 10);
      scrollCarouselTo(target);
      logEvent('ajarkan_card_swiped', { to: target });
    });
  });

  // Audio buttons
  slide.querySelectorAll('[data-ak-audio]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [surah, ayah] = btn.dataset.akAudio.split(':');
      if (surah && ayah) {
        playAudio({ surah: parseInt(surah), ayah: parseInt(ayah) }, btn);
      }
    });
  });

  // Share buttons
  slide.querySelectorAll('[data-ak-share]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.akShare, 10);
      const allVerses = data.ayat || [];
      if (allVerses[idx]) openShareSheet(allVerses[idx]);
    });
  });

  // Age switch badge — tap to toggle age group and re-fetch same question
  slide.querySelectorAll('[data-ak-switch-age]').forEach(badge => {
    badge.addEventListener('click', () => {
      const newAge = badge.dataset.akSwitchAge;
      if (!newAge || !ajarkanCurrentQId) return;
      ajarkanAgeGroup = newAge;
      // Update pills on the ajarkan-view too
      document.querySelectorAll('.ak-age-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.age === newAge);
      });
      logEvent(newAge === 'under7' ? 'ajarkan_age_under7_selected' : 'ajarkan_age_7plus_selected', { source: 'badge' });
      fetchAjarkanPreset(ajarkanCurrentQId);
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Verses-view back button → return to mode parent (or expanded card / juz list)
document.getElementById('back-btn').addEventListener('click', () => {
  if (currentMode === 'jelajahi') {
    if (cameFromMultiResult && jelajahiMultiResults) {
      // Go back to multi-result selection
      cameFromMultiResult = false;
      switchView('jelajahi-view');
      setTimeout(() => showMultiResults(jelajahiMultiResults), 50);
    } else if (lastJuzSurahTapped) {
      // Go back to juz surah list
      switchView('jelajahi-view');
      setTimeout(() => showJuzSurahList(), 50);
    } else {
      switchView('jelajahi-view');
    }
  } else if (currentMode === 'panduan' && expandedCardId) {
    const cardToExpand = expandedCardId;
    switchView('panduan-view');
    setTimeout(() => expandPanduanCard(cardToExpand), 50);
  } else if (currentMode === 'ajarkan') {
    switchView('ajarkan-view');
  } else {
    switchView(currentMode === 'panduan' ? 'panduan-view' : 'selection-view');
  }
});

// Curhat back → landing
document.getElementById('curhat-back-btn').addEventListener('click', () => switchView('landing-view'));

// Panduan back → landing (or collapse expanded card)
document.getElementById('panduan-back-btn').addEventListener('click', () => {
  if (expandedCardId) {
    collapsePanduanCard();
  } else {
    switchView('landing-view');
  }
});

// Ajarkan back → landing (or collapse expanded category)
document.getElementById('ajarkan-back-btn').addEventListener('click', () => {
  if (ajarkanExpandedCatId) {
    collapseAjarkanCategory();
  } else {
    switchView('landing-view');
  }
});

// Jelajahi back → landing (or close juz surah list / multi results)
document.getElementById('jelajahi-back-btn').addEventListener('click', () => {
  if (juzSurahListVisible) {
    hideJuzSurahList();
  } else if (document.getElementById('jelajahi-multi') && !document.getElementById('jelajahi-multi').classList.contains('hidden')) {
    hideMultiResults();
  } else {
    switchView('landing-view');
  }
});

// Verse carousel arrow buttons
document.getElementById('verse-prev').addEventListener('click', () => {
  if (currentCardIndex > 0) scrollCarouselTo(currentCardIndex - 1);
});
document.getElementById('verse-next').addEventListener('click', () => {
  if (currentCardIndex < totalVerseCards - 1) scrollCarouselTo(currentCardIndex + 1);
});

// ── Share Sheet Event Listeners ────────────────────────────────────────────────

// Close sheet on overlay tap
document.getElementById('share-overlay').addEventListener('click', closeShareSheet);

// Close sheet on X button
document.getElementById('share-sheet-close').addEventListener('click', closeShareSheet);

// Swipe-down to dismiss share sheet
{
  const sheet = document.getElementById('share-sheet');
  let startY = 0, currentY = 0, isDragging = false;

  sheet.addEventListener('touchstart', e => {
    // Only start drag if at scroll top (so inner scroll still works)
    if (sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) {
      // Dragging down — prevent pull-to-refresh and translate sheet
      e.preventDefault();
      sheet.style.transform = `translateY(${dy}px)`;
    } else {
      // Dragging up — allow normal scroll, cancel drag
      isDragging = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
  }, { passive: false });

  sheet.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    const dy = currentY - startY;
    sheet.style.transition = '';
    if (dy > 80) {
      // Dragged far enough → close
      closeShareSheet();
    } else {
      // Snap back
      sheet.style.transform = '';
    }
  });
}

// Theme picker
document.getElementById('share-theme-picker').addEventListener('click', e => {
  const pill = e.target.closest('.theme-pill');
  if (!pill) return;
  shareTheme = pill.dataset.theme;
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.toggle('active', p === pill));
  logEvent('share_theme_selected', { theme: shareTheme });
  updateSharePreview();
});

// Content toggles
document.getElementById('share-include-question').addEventListener('change', e => {
  shareIncludeQuestion = e.target.checked;
  updateSharePreview();
});
// Platform buttons
document.querySelectorAll('.share-platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const platform = btn.dataset.platform;
    shareLastPlatform = platform;

    // Update preview aspect ratio
    const preview = document.getElementById('share-preview');
    if (platform === 'ig_story' || platform === 'wa_status') {
      preview.classList.add('ratio-story');
    } else {
      preview.classList.remove('ratio-story');
    }
    updateSharePreview();

    shareToPlatform(platform);
  });
});

initLandingCarousel();
renderEmotionCards();
renderPanduanCards();
renderSurahBrowser();
initSearch();
initPanduanSearch();
initJelajahiSearch();
renderAjarkanView();
initVOTD();
initA2HS();
initAbout();

// ── Service Worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
