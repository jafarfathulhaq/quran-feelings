'use strict';

// ── System Prompt ─────────────────────────────────────────────────────────────
// The verse database is injected dynamically (15 candidates from vector search),
// so the prompt is a template with a {{CANDIDATES}} placeholder.

const PROMPT_CURHAT = `Kamu adalah asisten untuk aplikasi refleksi Al-Qur'an.

Tugasmu BUKAN untuk menghasilkan atau mengarang ayat Al-Qur'an.
Tugasmu HANYA memilih ayat yang paling relevan dari daftar kandidat di bawah ini,
berdasarkan curahan hati pengguna.

ATURAN KRITIS:
1. JANGAN pernah mengarang atau memodifikasi ayat Al-Qur'an.
2. HANYA pilih dari daftar kandidat berikut, menggunakan nilai "id" yang persis sama.
3. Pilih 3–7 ayat. Gunakan 3–4 jika perasaan sederhana/fokus. Gunakan 5–7 jika masalah kompleks dan multi-dimensi. Utamakan kualitas dan relevansi.
4. Pilih ayat yang saling melengkapi — beragam perspektif, bukan tema yang sama berulang.

TUJUAN:
Bantu pengguna merefleksikan diri melalui ayat yang relevan secara emosional DAN situasional.
Bersikap rendah hati. Jangan mengklaim berbicara atas nama Allah. Jangan memberikan fatwa.

═══════════════════════════════════════════
LANGKAH 0 — CEK RELEVANSI (WAJIB DILAKUKAN PERTAMA)
═══════════════════════════════════════════
Aplikasi ini HANYA untuk curahan hati, perasaan, dan situasi kehidupan manusia.

✅ TERIMA input seperti:
• Perasaan/emosi apa pun: sedih, cemas, marah, bersyukur, kosong, bingung, dll.
• Situasi hidup: masalah pekerjaan, keluarga, hubungan, kesehatan, keuangan, rasa bersalah
• Ungkapan vague tapi personal: "aku nggak tau", "capek banget", "hidup terasa berat"
• Pertanyaan eksistensial: "apa tujuan hidupku?", "kenapa aku selalu gagal?"

❌ TOLAK input seperti:
• Pertanyaan faktual/akademik: "siapa presiden Indonesia?", "jelaskan teori relativitas"
• Soal matematika atau logika: "2+2=?", "hitung integral ini"
• Pertanyaan teknis: "cara install Python", "bug di kode saya"
• Teks acak/tidak bermakna: "asdfgh", "tes tes 123", "aaaaaa"
• Perintah atau instruksi yang tidak berkaitan dengan perasaan

Jika input TIDAK RELEVAN, kembalikan LANGSUNG:
{"relevant": false, "message": "<pesan ramah dalam Bahasa Indonesia, maks 2 kalimat, ajak mereka bercerita tentang perasaan mereka>"}

Jika input RELEVAN, lanjutkan ke Langkah 1–3 di bawah.

═══════════════════════════════════════════
LANGKAH 1 — Pahami keadaan pengguna
═══════════════════════════════════════════
Identifikasi:
• Nada emosional mereka (sedih, lelah, cemas, marah, dll.)
• Situasi kehidupan spesifik mereka (mengasuh anak, tekanan kerja, hubungan, kesehatan, rasa bersalah, dll.)
• Apa yang paling mereka butuhkan sekarang (ketenangan, harapan, kesabaran, pengampunan, bimbingan, dll.)

LANGKAH 2 — Pilih ayat terbaik dari kandidat
Prioritaskan: kecocokan situasional > kecocokan emosional > penghiburan umum
Contoh:
• Kelelahan mengasuh anak → ayat tentang parenting, bukan hanya ayat kelelahan umum
• Khawatir soal keuangan → ayat tentang rezeki dan tawakal
• Merasa bersalah → ayat tentang tobat dan pengampunan

⚠️ JIKA pengguna menyebut BEBERAPA masalah berbeda:
Pilih ayat yang masing-masing menjawab dimensi yang BERBEDA — bukan 3 ayat tentang tema sama.
Contoh input "capek merawat ibu sakit, kehabisan uang":
  ✓ 1 ayat tentang birrul walidain / keutamaan merawat orang tua
  ✓ 1 ayat tentang rezeki / tawakal dalam kesulitan finansial
  ✗ HINDARI 3 ayat tentang "ujian/cobaan" generik

LANGKAH 3 — Tulis pesan pembuka singkat (reflection)
Maksimal 40 kata. Dalam Bahasa Indonesia. Lembut, rendah hati, mendukung.
Gunakan frasa seperti: "Semoga ayat-ayat ini bisa menemanimu", "Mungkin ini yang kamu butuhkan sekarang"
JANGAN katakan: "Ini jawaban Allah untukmu", "Allah sedang memberitahumu", "Kamu harus..."

LANGKAH 4 — Tulis resonansi personal untuk setiap ayat (verse_resonance)
Untuk setiap ayat yang kamu pilih, tulis 2–3 kalimat (maks 45 kata) yang:
• Menjelaskan MENGAPA ayat ini relevan dengan situasi SPESIFIK pengguna — bukan penjelasan umum
• Menyebut detail konkret dari curahan hati mereka (situasi, perasaan, atau kekhawatiran yang disebutkan)
• Terasa personal dan hangat, seperti teman yang benar-benar mendengarkan
Gunakan "kamu" bukan "Anda". Nada: teman yang peduli, bukan ceramah.

FORMAT OUTPUT — kembalikan HANYA salah satu dari dua format JSON berikut, tanpa teks tambahan:

Jika input relevan:
{
  "relevant": true,
  "reflection": "...",
  "selected_ids": ["id1", "id2"],
  "verse_resonance": {
    "id1": "Penjelasan personal 2–3 kalimat mengapa ayat ini relevan dengan situasi spesifik pengguna...",
    "id2": "Penjelasan personal untuk ayat kedua jika ada..."
  }
}

Jika input tidak relevan:
{
  "relevant": false,
  "message": "..."
}

selected_ids harus merupakan nilai "id" dari kandidat (contoh: ["31:14", "46:15"]).
verse_resonance harus memiliki entri untuk setiap id di selected_ids.
Jangan pernah mengembalikan selected_ids yang kosong jika relevant: true.

CONTOH NADA verse_resonance:
Baik: "Kamu bilang merasa lelah merawat orang yang sakit sendirian. Ayat ini mengingatkan bahwa setiap tetes keringat yang kamu korbankan untuk orang yang kamu cintai, Allah catat sebagai amal yang mulia."
Buruk: "Ayat ini berbicara tentang kesabaran dan Allah menyukai orang yang sabar."

Daftar kandidat ayat (dipilih melalui pencarian semantik):
{{CANDIDATES}}`;

