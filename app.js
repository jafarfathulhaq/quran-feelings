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
    : currentMode === 'panduan' ? LOADING_STEPS_PANDUAN : LOADING_STEPS_CURHAT;
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

// ── Jelajahi Presets ──────────────────────────────────────────────────────────
const JELAJAHI_PRESETS = [
  { label: 'Al-Fatihah',   surah: 1,  type: 'surah' },
  { label: 'Ya Sin',       surah: 36, type: 'surah' },
  { label: 'Al-Kahf',      surah: 18, type: 'surah' },
  { label: 'Ar-Rahman',    surah: 55, type: 'surah' },
  { label: 'Al-Waqi\'ah', surah: 56, type: 'surah' },
  { label: 'Al-Mulk',      surah: 67, type: 'surah' },
  { label: 'Maryam',       surah: 19, type: 'surah' },
  { label: 'Al-Insyirah',  surah: 94, type: 'surah' },
  { label: 'Juz Amma',     juz: 30,   type: 'juz'   },
  { label: 'Ayatul Kursi', surah: 2,  ayah: 255, type: 'ayat' },
];

const JUZ_30_SURAHS = SURAH_META.filter(s => s.number >= 78 && s.number <= 114);

const LOADING_STEPS_JELAJAHI = [
  'Membuka Al-Qur\'an...',
  'Mencari ayat...',
  'Mempersiapkan bacaan...',
  'Hampir siap...',
];

