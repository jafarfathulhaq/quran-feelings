'use strict';

// ── In-App Browser Detection ───────────────────────────────────────────────────
// Instagram, Facebook, TikTok, and LINE ship their own WebView that blocks
// navigator.share({files}) and blob URL downloads — the two mechanisms the
// share-as-image feature depends on. Detect early so we can warn the user.

const IS_IN_APP_BROWSER = /Instagram|FBAN|FBAV|TikTok|Line\//i.test(navigator.userAgent);

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
  fetch('/api/log-event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event_type: eventType, properties: { ...properties, session_id: SESSION_ID } }),
  }).catch(() => {}); // silently ignore network failures
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
  const steps = currentMode === 'panduan' ? LOADING_STEPS_PANDUAN : LOADING_STEPS_CURHAT;
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

// ── Share as Image ─────────────────────────────────────────────────────────────

async function generateShareImage(verse) {
  await loadHtml2Canvas();
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
  if (verse.tafsir_summary)     tafsirTabs.push({ id: 'quraish', label: 'Quraish Shihab', text: verse.tafsir_summary,     note: 'Tafsir M. Quraish Shihab' });
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

  const tafsirHtml = tafsirTabs.length > 0 ? `
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

  // ── Build asbabun nuzul section (only if data exists) ───────────────────
  const asbabText = verse.asbabun_nuzul_id || verse.asbabun_nuzul;
  const asbabIsId = !!verse.asbabun_nuzul_id;
  const asbabHtml = asbabText ? (() => {
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
        <span class="vc-ref-label">${verse.ref}</span>
        <span class="vc-surah-number">${surahNum}</span>
      </div>
      <p class="vc-arabic-text">${verse.arabic}</p>
    </div>
    <div class="vc-content">
      <p class="vc-translation">"${verse.translation}"</p>
      ${resonanceHtml}
      ${tafsirHtml}
      ${asbabHtml}
      <div class="vc-actions">
        <button class="vc-btn vc-audio-btn">${PLAY_ICON} Dengarkan</button>
        <button class="vc-btn vc-share-btn">${SHARE_ICON} Bagikan</button>
      </div>
    </div>
  `;

  card.querySelector('.vc-audio-btn').addEventListener('click',  e => playAudio(verse, e.currentTarget));
  card.querySelector('.vc-share-btn').addEventListener('click',  () => shareVerse(verse));

  // ── Tafsir accordion toggle ──────────────────────────────────────────────
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
      <p class="intro-swipe-hint" id="intro-swipe-hint" style="display:none;">Geser untuk mulai →</p>
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
      // Show swipe hint
      const hint = document.getElementById('intro-swipe-hint');
      if (hint) hint.style.display = '';
    }
  }

  if (reflection) tick(); else {
    const appBubble = introTextEl.closest('.chat-bubble--app');
    if (appBubble) appBubble.classList.remove('chat-bubble--typing-active');
    typewriterActive = false;
    const hint = document.getElementById('intro-swipe-hint');
    if (hint) hint.style.display = '';
  }

  // ── E: Scroll listener for carousel ─────────────────────────────────────────
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  // ── F: Hide actions/feedback until last card ────────────────────────────────
  document.getElementById('verse-actions').classList.add('hidden');
  document.getElementById('verse-feedback').classList.add('hidden');
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

  // Auto-pause audio when swiping away
  stopCurrentAudio();

  logEvent('verse_swiped', { slide_index: newIndex, total: totalVerseCards });

  // Show actions + feedback when reaching last card
  if (newIndex === totalVerseCards - 1) {
    showVerseActions();
  }
}