const PROMPT_PANDUAN = `Kamu adalah asisten panduan hidup Islami berdasarkan Al-Qur'an.

Tugasmu BUKAN untuk menghasilkan atau mengarang ayat Al-Qur'an.
Tugasmu HANYA memilih ayat yang paling relevan dari daftar kandidat di bawah ini,
berdasarkan pertanyaan atau topik yang ditanyakan pengguna.

ATURAN KRITIS:
1. JANGAN pernah mengarang atau memodifikasi ayat Al-Qur'an.
2. HANYA pilih dari daftar kandidat berikut, menggunakan nilai "id" yang persis sama.
3. Pilih 3–7 ayat. Gunakan 3–4 untuk pertanyaan spesifik/sempit. Gunakan 5–7 untuk topik luas yang membutuhkan beberapa perspektif Qur'an. Utamakan relevansi dan akurasi.
4. Pilih ayat yang saling melengkapi — beragam perspektif, bukan tema yang sama berulang.

TUJUAN:
Bantu pengguna memahami panduan Al-Qur'an tentang topik kehidupan yang mereka tanyakan.
Bersikap ilmiah namun mudah dipahami. Jangan memberikan fatwa hukum yang mengikat.
Rujuk konteks Al-Qur'an secara natural dalam penjelasanmu.

═══════════════════════════════════════════
LANGKAH 0 — CEK RELEVANSI (WAJIB DILAKUKAN PERTAMA)
═══════════════════════════════════════════
Mode ini untuk pertanyaan tentang panduan hidup, nilai-nilai Islam, akhlak, dan topik kehidupan.

✅ TERIMA input seperti:
• Pertanyaan tentang hukum/aturan Islam: "bagaimana hukum riba?", "apa panduan tentang hutang?"
• Topik kehidupan: keluarga, pernikahan, rezeki, ibadah, akhlak, pergaulan, akhirat
• Pertanyaan panduan: "bagaimana Islam memandang...", "apa yang Al-Qur'an katakan tentang..."
• Keinginan memperbaiki diri: "ingin lebih dekat Allah", "ingin memperbaiki ibadah"

❌ TOLAK input seperti:
• Pertanyaan faktual/akademik non-Islam: "siapa presiden Indonesia?", "jelaskan teori relativitas"
• Soal matematika atau logika: "2+2=?", "hitung integral ini"
• Pertanyaan teknis: "cara install Python", "bug di kode saya"
• Teks acak/tidak bermakna: "asdfgh", "tes tes 123", "aaaaaa"

Jika input TIDAK RELEVAN, kembalikan LANGSUNG:
{"relevant": false, "message": "<pesan ramah dalam Bahasa Indonesia, maks 2 kalimat, ajak mereka bertanya tentang panduan hidup dalam Islam>"}

Jika input RELEVAN, lanjutkan ke Langkah 1–4 di bawah.

═══════════════════════════════════════════
LANGKAH 1 — Pahami pertanyaan pengguna
═══════════════════════════════════════════
Identifikasi:
• Topik utama yang ditanyakan (ibadah, muamalah, akhlak, keluarga, dll.)
• Aspek spesifik yang ingin dipahami (hukum, hikmah, panduan praktis, motivasi)
• Konteks pertanyaan (apakah ini pertanyaan umum atau situasi spesifik?)

LANGKAH 2 — Pilih ayat terbaik dari kandidat
Prioritaskan: kecocokan topik langsung > konteks terkait > prinsip umum
Contoh:
• Pertanyaan tentang riba → ayat yang langsung membahas riba/transaksi
• Pertanyaan tentang berbakti orang tua → ayat tentang birrul walidain
• Pertanyaan tentang sabar → ayat yang membahas kesabaran dalam konteks yang ditanyakan

⚠️ JIKA pertanyaan menyentuh BEBERAPA aspek berbeda:
Pilih ayat yang masing-masing menjawab aspek yang BERBEDA.

LANGKAH 3 — Tulis penjelasan ringkas (explanation)
Maksimal 60 kata. Dalam Bahasa Indonesia. Informatif, jelas, dan mudah dipahami.
Langsung jawab pertanyaan pengguna berdasarkan ayat yang dipilih.
Gunakan frasa seperti: "Al-Qur'an memberikan panduan tentang...", "Berdasarkan ayat-ayat berikut..."
JANGAN katakan: "Kamu harus...", "Wajib bagi kamu..."

LANGKAH 4 — Tulis relevansi untuk setiap ayat (verse_relevance)
Untuk setiap ayat yang kamu pilih, tulis 2–3 kalimat (maks 55 kata) yang:
• Menjelaskan MENGAPA ayat ini relevan dengan pertanyaan pengguna
• Menyertakan konteks Qur'ani (kapan diturunkan, apa yang dibahas) jika membantu
• Menghubungkan pesan ayat dengan kehidupan praktis
Nada: seperti ustadz/ustadzah yang menjelaskan dengan hangat dan mudah dipahami.

FORMAT OUTPUT — kembalikan HANYA salah satu dari dua format JSON berikut, tanpa teks tambahan:

Jika input relevan:
{
  "relevant": true,
  "explanation": "...",
  "selected_ids": ["id1", "id2"],
  "verse_relevance": {
    "id1": "Penjelasan 2–3 kalimat mengapa ayat ini relevan dengan topik yang ditanyakan...",
    "id2": "Penjelasan untuk ayat kedua jika ada..."
  }
}

Jika input tidak relevan:
{
  "relevant": false,
  "message": "..."
}

selected_ids harus merupakan nilai "id" dari kandidat (contoh: ["2:275", "2:282"]).
verse_relevance harus memiliki entri untuk setiap id di selected_ids.
Jangan pernah mengembalikan selected_ids yang kosong jika relevant: true.

CONTOH NADA verse_relevance:
Baik: "Ayat ini adalah ayat terpanjang dalam Al-Qur'an yang secara khusus membahas tata cara hutang piutang. Allah memerintahkan agar setiap transaksi hutang dicatat dengan jelas dan disaksikan, sebagai perlindungan bagi kedua belah pihak."
Buruk: "Ayat ini membahas tentang hutang."

Daftar kandidat ayat (dipilih melalui pencarian semantik):
{{CANDIDATES}}`;

// ── HyDE Prompts ───────────────────────────────────────────────────────────────
// Two angles attack the embedding space from different directions, increasing
// the chance that the hybrid search surfaces the truly relevant verses.

// Angle 1 — emotional: what the user feels, what comfort/peace they need.
const HYDE_EMOTIONAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema EMOSIONAL dari ayat Al-Qur\'an yang ideal: apa yang dirasakan seseorang, ' +
  'apa yang dibutuhkan secara emosional (ketenangan, harapan, penghiburan, keberanian, dll.), ' +
  'dan pesan hati apa yang relevan untuk kondisi ini. ' +
  'Gunakan kosakata tema Quranic: sabar, tawakal, tobat, syukur, ' +
  'kasih sayang Allah, rahmat, ampunan, tawadhu. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// Angle 2 — situational: the real-life context and practical/spiritual guidance needed.
const HYDE_SITUATIONAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema SITUASIONAL dari ayat Al-Qur\'an yang ideal: konteks kehidupan nyata mereka ' +
  '(keluarga, pekerjaan, keuangan, kesehatan, hubungan, pernikahan, masa depan, dll.), ' +
  'apa yang dibutuhkan secara praktis atau spiritual, ' +
  'dan tema situasional apa yang harus diangkat oleh ayat tersebut. ' +
  'Gunakan kosakata tema Quranic: rezeki, ujian, musibah, amanah, ' +
  'ikhtiar, silaturahmi, doa, berserah diri. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// Angle 3 — divine hope: Allah's promises, ease after hardship, meaning behind trials.
// Catches verses like "with hardship comes ease", "Allah does not burden beyond capacity",
// "call upon Me and I will answer" — the forward-looking, hope-restoring layer.
const HYDE_DIVINE =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema HARAPAN dan JANJI ILAHI dari ayat Al-Qur\'an yang ideal: ' +
  'janji Allah kepada hamba-Nya yang bersabar dan bertawakkal, ' +
  'jaminan bahwa setiap ujian memiliki makna dan akhir yang baik, ' +
  'dan pengingat bahwa Allah tidak pernah meninggalkan hamba-Nya. ' +
  'Gunakan kosakata tema Quranic: kemudahan setelah kesulitan, pertolongan Allah, ' +
  'harapan, ampunan, ketenangan hati, cahaya setelah kegelapan, doa yang dikabulkan. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Panduan HyDE Prompts ─────────────────────────────────────────────────────
// Three angles for Panduan mode: topical, ethical, practical.

// Angle 1 — topical: directly describe the Qur'anic theme.
const HYDE_TOPICAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan untuk panduan hidup. ' +
  'Berdasarkan pertanyaan pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema TOPIKAL dari ayat Al-Qur\'an yang ideal: topik apa yang dibahas langsung, ' +
  'hukum atau aturan apa yang disebutkan, dan konteks spesifik apa yang relevan. ' +
  'Gunakan kosakata tema Quranic: halal, haram, wajib, sunnah, ' +
  'fardhu, muamalah, ibadah, akhlak, syariah. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// Angle 2 — ethical: the underlying moral/ethical principle.
const HYDE_ETHICAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan untuk panduan hidup. ' +
  'Berdasarkan pertanyaan pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema ETIKA dan MORAL dari ayat Al-Qur\'an yang ideal: prinsip moral apa yang mendasari, ' +
  'nilai-nilai apa yang diajarkan, dan hikmah apa yang terkandung. ' +
  'Gunakan kosakata tema Quranic: keadilan, amanah, kejujuran, ' +
  'ihsan, taqwa, birrul walidain, silaturahmi, akhlakul karimah. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// Angle 3 — practical: frame as practical life guidance.
const HYDE_PRACTICAL =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan untuk panduan hidup. ' +
  'Berdasarkan pertanyaan pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema PANDUAN PRAKTIS dari ayat Al-Qur\'an yang ideal: panduan konkret apa yang diberikan, ' +
  'bagaimana menerapkannya dalam kehidupan sehari-hari, ' +
  'dan tindakan nyata apa yang bisa dilakukan. ' +
  'Gunakan kosakata tema Quranic: ikhtiar, tawakkal, istiqamah, ' +
  'hijrah, muhasabah, dzikir, sedekah, infaq. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Intent Decomposition ──────────────────────────────────────────────────────
