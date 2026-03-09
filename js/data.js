'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// data.js — Pure data constants (loaded FIRST, no function dependencies)
// ══════════════════════════════════════════════════════════════════════════════

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

const NURI_CONFIG = {
  maxExchanges: 20,              // hard session limit
  contextWindow: 8,              // last N exchanges sent to API
  rateLimit: 20,                 // requests/IP/hour (enforced server-side)
};

const NURI_OPENING_MESSAGES = [
  `Halo! Saya Nuri \u{1F60A} Saya senang banget bisa ngobrol soal Al-Qur'an bareng kamu.\n\nBoleh saya tanya \u2014 ada surah atau ayat yang sering kamu baca tapi penasaran maknanya lebih dalam? Atau kalau nggak, ada tema kehidupan yang kamu pengin tahu kata Al-Qur'an tentangnya?`,
  `Assalamu'alaikum! \u{1F60A} Saya Nuri, teman ngobrol Al-Qur'an kamu.\n\nApa yang lagi di pikiran kamu hari ini? Bisa soal ayat tertentu, atau tema apa aja \u2014 sabar, rezeki, keluarga, apa pun. Yuk ngobrol!`,
  `Halo! Nuri di sini \u{1F4D6} Siap ngobrol soal Al-Qur'an bareng kamu.\n\nMau mulai dari mana? Bisa dari surah favorit kamu, atau kalau ada pertanyaan soal kehidupan yang pengin kamu cari jawabannya di Al-Qur'an \u2014 langsung aja!`,
];

// Theme config for share image backgrounds (used by html2canvas)
const SHARE_THEME_BG = { light: '#FFFFFF', dark: '#1A1D2E', classic: '#F5EFE0' };

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

const BACK_ARROW_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`;
const CHEVRON_RIGHT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

const DAILY_ROTATE_MS        = 4000;
const DAILY_HEADER_ROTATE_MS = 3000;

const VAPID_PUBLIC_KEY = 'BKSz_3Z4dVpGuwI3W5i2sFtt8HfvJpJvJsjGoL_P2pRTS1FH__D7NiOdZerX2Tv7rL9epRjpBBVYxJsJS8FF-mE';

const NOTIFY_TIME_OPTIONS = [
  { label: 'Subuh  ~05:00', hour: 5 },
  { label: 'Pagi   ~07:00', hour: 7 },
  { label: 'Siang  ~12:00', hour: 12 },
  { label: 'Malam  ~20:00', hour: 20 },
  { label: 'Isya   ~21:00', hour: 21 },
];

const DEFAULT_SHARE_PREFS = {
  feeling:     true,
  arabic:      true,
  translation: true,
  reference:   true,
  reflection:  false,
  tafsir:      false,   // false | 'ringkasan' | 'lengkap'
};

const JELAJAHI_BATCH_SIZE = 15;

const CLIENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CLIENT_CACHE_MAX = 30;                   // max entries (~3-5 KB each ≈ ~150 KB)
const CLIENT_CACHE_PREFIX = 'tq_c_';

// Belajar onboarding recommendation constants extracted in belajar.js