function showVerseActions() {
  const actionsEl  = document.getElementById('verse-actions');
  if (!actionsEl.classList.contains('hidden')) return; // already shown

  const parentView = currentMode === 'panduan' ? 'panduan-view' : 'selection-view';
  const moreLabel  = currentMode === 'panduan' ? 'Topik lain' : 'Perasaan lain';
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

function updateCounter() {
  const el = document.getElementById('verse-counter-text');
  if (currentCardIndex === 0) {
    el.textContent = currentMode === 'panduan' ? 'Penjelasan' : 'Refleksi';
  } else {
    el.textContent = `${currentCardIndex} / ${totalVerseCards - 1}`;
  }

  // Disable arrows at edges
  const prevBtn = document.getElementById('verse-prev');
  const nextBtn = document.getElementById('verse-next');
  if (prevBtn) prevBtn.disabled = currentCardIndex === 0;
  if (nextBtn) nextBtn.disabled = currentCardIndex === totalVerseCards - 1;
}

function renderDots() {
  const dotsEl = document.getElementById('verses-dots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < totalVerseCards; i++) {
    const dot = document.createElement('span');
    dot.className = 'verse-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  }
}

function updateDots() {
  const dots = document.querySelectorAll('#verses-dots .verse-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === currentCardIndex));
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
  document.getElementById('verses-dots').innerHTML = '';
  document.getElementById('verse-counter-text').textContent = '';
  carousel.querySelector('#error-back-btn').addEventListener('click', btnAction);
}

function showError(message = 'Terjadi kesalahan. Silakan coba lagi.') {
  const parentView = currentMode === 'panduan' ? 'panduan-view' : 'selection-view';
  showAppBubble(
    `😔 ${escapeHtml(message)}`,
    '← Coba Lagi',
    () => switchView(parentView),
  );
}

function showNotRelevant(message) {
  const parentView = currentMode === 'panduan' ? 'panduan-view' : 'selection-view';
  const btnLabel   = currentMode === 'panduan' ? '← Ajukan pertanyaan lain' : '← Ceritakan perasaanmu';
  showAppBubble(
    `🤔 ${escapeHtml(message)}`,
    btnLabel,
    () => switchView(parentView),
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
          <p class="votd-arabic">${verse.arabic}</p>
          <p class="votd-translation">"${verse.translation}"</p>
          <p class="votd-ref">${ref}</p>
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
  switchView(mode === 'panduan' ? 'panduan-view' : 'selection-view');
}

// ── Landing Carousel Dots ────────────────────────────────────────────────

function initLandingCarousel() {
  const carousel = document.getElementById('landing-carousel');
  const dots     = document.querySelectorAll('#landing-dots .dot');
  if (!carousel || dots.length < 2) return;

  // Card click → selectMode
  carousel.querySelectorAll('.landing-card').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
  });

  // Update dots on scroll
  carousel.addEventListener('scroll', () => {
    const scrollLeft   = carousel.scrollLeft;
    const cardWidth    = carousel.querySelector('.landing-card').offsetWidth;
    const gap          = 12;
    const activeIndex  = Math.round(scrollLeft / (cardWidth + gap));
    dots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));
  }, { passive: true });
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

// ── Verse Carousel Arrow Navigation ──────────────────────────────────────────

function scrollCarouselTo(index) {
  const carousel = document.getElementById('verses-carousel');
  const slideWidth = carousel.offsetWidth;
  carousel.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Verses-view back button → return to mode parent (or expanded card)
document.getElementById('back-btn').addEventListener('click', () => {
  if (currentMode === 'panduan' && expandedCardId) {
    // Go back to panduan-view and re-expand the card
    const cardToExpand = expandedCardId;
    switchView('panduan-view');
    setTimeout(() => expandPanduanCard(cardToExpand), 50);
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

// Verse carousel arrow buttons
document.getElementById('verse-prev').addEventListener('click', () => {
  if (currentCardIndex > 0) scrollCarouselTo(currentCardIndex - 1);
});
document.getElementById('verse-next').addEventListener('click', () => {
  if (currentCardIndex < totalVerseCards - 1) scrollCarouselTo(currentCardIndex + 1);
});

initLandingCarousel();
renderEmotionCards();
renderPanduanCards();
initSearch();
initPanduanSearch();
initVOTD();

// ── Service Worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