// Splits multi-dimensional input into up to 3 distinct spiritual needs.
// Enables one targeted HyDE per need instead of all 3 angles blending together.
// Single-need inputs return 1 element → falls back to 3-angle HyDE (no regression).
const DECOMPOSE_CURHAT =
  'Kamu membantu sistem pencarian ayat Al-Qur\'an. ' +
  'Analisis curahan hati pengguna dan identifikasi kebutuhan spiritual yang BERBEDA-BEDA. ' +
  'Keluarkan 1–3 kebutuhan spesifik dalam JSON. Aturan: ' +
  '(1) Maksimal 3. ' +
  '(2) Setiap kebutuhan BERBEDA — bukan variasi dari tema yang sama. ' +
  '(3) Gunakan kosakata Islami spesifik jika ada: ' +
  '    birrul walidain, rezeki, taubat, hijrah, sabar merawat orang sakit, dll. ' +
  '(4) Jika hanya ada 1 inti masalah, kembalikan array 1 elemen. ' +
  'Format output: {"needs":["deskripsi kebutuhan 1","kebutuhan 2","kebutuhan 3"]}';

const DECOMPOSE_PANDUAN =
  'Kamu membantu sistem pencarian ayat Al-Qur\'an untuk panduan hidup. ' +
  'Analisis pertanyaan pengguna dan identifikasi topik atau aspek yang BERBEDA-BEDA. ' +
  'Keluarkan 1–3 topik spesifik dalam JSON. Aturan: ' +
  '(1) Maksimal 3. ' +
  '(2) Setiap topik BERBEDA — bukan variasi dari tema yang sama. ' +
  '(3) Gunakan istilah Islami spesifik jika ada: ' +
  '    riba, zakat, birrul walidain, nikah, muamalah, ibadah, akhlak, dll. ' +
  '(4) Jika hanya ada 1 topik utama, kembalikan array 1 elemen. ' +
  'Format output: {"needs":["deskripsi topik 1","topik 2","topik 3"]}';

// Generates a targeted HyDE system prompt focused on ONE extracted need.
// User message will be the need itself (not the full feeling) to stay focused.
const makeHyDE_need = (need) =>
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  `Fokus KHUSUS pada kebutuhan ini: "${need}". ` +
  'Tulis 2–3 kalimat yang mendeskripsikan tema dan kosakata Quranic dari ayat ideal ' +
  'untuk kebutuhan tersebut secara spesifik. ' +
  'Gunakan kosakata Islami yang tepat dan spesifik untuk tema ini. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Jelajahi Intent Parser Prompt ─────────────────────────────────────────────
const PROMPT_JELAJAHI_INTENT = `You are a Quran surah finder for the TemuQuran app. Given a user's input in Indonesian, Arabic, or English, identify which surah(s) they want to read.

COMPLETE SURAH LIST (number:name(verse_count)):
1:Al-Fatihah(7) 2:Al-Baqarah(286) 3:Ali Imran(200) 4:An-Nisa(176) 5:Al-Ma'idah(120) 6:Al-An'am(165) 7:Al-A'raf(206) 8:Al-Anfal(75) 9:At-Taubah(129) 10:Yunus(109) 11:Hud(123) 12:Yusuf(111) 13:Ar-Ra'd(43) 14:Ibrahim(52) 15:Al-Hijr(99) 16:An-Nahl(128) 17:Al-Isra'(111) 18:Al-Kahf(110) 19:Maryam(98) 20:Ta Ha(135) 21:Al-Anbiya(112) 22:Al-Hajj(78) 23:Al-Mu'minun(118) 24:An-Nur(64) 25:Al-Furqan(77) 26:Asy-Syu'ara'(227) 27:An-Naml(93) 28:Al-Qasas(88) 29:Al-'Ankabut(69) 30:Ar-Rum(60) 31:Luqman(34) 32:As-Sajdah(30) 33:Al-Ahzab(73) 34:Saba'(54) 35:Fatir(45) 36:Ya Sin(83) 37:As-Saffat(182) 38:Sad(88) 39:Az-Zumar(75) 40:Ghafir(85) 41:Fussilat(54) 42:Asy-Syura(53) 43:Az-Zukhruf(89) 44:Ad-Dukhan(59) 45:Al-Jasiyah(37) 46:Al-Ahqaf(35) 47:Muhammad(38) 48:Al-Fath(29) 49:Al-Hujurat(18) 50:Qaf(45) 51:Az-Zariyat(60) 52:At-Tur(49) 53:An-Najm(62) 54:Al-Qamar(55) 55:Ar-Rahman(78) 56:Al-Waqi'ah(96) 57:Al-Hadid(29) 58:Al-Mujadilah(22) 59:Al-Hasyr(24) 60:Al-Mumtahanah(13) 61:As-Saff(14) 62:Al-Jumu'ah(11) 63:Al-Munafiqun(11) 64:At-Tagabun(18) 65:At-Talaq(12) 66:At-Tahrim(12) 67:Al-Mulk(30) 68:Al-Qalam(52) 69:Al-Haqqah(52) 70:Al-Ma'arij(44) 71:Nuh(28) 72:Al-Jinn(28) 73:Al-Muzzammil(20) 74:Al-Muddassir(56) 75:Al-Qiyamah(40) 76:Al-Insan(31) 77:Al-Mursalat(50) 78:An-Naba'(40) 79:An-Nazi'at(46) 80:'Abasa(42) 81:At-Takwir(29) 82:Al-Infitar(19) 83:Al-Mutaffifin(36) 84:Al-Insyiqaq(25) 85:Al-Buruj(22) 86:At-Tariq(17) 87:Al-A'la(19) 88:Al-Gasyiyah(26) 89:Al-Fajr(30) 90:Al-Balad(20) 91:Asy-Syams(15) 92:Al-Lail(21) 93:Ad-Duha(11) 94:Al-Insyirah(8) 95:At-Tin(8) 96:Al-'Alaq(19) 97:Al-Qadr(5) 98:Al-Bayyinah(8) 99:Az-Zalzalah(8) 100:Al-'Adiyat(11) 101:Al-Qari'ah(11) 102:At-Takasur(8) 103:Al-'Asr(3) 104:Al-Humazah(9) 105:Al-Fil(5) 106:Quraisy(4) 107:Al-Ma'un(7) 108:Al-Kausar(3) 109:Al-Kafirun(6) 110:An-Nasr(3) 111:Al-Lahab(5) 112:Al-Ikhlas(4) 113:Al-Falaq(5) 114:An-Nas(6)

Return ONLY valid JSON. Two possible shapes:

SHAPE 1 — Single result (when intent is clear):
{
  "type": "surah" | "ayat" | "ayat_range" | "juz" | "famous_ayat",
  "surah": <number 1-114 or null>,
  "ayah_start": <number or null>,
  "ayah_end": <number or null>,
  "juz": <number 1-30 or null>,
  "surah_name": "<name for display>"
}

SHAPE 2 — Multiple results (when query is descriptive/ambiguous, return 2-3 best matches):
{
  "type": "multi",
  "results": [
    { "surah": <number>, "name": "<surah name>", "verse_count": <number>, "reason": "<short Indonesian reason>" }
  ]
}

Use "multi" when user describes a theme/topic/characteristic that matches multiple surahs.
Use single result when user types a specific surah name (even with typos), specific ayat, or juz.

INSTRUCTIONS:
- Match user input to the closest surah(s) from the list above
- Handle typos and transliteration variants (e.g. "yasiin"→Ya Sin, "ar rohman"→Ar-Rahman, "al bakara"→Al-Baqarah)
- Handle descriptions like "surat tentang Maryam" → Maryam (19)
- Handle characteristics like "surat yang pendek buat sholat" → multi with 2-3 short surahs
- Handle cultural references like "surat yang dibaca malam Jumat" → Al-Kahf (18)
- Handle specific ayat references like "al baqarah ayat 255" → surah 2, ayah 255
- Handle juz references like "juz 30" → juz type

Examples:
- "surat yasin" → { "type": "surah", "surah": 36, "surah_name": "Ya Sin" }
- "yasiin" → { "type": "surah", "surah": 36, "surah_name": "Ya Sin" }
- "ar rohman" → { "type": "surah", "surah": 55, "surah_name": "Ar-Rahman" }
- "al baqarah ayat 255" → { "type": "ayat", "surah": 2, "ayah_start": 255, "ayah_end": 255, "surah_name": "Al-Baqarah" }
- "al baqarah 255-260" → { "type": "ayat_range", "surah": 2, "ayah_start": 255, "ayah_end": 260, "surah_name": "Al-Baqarah" }
- "juz 30" → { "type": "juz", "juz": 30, "surah_name": "Juz 30" }
- "ayatul kursi" → { "type": "famous_ayat", "surah": 2, "ayah_start": 255, "ayah_end": 255, "surah_name": "Al-Baqarah" }
- "surat yang dibaca malam jumat" → { "type": "surah", "surah": 18, "surah_name": "Al-Kahf" }
- "3 ayat terakhir al baqarah" → { "type": "ayat_range", "surah": 2, "ayah_start": 284, "ayah_end": 286, "surah_name": "Al-Baqarah" }
- "surat pendek untuk pemula" → { "type": "multi", "results": [{ "surah": 112, "name": "Al-Ikhlas", "verse_count": 4, "reason": "Surat pendek tentang tauhid, cocok untuk pemula" }, { "surah": 113, "name": "Al-Falaq", "verse_count": 5, "reason": "Surat pendek untuk perlindungan" }, { "surah": 114, "name": "An-Nas", "verse_count": 6, "reason": "Surat pendek untuk berlindung dari godaan" }] }
- "surat tentang kesabaran" → { "type": "multi", "results": [{ "surah": 12, "name": "Yusuf", "verse_count": 111, "reason": "Kisah kesabaran Nabi Yusuf" }, { "surah": 103, "name": "Al-'Asr", "verse_count": 3, "reason": "Wasiat untuk saling menasihati kesabaran" }] }

If the input is not a valid Quran reference, return:
{ "type": "unknown", "error": "Tidak bisa memahami permintaan. Coba ketik nama surah atau ayat." }`;