const JELAJAHI_BATCH_SIZE = 15;
let jelajahiAllVerses    = [];   // full verse array from API
let jelajahiLoadedUpTo   = 0;    // how many verse slides rendered so far
let jelajahiSurahInfo    = null; // { number, name, name_arabic, verses, type }
let juzSurahListVisible  = false; // whether juz surah list overlay is showing
let lastJuzSurahTapped   = null; // for back-nav from verses to juz list

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
  const { theme, width, height, includeQuestion } = options;
  const el = document.createElement('div');
  el.className = `si-wrap si-theme-${theme}`;
  el.style.width  = width + 'px';
  el.style.height = height + 'px';
  el.style.position = 'absolute';
  el.style.left = '-9999px';

  // Build content — branding header at top, then verse content centered
  let html = '';

  // Branding header (top)
  html += `
    <div class="si-header">
      <span class="si-header-brand">TemuQuran.com</span>
      <span class="si-header-sub">Temukan Jawaban Dalam Al-Qur'an</span>
      <div class="si-header-divider"></div>
    </div>
  `;

  // Optional user feeling/question
  if (includeQuestion && verse._userQuestion) {
    html += `<p class="si-question">"${escapeHtml(verse._userQuestion)}"</p>`;
  }

  // Arabic text
  html += `<p class="si-arabic">${verse.arabic}</p>`;

  // Translation
  html += `<p class="si-translation">"${escapeHtml(verse.translation)}"</p>`;

  // Surah reference
  html += `<span class="si-ref">${escapeHtml(verse.ref)}</span>`;

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

  const dims = getShareDimensions(platform);
  const el = buildShareElement(verse, {
    theme:           shareTheme,
    width:           dims.width / 2, // render at half-size, html2canvas scale: 2 → full res
    height:          dims.height / 2,
    includeQuestion: shareIncludeQuestion,
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
  if (currentMode === 'jelajahi' || !currentFeeling) {
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

// Update the live preview thumbnail (CSS-styled, not canvas)
function updateSharePreview() {
  if (!shareActiveVerse) return;
  const verse   = shareActiveVerse;
  const preview = document.getElementById('share-preview');

  let html = `<div class="si-wrap si-theme-${shareTheme}" style="width:100%;height:100%;position:relative;padding:8% 12%;justify-content:center;">`;

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
  html += `<p class="si-arabic" style="font-size:18px;line-height:1.9;margin-bottom:10px;max-width:92%;">${verse.arabic}</p>`;

  // Translation
  const shortTrans = verse.translation.length > 80
    ? verse.translation.slice(0, 80) + '...'
    : verse.translation;
  html += `<p class="si-translation" style="font-size:9px;line-height:1.6;margin-bottom:8px;">"${escapeHtml(shortTrans)}"</p>`;

  // Ref
  html += `<span class="si-ref" style="font-size:7px;padding:3px 8px;">${escapeHtml(verse.ref)}</span>`;

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
    activePlayBtn.innerHTML = PLAY_ICON + ' Dengarkan ayat';
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
      <button class="vc-share-btn-full">Bagikan Gambar Ayat ini ke Socmed / WA</button>
      <button class="vc-audio-btn-secondary">${PLAY_ICON} Dengarkan ayat</button>
    </div>
  `;

  card.querySelector('.vc-audio-btn-secondary').addEventListener('click', e => playAudio(verse, e.currentTarget));
  card.querySelector('.vc-share-btn-full').addEventListener('click', () => openShareSheet(verse));

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

  if (currentMode === 'jelajahi') {
    // Jelajahi loading: simple centered spinner, no user chat bubble
    carousel.innerHTML = `
      <div class="verse-slide">
        <div class="jelajahi-loading">
          <span class="jl-icon">📜</span>
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
      <p class="intro-swipe-hint" id="intro-swipe-hint" style="display:none;">Geser untuk menemukan ayat →</p>
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
  updateProgressBar();

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
    : currentMode === 'panduan' ? 'panduan-view' : 'selection-view';
  const moreLabel  = currentMode === 'jelajahi' ? 'Surah lain'
    : currentMode === 'panduan' ? 'Topik lain' : 'Perasaan lain';

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
    : currentMode === 'panduan' ? '← Ajukan pertanyaan lain' : '← Ceritakan perasaanmu';
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
  if (mode === 'jelajahi')     switchView('jelajahi-view');
  else if (mode === 'panduan') switchView('panduan-view');
  else                         switchView('selection-view');
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

function renderJelajahiCards() {
  const grid = document.getElementById('jelajahi-grid');
  if (!grid) return;

  grid.innerHTML = JELAJAHI_PRESETS.map(p => {
    const meta = SURAH_META[p.surah ? p.surah - 1 : 0];
    const sub = p.type === 'juz' ? 'Juz 30 · 37 surah'
      : p.type === 'ayat' ? `${meta.number}:${p.ayah} · 1 ayat`
      : `${meta.number} · ${meta.verses} ayat`;
    return `
      <button class="jelajahi-card" data-preset-idx="${JELAJAHI_PRESETS.indexOf(p)}">
        <span class="jc-label">${escapeHtml(p.label)}</span>
        <span class="jc-sub">${sub}</span>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.jelajahi-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = JELAJAHI_PRESETS[parseInt(card.dataset.presetIdx, 10)];
      handleJelajahiPreset(p);
    });
  });
}

function handleJelajahiPreset(preset) {
  if (preset.type === 'juz') {
    logEvent('jelajahi_preset', { type: 'juz', juz: preset.juz, name: preset.label });
    showJuzSurahList();
    return;
  }

  const intent = preset.type === 'ayat'
    ? { type: 'ayat', surah: preset.surah, ayah_start: preset.ayah, ayah_end: preset.ayah }
    : { type: 'surah', surah: preset.surah };

  logEvent('jelajahi_preset', { type: preset.type, surah: preset.surah, name: preset.label });
  lastJuzSurahTapped = null;
  fetchJelajahi(null, intent);
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
      ${info && info.name_arabic ? `<p class="ji-arabic-name">${info.name_arabic}</p>` : ''}
      ${surahLabel ? `<p class="ji-meta">${surahLabel}</p>` : ''}
      <p class="ji-meta">${totalVersesDisplay} Ayat${typeLabel ? ` · ${typeLabel}` : ''}</p>
      ${showBismillah ? `<p class="ji-bismillah">${BISMILLAH_AR}</p>` : ''}
      <p class="ji-hint">Geser untuk mulai baca →</p>
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

// ── Init ──────────────────────────────────────────────────────────────────────

// Verses-view back button → return to mode parent (or expanded card / juz list)
document.getElementById('back-btn').addEventListener('click', () => {
  if (currentMode === 'jelajahi') {
    if (lastJuzSurahTapped) {
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

// Jelajahi back → landing (or close juz surah list)
document.getElementById('jelajahi-back-btn').addEventListener('click', () => {
  if (juzSurahListVisible) {
    hideJuzSurahList();
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
renderJelajahiCards();
initSearch();
initPanduanSearch();
initJelajahiSearch();
initVOTD();

// ── Service Worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