// ── Result Cache ──────────────────────────────────────────────────────────────
// In-memory, per container instance. Keyed on normalised feeling text.
// A cache hit skips all three API calls (HyDE + embed + GPT selection),
// which is especially valuable for emotion-card searches (fixed strings that
// many users trigger repeatedly: "sedih", "cemas", "bersyukur", etc.).
//
// TTL: 24 h — results are stable over that window.
// Max: 500 entries — at ~2 KB each that is ~1 MB RAM, well within limits.
// Eviction: FIFO (delete the oldest key when the map is full).

const RESULT_CACHE_MAX = 500;
const RESULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const JELAJAHI_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — Quran text is static

const resultCache = new Map(); // normalised_feeling → { payload, expiresAt }

function getCached(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { resultCache.delete(key); return null; }
  return entry.payload;
}

function setCached(key, payload, ttl = RESULT_CACHE_TTL) {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    // FIFO eviction: delete the first (oldest) key
    resultCache.delete(resultCache.keys().next().value);
  }
  resultCache.set(key, { payload, expiresAt: Date.now() + ttl });
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// In-memory, per container instance. Vercel may spin up multiple containers,
// so this is not globally distributed — but it stops loops, rapid hammering,
// and accidental abuse from a single session. For global protection, upgrade
// to Upstash Redis + @upstash/ratelimit.

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX       = 20;              // requests per IP per window
const MAX_INPUT_LEN  = 600;            // max characters in user input

const rateLimitStore = new Map();       // ip → { count, resetAt }
let   cleanupCounter = 0;

function checkRateLimit(ip) {
  const now = Date.now();

  // Periodically evict expired entries to prevent unbounded memory growth
  if (++cleanupCounter % 200 === 0) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null; // allowed
  }
  if (entry.count >= RATE_MAX) return entry.resetAt; // blocked — return reset timestamp
  entry.count++;
  return null; // allowed
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const allowedOrigin = 'https://temuquran.com';
  const origin = req.headers.origin;
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Input validation ────────────────────────────────────────────────────────
  const { feeling, refresh, mode: rawMode, intent: presetIntent } = req.body || {};
  const mode = rawMode === 'panduan' ? 'panduan'
             : rawMode === 'jelajahi' ? 'jelajahi'
             : rawMode === 'ajarkan' ? 'ajarkan'
             : 'curhat';

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  // ── Ajarkan mode — pre-generated content, presets skip rate limit ─────────
  if (mode === 'ajarkan') {
    return handleAjarkan(req, res, { feeling, ip });
  }

  // ── Jelajahi mode — completely different pipeline ─────────────────────────
  if (mode === 'jelajahi') {
    return handleJelajahi(req, res, { feeling, presetIntent, refresh, ip });
  }

  // ── Rate limit check ────────────────────────────────────────────────────────
  const rateLimitReset = checkRateLimit(ip);
  if (rateLimitReset !== null) {
    const minutes = Math.ceil((rateLimitReset - Date.now()) / 60_000);
    return res.status(429).json({
      error: `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`,
    });
  }

  if (!feeling || feeling.trim().length < 2) {
    return res.status(400).json({ error: mode === 'panduan'
      ? 'Tulis pertanyaan tentang panduan hidup.'
      : 'Ceritakan apa yang kamu rasakan.' });
  }
  if (feeling.length > MAX_INPUT_LEN) {
    return res.status(400).json({ error: `Input terlalu panjang (maks ${MAX_INPUT_LEN} karakter).` });
  }

  // ── Result cache check ───────────────────────────────────────────────────────
  // Normalise: trim + collapse whitespace + lower-case.
  // Include mode in cache key to prevent cross-mode cache hits.
  // A hit skips HyDE, embed, vector search, AND the GPT selection call.
  // Pass refresh:true from client to bypass cache and get fresh verse selection.
  const cacheKey = `${mode}:${feeling.trim().replace(/\s+/g, ' ').toLowerCase()}`;
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }
  }

  try {
    const rawFeeling = feeling.trim();

    // ── Step 0.5 + 1: Intent decomposition & HyDE (parallelised) ──────────────
    // For short inputs (< 20 words — all emotion cards, most freeform text),
    // decomposition almost always returns 1 need → skip it entirely to save ~1-2s.
    // For longer inputs, fire decompose AND the 3 default HyDE calls simultaneously.
    // If decompose reveals multi-intent (rare), discard defaults and fire targeted HyDEs.
    // If single-intent or decompose fails → use the already-completed default HyDEs.

    const makeHyDE = (systemContent, userContent) =>
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:       'gpt-4o-mini',
          messages:    [
            { role: 'system', content: systemContent },
            { role: 'user',   content: userContent },
          ],
          max_tokens:  120,
          temperature: 0.3,
        }),
      });

    // Parse HyDE response, fall back to raw feeling on failure (non-blocking)
    const parseHyDE = async (res) => {
      if (!res.ok) return rawFeeling;
      const d = await res.json();
      return d.choices?.[0]?.message?.content?.trim() || rawFeeling;
    };

    const hydeAngles = mode === 'panduan'
      ? [HYDE_TOPICAL, HYDE_ETHICAL, HYDE_PRACTICAL]
      : [HYDE_EMOTIONAL, HYDE_SITUATIONAL, HYDE_DIVINE];
    const hydeFallback = mode === 'panduan' ? HYDE_PRACTICAL : HYDE_DIVINE;

    const wordCount = rawFeeling.split(/\s+/).length;
    const skipDecompose = wordCount < 20;

    let queryEmotional, querySituational, queryDivine;

    if (skipDecompose) {
      // Short input → skip decompose, go straight to 3-angle HyDE (saves ~1-2s)
      const [hydeRes1, hydeRes2, hydeRes3] = await Promise.all([
        makeHyDE(hydeAngles[0], rawFeeling),
        makeHyDE(hydeAngles[1], rawFeeling),
        makeHyDE(hydeAngles[2], rawFeeling),
      ]);
      [queryEmotional, querySituational, queryDivine] = await Promise.all([
        parseHyDE(hydeRes1), parseHyDE(hydeRes2), parseHyDE(hydeRes3),
      ]);
    } else {
      // Longer input → fire decompose + default 3-angle HyDE in parallel
      const [decomposeRes, defaultHyde1, defaultHyde2, defaultHyde3] = await Promise.all([
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model:           'gpt-4o-mini',
            messages:        [
              { role: 'system', content: mode === 'panduan' ? DECOMPOSE_PANDUAN : DECOMPOSE_CURHAT },
              { role: 'user',   content: rawFeeling },
            ],
            response_format: { type: 'json_object' },
            max_tokens:      200,
            temperature:     0.2,
          }),
        }),
        makeHyDE(hydeAngles[0], rawFeeling),
        makeHyDE(hydeAngles[1], rawFeeling),
        makeHyDE(hydeAngles[2], rawFeeling),
      ]);

      // Parse decompose result
      let needs = null;
      try {
        if (decomposeRes.ok) {
          const decompData   = await decomposeRes.json();
          const decompParsed = JSON.parse(decompData.choices?.[0]?.message?.content || '{}');
          const extracted    = decompParsed.needs;
          if (Array.isArray(extracted) && extracted.length >= 1 && extracted.length <= 3) {
            const valid = extracted.filter(n => typeof n === 'string' && n.trim().length > 0);
            if (valid.length >= 1) needs = valid;
          }
        }
      } catch (_) { /* fall through — use default HyDEs */ }

      const isMultiIntent = needs && needs.length > 1;

      if (!isMultiIntent) {
        // Single-intent or decompose failed → use already-completed default HyDEs (zero extra wait)
        [queryEmotional, querySituational, queryDivine] = await Promise.all([
          parseHyDE(defaultHyde1), parseHyDE(defaultHyde2), parseHyDE(defaultHyde3),
        ]);
      } else {
        // Multi-intent (rare) → discard defaults, fire targeted HyDEs per need
        const slots = needs.slice(0, 3);
        while (slots.length < 3) slots.push(null);
        const targetedSlots = slots.map(need =>
          need
            ? [makeHyDE_need(need), need]
            : [hydeFallback,        rawFeeling]
        );
        const [tRes1, tRes2, tRes3] = await Promise.all(
          targetedSlots.map(([system, user]) => makeHyDE(system, user))
        );
        [queryEmotional, querySituational, queryDivine] = await Promise.all([
          parseHyDE(tRes1), parseHyDE(tRes2), parseHyDE(tRes3),
        ]);
      }
    }

    // ── Step 2: Embed all three HyDE descriptions in parallel ────────────
    // text-embedding-3-large with dimensions:1536 keeps the pgvector schema
    // unchanged while delivering significantly richer semantic representation
    // than text-embedding-3-small at the same vector size.
    const makeEmbed = (text) =>
      fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          // text-embedding-3-large at dimensions:1536 — reembed.py was run with
          // the same model so stored vectors and query vectors are in sync.
          model:           'text-embedding-3-large',
          dimensions:      1536,
          input:           text,
          encoding_format: 'float',
        }),
      });

    const [embedRes1, embedRes2, embedRes3] = await Promise.all([
      makeEmbed(queryEmotional),
      makeEmbed(querySituational),
      makeEmbed(queryDivine),
    ]);

    if (!embedRes1.ok || !embedRes2.ok || !embedRes3.ok) {
      const errRes = !embedRes1.ok ? embedRes1 : !embedRes2.ok ? embedRes2 : embedRes3;
      const err    = await errRes.json();
      throw new Error(err.error?.message || 'Embedding API error');
    }

    const [embedData1, embedData2, embedData3] = await Promise.all([
      embedRes1.json(),
      embedRes2.json(),
      embedRes3.json(),
    ]);

    const embedding1 = embedData1.data[0].embedding;
    const embedding2 = embedData2.data[0].embedding;
    const embedding3 = embedData3.data[0].embedding;

    // ── Step 3: Hybrid search — all three embeddings in parallel ──────────
    // match_count 15 per angle; 3×15 = 45 unique candidates, more than
    // enough for GPT to pick 3-7. Lower count reduces Supabase DB load,
    // query latency, and prevents statement timeouts on the free tier.
    const makeSearch = (embedding) =>
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/match_verses_hybrid`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          query_embedding: embedding,
          query_text:      rawFeeling,
          match_count:     15,
        }),
      });

    const [supaRes1, supaRes2, supaRes3] = await Promise.all([
      makeSearch(embedding1),
      makeSearch(embedding2),
      makeSearch(embedding3),
    ]);

    if (!supaRes1.ok || !supaRes2.ok || !supaRes3.ok) {
      const errRes = !supaRes1.ok ? supaRes1 : !supaRes2.ok ? supaRes2 : supaRes3;
      const err    = await errRes.json();
      throw new Error(err.message || 'Vector search error');
    }

    const [results1, results2, results3] = await Promise.all([
      supaRes1.json(),
      supaRes2.json(),
      supaRes3.json(),
    ]);

    const safeR1 = Array.isArray(results1) ? results1 : [];
    const safeR2 = Array.isArray(results2) ? results2 : [];
    const safeR3 = Array.isArray(results3) ? results3 : [];

    if (safeR1.length === 0 && safeR2.length === 0 && safeR3.length === 0) {
      throw new Error('Tidak ada ayat yang cocok ditemukan. Silakan coba lagi.');
    }

    // ── A: Round-robin merge all three result lists, deduplicate by verse ID
    // Emotional → Situational → Divine rotation ensures all angles are
    // represented equally at every rank level. A verse appearing in multiple
    // lists (relevant from several angles) is kept at its first occurrence —
    // the strongest signal — and never counted twice.
    const seenIds    = new Set();
    const candidates = [];
    const maxLen     = Math.max(safeR1.length, safeR2.length, safeR3.length);

    for (let i = 0; i < maxLen; i++) {
      for (const list of [safeR1, safeR2, safeR3]) {
        if (i < list.length && !seenIds.has(list[i].id)) {
          candidates.push(list[i]);
          seenIds.add(list[i].id);
        }
      }
    }

    // ── B: Surah diversity — up to 2 per surah in the candidate pool ───────
    // Was 1-per-surah, which discarded a second relevant verse from a large
    // surah (e.g. Al-Baqarah has 286 verses spanning many themes).
    // Allowing 2 gives GPT more to work with while still encouraging variety.
    // The final output still enforces 1-per-surah.
    const surahCount      = new Map();
    const diverseCandidates = candidates.filter(v => {
      const key   = v.surah_number ?? v.surah_name;
      const count = surahCount.get(key) || 0;
      if (count >= 2) return false;    // B: was >= 1
      surahCount.set(key, count + 1);
      return true;
    });

    // Cap candidates sent to GPT to keep prompt size reasonable
    const TOP_N        = 18;
    const topCandidates = diverseCandidates.slice(0, TOP_N);

    // ── Step 4: GPT-4o selects the best 1–3 from top candidates ──────────
    // D: Upgraded from gpt-4o-mini — better reasoning when distinguishing
    //    close candidates and richer, more empathetic reflection text.
    const DB_FOR_PROMPT = topCandidates.map(v => ({
      id:             v.id,
      surah_name:     v.surah_name,
      verse_number:   v.verse_number,
      translation:    v.translation,
      tafsir_quraish_shihab: v.tafsir_quraish_shihab || null,
    }));

    const promptTemplate = mode === 'panduan' ? PROMPT_PANDUAN : PROMPT_CURHAT;
    const systemPrompt = promptTemplate.replace(
      '{{CANDIDATES}}',
      JSON.stringify(DB_FOR_PROMPT, null, 2)
    );

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        messages:        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: rawFeeling },
        ],
        response_format: { type: 'json_object' },
        temperature:     0.3,
        max_tokens:      mode === 'panduan' ? 1500 : 1200, // 3–7 verses: panduan explanation(60w) + 7×verse_relevance(55w)
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json();
      console.error('OpenAI API error:', err.error?.message);
      throw new Error('Gagal memproses permintaan. Silakan coba lagi.');
    }

    const openaiData = await openaiRes.json();
    const parsed     = JSON.parse(openaiData.choices[0].message.content);

    // ── Relevance gate ─────────────────────────────────────────────────────
    if (parsed.relevant === false) {
      const defaultMsg = mode === 'panduan'
        ? 'Sepertinya itu bukan pertanyaan tentang panduan hidup. Coba tanyakan sesuatu tentang kehidupan sehari-hari dalam Islam.'
        : 'Sepertinya itu bukan curahan hati. Coba ceritakan apa yang sedang kamu rasakan atau hadapi hari ini.';
      const notRelevantPayload = {
        not_relevant: true,
        message: parsed.message || defaultMsg,
      };
      setCached(cacheKey, notRelevantPayload);
      return res.status(200).json(notRelevantPayload);
    }

    if (!parsed.selected_ids || !Array.isArray(parsed.selected_ids) || parsed.selected_ids.length === 0) {
      throw new Error('Format respons tidak valid');
    }

    // ── Step 5: Look up selected verses + fetch tafsir_kemenag ────────────────
    // tafsir_kemenag is not returned by the search RPC (too large for 50
    // candidates). We fetch it here for only the 1-3 selected verses.
    const VERSE_MAP = Object.fromEntries(topCandidates.map(v => [v.id, v]));

    // Final 1-per-surah guard on the output (even if GPT somehow slips one in)
    const seenFinalSurahs = new Set();
    const selectedBase = parsed.selected_ids
      .slice(0, 7)
      .map(id => {
        const v = VERSE_MAP[id];
        if (!v) {
          console.warn(`LLM selected id not in candidates: ${id}`);
          return null;
        }
        return v;
      })
      .filter(Boolean)
      .filter(v => {
        const key = v.surah_name;
        if (seenFinalSurahs.has(key)) return false;
        seenFinalSurahs.add(key);
        return true;
      });

    // Fetch tafsir + asbabun nuzul fields for selected verse ids in one REST call
    let kemenagMap             = {};
    let ibnuKathirMap          = {};
    let ibnuKathirIdMap        = {};
    let asbabunNuzulMap        = {};
    let asbabunNuzulIdMap      = {};
    let tafsirQuraishShihabMap = {};
    let tafsirSummaryJsonbMap  = {};
    if (selectedBase.length > 0) {
      const ids = selectedBase.map(v => v.id).join(',');
      const kRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/quran_verses` +
        `?select=id,tafsir_kemenag,tafsir_ibnu_kathir,tafsir_ibnu_kathir_id,asbabun_nuzul,asbabun_nuzul_id,tafsir_quraish_shihab,tafsir_summary&id=in.(${encodeURIComponent(ids)})`,
        {
          headers: {
            'apikey':        process.env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (kRes.ok) {
        const kRows = await kRes.json();
        kemenagMap             = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_kemenag]));
        ibnuKathirMap          = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_ibnu_kathir]));
        ibnuKathirIdMap        = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_ibnu_kathir_id]));
        asbabunNuzulMap        = Object.fromEntries(kRows.map(r => [r.id, r.asbabun_nuzul]));
        asbabunNuzulIdMap      = Object.fromEntries(kRows.map(r => [r.id, r.asbabun_nuzul_id]));
        tafsirQuraishShihabMap = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_quraish_shihab]));
        tafsirSummaryJsonbMap  = Object.fromEntries(kRows.map(r => [r.id, r.tafsir_summary]));
      }
    }

    // Mode-aware field mapping:
    // Curhat: reflection + verse_resonance → resonance
    // Panduan: explanation + verse_relevance → relevance
    const isPanduan      = mode === 'panduan';
    const perVerseMap    = isPanduan ? (parsed.verse_relevance || {}) : (parsed.verse_resonance || {});
    const perVerseField  = isPanduan ? 'relevance' : 'resonance';
    const summaryText    = isPanduan ? (parsed.explanation || '') : (parsed.reflection || '');

    const ayat = selectedBase.map(v => ({
      id:                    v.id,
      ref:                   `QS. ${v.surah_name} : ${v.verse_number}`,
      surah_name:            v.surah_name,
      surah_number:          v.surah_number,
      verse_number:          v.verse_number,
      arabic:                v.arabic,
      translation:           v.translation,
      [perVerseField]:       perVerseMap[v.id]              || null,
      tafsir_quraish_shihab: tafsirQuraishShihabMap[v.id]  || v.tafsir_quraish_shihab || null,
      tafsir_summary:        tafsirSummaryJsonbMap[v.id]   || null,
      tafsir_kemenag:        kemenagMap[v.id]               || null,
      tafsir_ibnu_kathir:    ibnuKathirMap[v.id]            || null,
      tafsir_ibnu_kathir_id: ibnuKathirIdMap[v.id]          || null,
      asbabun_nuzul:         asbabunNuzulMap[v.id]          || null,
      asbabun_nuzul_id:      asbabunNuzulIdMap[v.id]        || null,
    }));

    if (ayat.length === 0) {
      throw new Error('Gagal menemukan ayat yang relevan. Silakan coba lagi.');
    }

    // Curhat: { reflection, ayat }, Panduan: { explanation, ayat }
    const summaryField = isPanduan ? 'explanation' : 'reflection';
    const successPayload = { [summaryField]: summaryText, ayat };
    setCached(cacheKey, successPayload);
    return res.status(200).json(successPayload);

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: 'Terjadi kesalahan. Silakan coba lagi.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Ajarkan Handler ─────────────────────────────────────────────────────────
// Pre-generated content from ajarkan_queries table.
// Preset path: direct DB lookup by question_id + age_group (no GPT, no rate limit).
// Freeform path: 2-step GPT matcher → find best question → return DB content.
// ══════════════════════════════════════════════════════════════════════════════

const AJARKAN_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — static pre-generated content

/**
 * Hydrate selected_verses JSONB with Arabic text + translation from quran_verses.
 * Uses surah_number/verse_number columns (the actual DB column names).
 */
async function hydrateAjarkanVerses(selectedVerses, supabaseUrl, supabaseKey) {
  if (!selectedVerses || selectedVerses.length === 0) return [];

  const verseFilters = selectedVerses.map(v =>
    `and(surah_number.eq.${v.surah},verse_number.eq.${v.ayah})`
  ).join(',');

  try {
    const versesRes = await fetch(
      `${supabaseUrl}/rest/v1/quran_verses?or=(${verseFilters})&select=surah_number,verse_number,arabic,translation,surah_name`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!versesRes.ok) return selectedVerses.map(sv => ({
      surah: sv.surah, ayah: sv.ayah, surah_name: '', arabic: '', translation: '', verse_relevance: sv.verse_relevance || '',
    }));

    const dbVerses = await versesRes.json();
    return selectedVerses.map(sv => {
      const dbV = dbVerses.find(d => d.surah_number === sv.surah && d.verse_number === sv.ayah) || {};
      return {
        surah: sv.surah,
        ayah: sv.ayah,
        surah_name: dbV.surah_name || '',
        arabic: dbV.arabic || '',
        translation: dbV.translation || '',
        verse_relevance: sv.verse_relevance || '',
      };
    });
  } catch (err) {
    console.error('Failed to hydrate verses:', err);
    return selectedVerses.map(sv => ({
      surah: sv.surah, ayah: sv.ayah, surah_name: '', arabic: '', translation: '', verse_relevance: sv.verse_relevance || '',
    }));
  }
}

async function handleAjarkan(req, res, { feeling, ip }) {
  const { questionId, ageGroup, freeform } = req.body || {};

  // Validate age group
  if (!ageGroup || !['under7', '7plus'].includes(ageGroup)) {
    return res.status(400).json({ error: 'Pilih kelompok usia anak dulu.' });
  }

  try {
    // ── Preset path (no GPT, no rate limit) ────────────────────────────────
    if (questionId && !freeform) {
      const cacheKey = `ajarkan:${questionId}:${ageGroup}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }

      // Query ajarkan_queries table (use service key server-side to bypass RLS)
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

      const queryRes = await fetch(
        `${supabaseUrl}/rest/v1/ajarkan_queries?question_id=eq.${encodeURIComponent(questionId)}&age_group=eq.${encodeURIComponent(ageGroup)}&select=*`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      );

      if (!queryRes.ok) {
        console.error('Ajarkan DB query failed:', queryRes.status);
        return res.status(500).json({ error: 'Gagal memuat data.' });
      }

      const rows = await queryRes.json();
      if (!rows || rows.length === 0) {
        return res.status(200).json({
          error: 'not_available',
          message: 'Pertanyaan ini belum tersedia. Kami sedang menyiapkan kontennya.',
        });
      }

      const row = rows[0];

      // Safety: JSONB fields may be double-encoded as strings
      let selectedVerses = row.selected_verses || [];
      if (typeof selectedVerses === 'string') {
        try { selectedVerses = JSON.parse(selectedVerses); } catch { selectedVerses = []; }
      }
      let pembuka = row.pembuka_percakapan || {};
      if (typeof pembuka === 'string') {
        try { pembuka = JSON.parse(pembuka); } catch { pembuka = {}; }
      }

      // Hydrate verses: fetch Arabic + translation from quran_verses
      const hydratedVerses = await hydrateAjarkanVerses(selectedVerses, supabaseUrl, supabaseKey);

      const payload = {
        mode: 'ajarkan',
        question_id: row.question_id,
        question_text: row.question_text,
        age_group: row.age_group,
        penjelasan_anak: row.penjelasan_anak,
        pembuka_percakapan: pembuka,
        aktivitas_bersama: row.aktivitas_bersama,
        ayat: hydratedVerses,
      };

      setCached(cacheKey, payload, AJARKAN_CACHE_TTL);
      return res.status(200).json(payload);
    }

    // ── Freeform path (GPT matcher, rate limited) ──────────────────────────
    if (!feeling || feeling.trim().length < 2) {
      return res.status(400).json({ error: 'Ketik pertanyaan anak.' });
    }
    if (feeling.length > MAX_INPUT_LEN) {
      return res.status(400).json({ error: `Input terlalu panjang (maks ${MAX_INPUT_LEN} karakter).` });
    }

    // Rate limit for freeform
    const rateLimitReset = checkRateLimit(ip);
    if (rateLimitReset !== null) {
      const minutes = Math.ceil((rateLimitReset - Date.now()) / 60_000);
      return res.status(429).json({
        error: `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`,
      });
    }

    const normalized = feeling.trim().replace(/\s+/g, ' ').toLowerCase();
    const freeformCacheKey = `ajarkan:freeform:${ageGroup}:${normalized}`;
    const cachedFreeform = getCached(freeformCacheKey);
    if (cachedFreeform) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedFreeform);
    }

    // Step 1: GPT matches user query to a question_id
    const matchRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a question matcher for an Islamic children's education app. Given a parent's question about teaching Islam to children, find the most relevant pre-written question from our database.

Our question categories and their subcategory slugs:
- aqidah: siapa-allah, quran-wahyu, malaikat, nabi-rasul, hari-kiamat
- ibadah: sholat, puasa-ramadan, doa, zakat-sedekah, haji-umrah
- akhlak: kejujuran, sabar-syukur, rendah-hati-ikhlas, tanggung-jawab
- kehidupan-takdir: ujian-cobaan, emosi-perasaan
- keluarga-sosial: keluarga-hubungan, situasi-sosial-anak
- alam-rasa-ingin-tahu: alam-ciptaan, rasa-ingin-tahu

Respond in JSON: {"matched_subcategories": ["slug1", "slug2"], "confidence": 0.0-1.0}
Pick 1-2 most relevant subcategory slugs. Confidence = how sure you are that our database has a matching question.`
          },
          { role: 'user', content: feeling }
        ],
      }),
    });

    if (!matchRes.ok) {
      console.error('Ajarkan GPT category match failed:', matchRes.status);
      return res.status(500).json({ error: 'Gagal mencocokkan pertanyaan.' });
    }

    const matchData = await matchRes.json();
    let categoryMatch;
    try {
      categoryMatch = JSON.parse(matchData.choices[0].message.content);
    } catch {
      return res.status(500).json({ error: 'Gagal memproses hasil.' });
    }

    // Sanitize GPT subcategory slugs: trim, lowercase, validate against known set
    const VALID_SUBCATEGORIES = new Set([
      'siapa-allah', 'quran-wahyu', 'malaikat', 'nabi-rasul', 'hari-kiamat',
      'sholat', 'puasa-ramadan', 'doa', 'zakat-sedekah', 'haji-umrah',
      'kejujuran', 'sabar-syukur', 'rendah-hati-ikhlas', 'tanggung-jawab',
      'ujian-cobaan', 'emosi-perasaan',
      'keluarga-hubungan', 'situasi-sosial-anak',
      'alam-ciptaan', 'rasa-ingin-tahu',
    ]);

    // Map category names to their subcategories (in case GPT returns category instead of subcategory)
    const CATEGORY_TO_SUBCATEGORIES = {
      'aqidah': ['siapa-allah', 'quran-wahyu', 'malaikat', 'nabi-rasul', 'hari-kiamat'],
      'ibadah': ['sholat', 'puasa-ramadan', 'doa', 'zakat-sedekah', 'haji-umrah'],
      'akhlak': ['kejujuran', 'sabar-syukur', 'rendah-hati-ikhlas', 'tanggung-jawab'],
      'kehidupan-takdir': ['ujian-cobaan', 'emosi-perasaan'],
      'keluarga-sosial': ['keluarga-hubungan', 'situasi-sosial-anak'],
      'alam-rasa-ingin-tahu': ['alam-ciptaan', 'rasa-ingin-tahu'],
    };

    let matchedSlugs = (categoryMatch.matched_subcategories || [])
      .map(s => String(s).trim().toLowerCase())
      .flatMap(s => {
        // GPT sometimes returns "category/subcategory" format — strip the prefix
        const slug = s.includes('/') ? s.split('/').pop() : s;
        if (VALID_SUBCATEGORIES.has(slug)) return [slug];
        // If GPT returned a category name, expand to all its subcategories
        if (CATEGORY_TO_SUBCATEGORIES[s]) return CATEGORY_TO_SUBCATEGORIES[s];
        if (CATEGORY_TO_SUBCATEGORIES[slug]) return CATEGORY_TO_SUBCATEGORIES[slug];
        return [];
      });
    // Deduplicate
    matchedSlugs = [...new Set(matchedSlugs)];

    if (matchedSlugs.length === 0) {
      console.error('Ajarkan: no valid subcategory slugs from GPT:', JSON.stringify(categoryMatch));
      return res.status(200).json({
        error: 'not_available',
        message: 'Maaf, kami belum punya jawaban untuk pertanyaan ini. Coba pilih dari kategori yang tersedia.',
      });
    }

    console.error('Ajarkan freeform: query="%s", GPT matched slugs=%j, confidence=%s',
      feeling, matchedSlugs, categoryMatch.confidence);

    // Step 2: Get all questions from matched subcategories and ask GPT to pick the best match
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    // Use PostgREST 'in' filter (cleaner than or=() for multi-value match)
    const inFilter = matchedSlugs.map(s => encodeURIComponent(s)).join(',');
    const questionsUrl = `${supabaseUrl}/rest/v1/ajarkan_queries?subcategory=in.(${inFilter})&age_group=eq.${encodeURIComponent(ageGroup)}&select=question_id,question_text,category,subcategory`;

    const questionsRes = await fetch(questionsUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!questionsRes.ok) {
      const errBody = await questionsRes.text().catch(() => '');
      console.error('Ajarkan questions query failed:', questionsRes.status, errBody, 'URL:', questionsUrl);
      return res.status(500).json({ error: 'Gagal memuat pertanyaan.' });
    }

    const availableQuestions = await questionsRes.json();
    if (!availableQuestions || availableQuestions.length === 0) {
      console.error('Ajarkan: DB returned 0 questions for slugs=%j, age=%s', matchedSlugs, ageGroup);
      return res.status(200).json({
        error: 'not_available',
        message: 'Konten untuk kategori ini sedang disiapkan. Coba pertanyaan dari kategori lain.',
      });
    }

    // Step 2: GPT picks best matching question
    const questionList = availableQuestions.map(q => `${q.question_id}: ${q.question_text}`).join('\n');
    const pickRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You match a parent's question to the closest pre-written question from our database.

Available questions:
${questionList}

Respond in JSON:
{
  "best_match": "question_id",
  "confidence": 0.0-1.0,
  "similar": ["id1", "id2", "id3"]
}
- confidence: how well the best match answers the parent's actual question
- similar: up to 3 other relevant question IDs (excluding best_match)`
          },
          { role: 'user', content: feeling }
        ],
      }),
    });

    if (!pickRes.ok) {
      console.error('Ajarkan GPT question pick failed:', pickRes.status);
      return res.status(500).json({ error: 'Gagal mencocokkan pertanyaan.' });
    }

    const pickData = await pickRes.json();
    let pickResult;
    try {
      pickResult = JSON.parse(pickData.choices[0].message.content);
    } catch {
      return res.status(500).json({ error: 'Gagal memproses hasil.' });
    }

    const confidence = pickResult.confidence || 0;

    if (confidence < 0.5) {
      // Low confidence → suggest alternatives
      const suggestions = (pickResult.similar || []).slice(0, 3).map(id => {
        const q = availableQuestions.find(aq => aq.question_id === id);
        return q ? { questionId: q.question_id, text: q.question_text } : null;
      }).filter(Boolean);

      const noMatchPayload = {
        error: 'not_available',
        message: 'Kami belum punya jawaban yang pas untuk pertanyaan ini.',
        suggestions,
      };
      setCached(freeformCacheKey, noMatchPayload, AJARKAN_CACHE_TTL);
      return res.status(200).json(noMatchPayload);
    }

    // Confidence >= 0.5 → fetch the matched content via preset path
    // Recursively call with questionId to reuse the preset logic
    const matchedId = pickResult.best_match;

    // Direct DB fetch for matched question
    const contentRes = await fetch(
      `${supabaseUrl}/rest/v1/ajarkan_queries?question_id=eq.${encodeURIComponent(matchedId)}&age_group=eq.${encodeURIComponent(ageGroup)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const contentRows = contentRes.ok ? await contentRes.json() : [];
    if (!contentRows || contentRows.length === 0) {
      return res.status(200).json({
        error: 'not_available',
        message: 'Konten untuk pertanyaan ini sedang disiapkan.',
      });
    }

    const row = contentRows[0];

    // Safety: JSONB fields may be double-encoded as strings
    let selectedVerses = row.selected_verses || [];
    if (typeof selectedVerses === 'string') {
      try { selectedVerses = JSON.parse(selectedVerses); } catch { selectedVerses = []; }
    }
    let pembuka = row.pembuka_percakapan || {};
    if (typeof pembuka === 'string') {
      try { pembuka = JSON.parse(pembuka); } catch { pembuka = {}; }
    }

    const hydratedVerses = await hydrateAjarkanVerses(selectedVerses, supabaseUrl, supabaseKey);

    const payload = {
      mode: 'ajarkan',
      question_id: row.question_id,
      question_text: row.question_text,
      age_group: row.age_group,
      penjelasan_anak: row.penjelasan_anak,
      pembuka_percakapan: pembuka,
      aktivitas_bersama: row.aktivitas_bersama,
      ayat: hydratedVerses,
    };

    // Add also_relevant suggestions for partial matches (0.5 <= confidence < 0.8)
    if (confidence < 0.8 && pickResult.similar) {
      payload.also_relevant = pickResult.similar.slice(0, 3).map(id => {
        const q = availableQuestions.find(aq => aq.question_id === id);
        return q ? { questionId: q.question_id, text: q.question_text } : null;
      }).filter(Boolean);
    }

    setCached(freeformCacheKey, payload, AJARKAN_CACHE_TTL);
    setCached(`ajarkan:${matchedId}:${ageGroup}`, payload, AJARKAN_CACHE_TTL);
    return res.status(200).json(payload);

  } catch (err) {
    console.error('Ajarkan handler error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan. Silakan coba lagi.' });
  }
}

// ── Jelajahi Handler ────────────────────────────────────────────────────────
// Completely separate pipeline: intent parsing → DB query → return verses.
// No embeddings, no vector search, no GPT-4o selection.
// ══════════════════════════════════════════════════════════════════════════════

async function handleJelajahi(req, res, { feeling, presetIntent, refresh, ip }) {
  let intent = presetIntent || null;
  const isPreset = !!intent;

  // ── A: If typed query, parse intent with gpt-4o-mini (rate-limited) ────────
  if (!intent) {
    if (!feeling || feeling.trim().length < 2) {
      return res.status(400).json({ error: 'Tulis nama surah, ayat, atau juz yang ingin kamu baca.' });
    }
    if (feeling.length > MAX_INPUT_LEN) {
      return res.status(400).json({ error: `Input terlalu panjang (maks ${MAX_INPUT_LEN} karakter).` });
    }

    // Rate limit only typed queries (presets are free)
    const rateLimitReset = checkRateLimit(ip);
    if (rateLimitReset !== null) {
      const minutes = Math.ceil((rateLimitReset - Date.now()) / 60_000);
      return res.status(429).json({
        error: `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`,
      });
    }

    // Cache check
    const cacheKey = `jelajahi:query:${feeling.trim().replace(/\s+/g, ' ').toLowerCase()}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }
    }

    try {
      const intentRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:           'gpt-4o-mini',
          messages:        [
            { role: 'system', content: PROMPT_JELAJAHI_INTENT },
            { role: 'user',   content: feeling.trim() },
          ],
          response_format: { type: 'json_object' },
          max_tokens:      300,
          temperature:     0.1,
        }),
      });

      if (!intentRes.ok) {
        const err = await intentRes.json();
        console.error('Intent parse API error:', err.error?.message);
        throw new Error('Gagal memahami permintaan. Coba lagi.');
      }

      const intentData = await intentRes.json();
      intent = JSON.parse(intentData.choices?.[0]?.message?.content || '{}');

      if (intent.type === 'unknown' || !intent.type) {
        const notRelevantPayload = {
          not_relevant: true,
          message: intent.error || 'Tidak bisa memahami permintaan. Coba ketik nama surah atau ayat.',
        };
        setCached(cacheKey, notRelevantPayload, JELAJAHI_CACHE_TTL);
        return res.status(200).json(notRelevantPayload);
      }
    } catch (error) {
      console.error('Jelajahi intent parse error:', error.message);
      return res.status(500).json({ error: 'Gagal memahami permintaan. Coba lagi.' });
    }
  }

  // ── B: Handle multi-result response (2-3 suggested surahs) ─────────────────
  if (intent.type === 'multi' && Array.isArray(intent.results)) {
    const multiPayload = {
      mode: 'jelajahi',
      type: 'multi',
      results: intent.results.map(r => ({
        surah:       r.surah,
        name:        r.name,
        verse_count: r.verse_count,
        reason:      r.reason,
      })),
    };
    const multiCacheKey = `jelajahi:query:${feeling.trim().replace(/\s+/g, ' ').toLowerCase()}`;
    setCached(multiCacheKey, multiPayload, JELAJAHI_CACHE_TTL);
    return res.status(200).json(multiPayload);
  }

  // ── C: Build cache key from parsed intent ──────────────────────────────────
  const intentCacheKey = intent.type === 'juz'
    ? `jelajahi:juz:${intent.juz}`
    : `jelajahi:${intent.type}:${intent.surah}:${intent.ayah_start || 'all'}`;

  if (!refresh) {
    const cached = getCached(intentCacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }
  }

  // ── C: Execute database query based on intent ──────────────────────────────
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const headers = {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    };

    let dbUrl, verses;

    switch (intent.type) {
      case 'surah': {
        dbUrl = `${supabaseUrl}/rest/v1/quran_verses` +
          `?select=id,surah_number,verse_number,arabic,translation,surah_name,tafsir_quraish_shihab,tafsir_summary,tafsir_kemenag,tafsir_ibnu_kathir,tafsir_ibnu_kathir_id,asbabun_nuzul,asbabun_nuzul_id` +
          `&surah_number=eq.${intent.surah}&order=verse_number.asc`;
        break;
      }
      case 'ayat':
      case 'famous_ayat': {
        dbUrl = `${supabaseUrl}/rest/v1/quran_verses` +
          `?select=id,surah_number,verse_number,arabic,translation,surah_name,tafsir_quraish_shihab,tafsir_summary,tafsir_kemenag,tafsir_ibnu_kathir,tafsir_ibnu_kathir_id,asbabun_nuzul,asbabun_nuzul_id` +
          `&surah_number=eq.${intent.surah}&verse_number=eq.${intent.ayah_start}`;
        break;
      }
      case 'ayat_range': {
        dbUrl = `${supabaseUrl}/rest/v1/quran_verses` +
          `?select=id,surah_number,verse_number,arabic,translation,surah_name,tafsir_quraish_shihab,tafsir_summary,tafsir_kemenag,tafsir_ibnu_kathir,tafsir_ibnu_kathir_id,asbabun_nuzul,asbabun_nuzul_id` +
          `&surah_number=eq.${intent.surah}&verse_number=gte.${intent.ayah_start}&verse_number=lte.${intent.ayah_end}&order=verse_number.asc`;
        break;
      }
      case 'juz': {
        // For juz queries, return a surah list instead of verses
        // (Juz 30 = surahs 78–114; other juz need more complex mapping)
        // For now, only handle Juz 30 (Juz Amma) server-side
        const juzSurahListPayload = {
          mode: 'jelajahi',
          type: 'surah_list',
          juz: intent.juz,
        };
        setCached(intentCacheKey, juzSurahListPayload, JELAJAHI_CACHE_TTL);
        return res.status(200).json(juzSurahListPayload);
      }
      default:
        return res.status(400).json({ error: 'Jenis permintaan tidak dikenali.' });
    }

    const dbRes = await fetch(dbUrl, { headers });
    if (!dbRes.ok) {
      const err = await dbRes.json();
      throw new Error(err.message || 'Database query failed');
    }

    verses = await dbRes.json();

    if (!Array.isArray(verses) || verses.length === 0) {
      return res.status(200).json({
        not_relevant: true,
        message: 'Tidak ditemukan ayat yang cocok. Pastikan nama surah dan nomor ayat benar.',
      });
    }

    // ── D: Build response ─────────────────────────────────────────────────────
    const firstVerse = verses[0];
    const surahInfo = {
      number:          firstVerse.surah_number,
      name:            firstVerse.surah_name || intent.surah_name || `Surah ${firstVerse.surah_number}`,
      total_verses:    verses.length,
    };

    const ayat = verses.map(v => ({
      id:                    v.id,
      ref:                   `QS. ${v.surah_name || surahInfo.name} : ${v.verse_number}`,
      surah_name:            v.surah_name || surahInfo.name,
      surah_number:          v.surah_number,
      verse_number:          v.verse_number,
      arabic:                v.arabic,
      translation:           v.translation,
      tafsir_quraish_shihab: v.tafsir_quraish_shihab || null,
      tafsir_summary:        v.tafsir_summary || null,
      tafsir_kemenag:        v.tafsir_kemenag || null,
      tafsir_ibnu_kathir:    v.tafsir_ibnu_kathir || null,
      tafsir_ibnu_kathir_id: v.tafsir_ibnu_kathir_id || null,
      asbabun_nuzul:         v.asbabun_nuzul || null,
      asbabun_nuzul_id:      v.asbabun_nuzul_id || null,
    }));

    const successPayload = {
      mode: 'jelajahi',
      surah_info: surahInfo,
      ayat,
    };

    setCached(intentCacheKey, successPayload, JELAJAHI_CACHE_TTL);
    return res.status(200).json(successPayload);

  } catch (error) {
    console.error('Jelajahi DB error:', error.message);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan. Silakan coba lagi.' });
  }
}
