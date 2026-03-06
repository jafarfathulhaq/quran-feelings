'use strict';

/**
 * GET /api/generate-daily-content
 *
 * Vercel Cron — runs daily at 00:05 WIB (17:05 UTC).
 * Generates one row in `daily_content` for today's date (WIB).
 * Idempotent: skips if today's row already exists.
 *
 * Pipeline (simplified single-angle HyDE):
 *   feeling → 1 HyDE → embed → vector search → GPT pick 1 verse + reflection
 *   topic   → 1 HyDE → embed → vector search → GPT pick 1 verse + explanation
 *   surah   → deterministic rotation (day-of-year mod 114)
 *   ajarkan → deterministic rotation (day-of-year mod curated list)
 */

const { createClient } = require('@supabase/supabase-js');

// ── Curated Content Pools ────────────────────────────────────────────────────

const FEELINGS = [
  { label: 'Sedih',           emoji: '🌧️', feeling: 'Aku merasa sangat sedih dan patah hati' },
  { label: 'Cemas',           emoji: '😰', feeling: 'Aku merasa sangat cemas dan khawatir tentang masa depan' },
  { label: 'Putus Asa',       emoji: '🌑', feeling: 'Aku merasa putus asa dan sudah tidak ada harapan lagi' },
  { label: 'Bersyukur',       emoji: '✨', feeling: 'Aku merasa sangat bersyukur dan ingin mengungkapkan rasa terima kasih kepada Allah' },
  { label: 'Marah',           emoji: '🌋', feeling: 'Aku merasa sangat marah dan frustrasi, sulit mengendalikan emosi' },
  { label: 'Kesepian',        emoji: '🌙', feeling: 'Aku merasa sangat kesepian dan sendirian, tidak ada yang memahami aku' },
  { label: 'Kebingungan',     emoji: '🧭', feeling: 'Aku merasa bingung dan kehilangan arah tujuan hidup' },
  { label: 'Stres',           emoji: '⚡', feeling: 'Aku merasa sangat stres dan kelelahan, beban hidup terasa terlalu berat' },
  { label: 'Bersalah',        emoji: '🍂', feeling: 'Aku merasa sangat bersalah dan menyesal atas perbuatanku, ingin bertobat' },
  { label: 'Iri Hati',        emoji: '🌿', feeling: 'Aku merasa iri hati melihat orang lain, sulit bersyukur dengan apa yang aku miliki' },
  { label: 'Rindu',           emoji: '💭', feeling: 'Aku merasa sangat rindu dan kehilangan seseorang yang sangat berarti bagiku' },
  { label: 'Kecewa',          emoji: '🌫️', feeling: 'Aku merasa sangat kecewa karena harapan dan ekspektasiku tidak terwujud' },
  { label: 'Takut',           emoji: '🌪️', feeling: 'Aku merasa sangat takut dan tidak berani menghadapi sesuatu yang ada di depanku' },
  // Additional feelings beyond the 13 emotion cards
  { label: 'Lelah',           emoji: '😮‍💨', feeling: 'Aku merasa sangat lelah dan kehabisan tenaga, ingin istirahat dari segalanya' },
  { label: 'Hampa',           emoji: '🕳️', feeling: 'Aku merasa hampa dan kosong di dalam hati, tidak ada yang membuat aku semangat' },
  { label: 'Malu',            emoji: '😳', feeling: 'Aku merasa sangat malu karena perbuatanku diketahui orang lain' },
  { label: 'Tidak Dihargai',  emoji: '💔', feeling: 'Aku merasa tidak dihargai oleh orang-orang di sekitarku' },
  { label: 'Tertekan',        emoji: '🏋️', feeling: 'Aku merasa sangat tertekan oleh ekspektasi keluarga dan masyarakat' },
  { label: 'Gelisah',         emoji: '😟', feeling: 'Aku merasa gelisah dan tidak tenang, pikiranku terus melayang ke mana-mana' },
  { label: 'Terharu',         emoji: '🥹', feeling: 'Aku merasa sangat terharu dan tersentuh oleh kebaikan seseorang' },
  { label: 'Sabar',           emoji: '🌱', feeling: 'Aku sedang berusaha bersabar menghadapi ujian yang berat ini' },
  { label: 'Tenang',          emoji: '🌊', feeling: 'Aku merasa tenang dan damai setelah melewati masa sulit' },
  { label: 'Semangat',        emoji: '🔥', feeling: 'Aku merasa penuh semangat dan ingin berbuat lebih banyak kebaikan' },
  { label: 'Lega',            emoji: '😌', feeling: 'Aku merasa sangat lega karena masalah yang lama akhirnya selesai' },
  { label: 'Khawatir Keluarga', emoji: '👨‍👩‍👧', feeling: 'Aku sangat khawatir tentang keluargaku dan masa depan anak-anakku' },
  { label: 'Ditinggalkan',    emoji: '🚶', feeling: 'Aku merasa ditinggalkan dan diabaikan oleh orang yang aku sayangi' },
  { label: 'Overwhelmed',     emoji: '🌀', feeling: 'Aku merasa kewalahan menghadapi terlalu banyak masalah sekaligus' },
  { label: 'Rasa Kehilangan', emoji: '🥀', feeling: 'Aku merasa sangat kehilangan seseorang yang sudah tiada' },
  { label: 'Harap',           emoji: '🌤️', feeling: 'Aku berharap dan berdoa agar sesuatu yang aku impikan menjadi kenyataan' },
  { label: 'Tidak Percaya Diri', emoji: '🪞', feeling: 'Aku merasa tidak percaya diri dan selalu merasa kurang dibanding orang lain' },
];

const TOPICS = [
  { label: 'Ingin Ibadah Lebih Baik',    emoji: '🕌', query: 'Saya ingin memperbaiki dan meningkatkan kualitas ibadah saya' },
  { label: 'Ingin Lebih Dekat Allah',     emoji: '🤲', query: 'Saya ingin memperdalam hubungan saya dengan Allah melalui doa dan dzikir' },
  { label: 'Ingin Bertaubat',             emoji: '❤️‍🩹', query: 'Saya ingin bertaubat dan kembali ke jalan yang benar' },
  { label: 'Menjaga Hati & Niat',         emoji: '🪞', query: 'Saya ingin menjaga keikhlasan dan kebersihan niat dalam hidup' },
  { label: 'Halal atau Haram?',           emoji: '⚖️', query: 'Saya ingin memahami batasan halal dan haram dalam kehidupan sehari-hari' },
  { label: 'Rezeki & Harta',              emoji: '💰', query: 'Saya mencari panduan tentang rezeki halal, sedekah, dan pengelolaan harta' },
  { label: 'Menjaga Keluarga',            emoji: '👨‍👩‍👧', query: 'Saya ingin panduan membangun dan menjaga keharmonisan keluarga' },
  { label: 'Mempersiapkan Pernikahan',    emoji: '💍', query: 'Saya ingin panduan tentang pernikahan menurut Al-Qur\'an' },
  { label: 'Bergaul dengan Baik',         emoji: '🤝', query: 'Saya ingin panduan berakhlak baik dan menjaga hubungan dengan sesama' },
  { label: 'Mengingat Akhirat',           emoji: '🌙', query: 'Saya ingin merenungkan kehidupan akhirat dan mempersiapkan diri' },
  // Additional topics beyond the 10 panduan presets
  { label: 'Sabar',                       emoji: '🌱', query: 'Saya ingin memahami makna sabar menurut Al-Qur\'an dan bagaimana menerapkannya' },
  { label: 'Syukur',                      emoji: '🙏', query: 'Saya ingin belajar cara bersyukur yang benar menurut ajaran Islam' },
  { label: 'Tawakkal',                    emoji: '🤲', query: 'Saya ingin memahami arti tawakkal dan berserah diri kepada Allah' },
  { label: 'Ikhlas',                      emoji: '💎', query: 'Saya ingin belajar ikhlas dalam beramal dan berbuat kebaikan' },
  { label: 'Doa',                         emoji: '🕊️', query: 'Saya ingin panduan tentang adab berdoa dan doa-doa penting dalam Al-Qur\'an' },
  { label: 'Sedekah',                     emoji: '🎁', query: 'Saya ingin memahami keutamaan sedekah dan infak menurut Al-Qur\'an' },
  { label: 'Waktu',                       emoji: '⏳', query: 'Saya ingin panduan menghargai waktu dan menggunakannya dengan bijak' },
  { label: 'Ilmu',                        emoji: '📖', query: 'Saya ingin memahami pentingnya mencari ilmu dalam Islam' },
  { label: 'Kesehatan',                   emoji: '🏥', query: 'Saya ingin panduan menjaga kesehatan jasmani dan rohani menurut Islam' },
  { label: 'Ujian Hidup',                 emoji: '⛰️', query: 'Saya ingin memahami hikmah di balik ujian dan cobaan hidup' },
  { label: 'Kematian',                    emoji: '🕯️', query: 'Saya ingin merenungkan tentang kematian dan kehidupan setelahnya' },
  { label: 'Kejujuran',                   emoji: '✅', query: 'Saya ingin panduan tentang pentingnya kejujuran dan amanah' },
  { label: 'Keadilan',                    emoji: '⚖️', query: 'Saya ingin memahami prinsip keadilan menurut Al-Qur\'an' },
  { label: 'Kasih Sayang',                emoji: '💕', query: 'Saya ingin memahami kasih sayang Allah dan sesama menurut Al-Qur\'an' },
  { label: 'Keberanian',                  emoji: '🦁', query: 'Saya ingin panduan tentang keberanian dan keteguhan hati dalam Islam' },
  { label: 'Pengampunan',                 emoji: '🕊️', query: 'Saya ingin memahami pentingnya memberi dan meminta maaf dalam Islam' },
  { label: 'Pemimpin',                    emoji: '👑', query: 'Saya ingin panduan tentang kepemimpinan yang baik menurut Al-Qur\'an' },
  { label: 'Lingkungan',                  emoji: '🌍', query: 'Saya ingin memahami tanggung jawab menjaga lingkungan menurut Islam' },
  { label: 'Kerja Keras',                 emoji: '💪', query: 'Saya ingin panduan tentang etos kerja dan usaha menurut Al-Qur\'an' },
  { label: 'Harapan',                     emoji: '🌈', query: 'Saya ingin menemukan ayat tentang harapan dan optimisme dalam Islam' },
];

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
  { number: 14, name: 'Ibrahim', name_arabic: 'ابراهيم', verses: 52, type: 'Makkiyyah' },
  { number: 15, name: 'Al-Hijr', name_arabic: 'الحجر', verses: 99, type: 'Makkiyyah' },
  { number: 16, name: 'An-Nahl', name_arabic: 'النحل', verses: 128, type: 'Makkiyyah' },
  { number: 17, name: 'Al-Isra', name_arabic: 'الإسراء', verses: 111, type: 'Makkiyyah' },
  { number: 18, name: 'Al-Kahf', name_arabic: 'الكهف', verses: 110, type: 'Makkiyyah' },
  { number: 19, name: 'Maryam', name_arabic: 'مريم', verses: 98, type: 'Makkiyyah' },
  { number: 20, name: 'Ta Ha', name_arabic: 'طه', verses: 135, type: 'Makkiyyah' },
  { number: 21, name: 'Al-Anbiya', name_arabic: 'الأنبياء', verses: 112, type: 'Makkiyyah' },
  { number: 22, name: 'Al-Hajj', name_arabic: 'الحج', verses: 78, type: 'Madaniyyah' },
  { number: 23, name: 'Al-Mu\'minun', name_arabic: 'المؤمنون', verses: 118, type: 'Makkiyyah' },
  { number: 24, name: 'An-Nur', name_arabic: 'النور', verses: 64, type: 'Madaniyyah' },
  { number: 25, name: 'Al-Furqan', name_arabic: 'الفرقان', verses: 77, type: 'Makkiyyah' },
  { number: 26, name: 'Asy-Syu\'ara', name_arabic: 'الشعراء', verses: 227, type: 'Makkiyyah' },
  { number: 27, name: 'An-Naml', name_arabic: 'النمل', verses: 93, type: 'Makkiyyah' },
  { number: 28, name: 'Al-Qasas', name_arabic: 'القصص', verses: 88, type: 'Makkiyyah' },
  { number: 29, name: 'Al-Ankabut', name_arabic: 'العنكبوت', verses: 69, type: 'Makkiyyah' },
  { number: 30, name: 'Ar-Rum', name_arabic: 'الروم', verses: 60, type: 'Makkiyyah' },
  { number: 31, name: 'Luqman', name_arabic: 'لقمان', verses: 34, type: 'Makkiyyah' },
  { number: 32, name: 'As-Sajdah', name_arabic: 'السجدة', verses: 30, type: 'Makkiyyah' },
  { number: 33, name: 'Al-Ahzab', name_arabic: 'الأحزاب', verses: 73, type: 'Madaniyyah' },
  { number: 34, name: 'Saba', name_arabic: 'سبأ', verses: 54, type: 'Makkiyyah' },
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
  { number: 78, name: 'An-Naba', name_arabic: 'النبأ', verses: 40, type: 'Makkiyyah' },
  { number: 79, name: 'An-Nazi\'at', name_arabic: 'النازعات', verses: 46, type: 'Makkiyyah' },
  { number: 80, name: 'Abasa', name_arabic: 'عبس', verses: 42, type: 'Makkiyyah' },
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
  { number: 94, name: 'Asy-Syarh', name_arabic: 'الشرح', verses: 8, type: 'Makkiyyah' },
  { number: 95, name: 'At-Tin', name_arabic: 'التين', verses: 8, type: 'Makkiyyah' },
  { number: 96, name: 'Al-Alaq', name_arabic: 'العلق', verses: 19, type: 'Makkiyyah' },
  { number: 97, name: 'Al-Qadr', name_arabic: 'القدر', verses: 5, type: 'Makkiyyah' },
  { number: 98, name: 'Al-Bayyinah', name_arabic: 'البينة', verses: 8, type: 'Madaniyyah' },
  { number: 99, name: 'Az-Zalzalah', name_arabic: 'الزلزلة', verses: 8, type: 'Madaniyyah' },
  { number: 100, name: 'Al-Adiyat', name_arabic: 'العاديات', verses: 11, type: 'Makkiyyah' },
  { number: 101, name: 'Al-Qari\'ah', name_arabic: 'القارعة', verses: 11, type: 'Makkiyyah' },
  { number: 102, name: 'At-Takasur', name_arabic: 'التكاثر', verses: 8, type: 'Makkiyyah' },
  { number: 103, name: 'Al-Asr', name_arabic: 'العصر', verses: 3, type: 'Makkiyyah' },
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
  { number: 114, name: 'An-Nas', name_arabic: 'الناس', verses: 6, type: 'Madaniyyah' },
];

// 30 curated Ajarkan questions (diverse across 7 categories)
const CURATED_AJARKAN = [
  { id: 'siapa-allah-01', text: 'Siapa itu Allah?', category: 'Aqidah', emoji: '🤲' },
  { id: 'siapa-allah-03', text: 'Kenapa kita tidak bisa lihat Allah?', category: 'Aqidah', emoji: '🤲' },
  { id: 'siapa-allah-06', text: 'Apakah Allah sayang kepada kita?', category: 'Aqidah', emoji: '🤲' },
  { id: 'siapa-allah-07', text: 'Kenapa Allah menciptakan kita?', category: 'Aqidah', emoji: '🤲' },
  { id: 'quran-wahyu-01', text: 'Apa itu Al-Qur\'an?', category: 'Aqidah', emoji: '🤲' },
  { id: 'quran-wahyu-03', text: 'Kenapa kita harus baca Al-Qur\'an?', category: 'Aqidah', emoji: '🤲' },
  { id: 'sholat-01', text: 'Kenapa kita harus sholat?', category: 'Ibadah', emoji: '🕌' },
  { id: 'sholat-03', text: 'Apa yang terjadi kalau kita tidak sholat?', category: 'Ibadah', emoji: '🕌' },
  { id: 'puasa-01', text: 'Kenapa kita harus puasa?', category: 'Ibadah', emoji: '🕌' },
  { id: 'puasa-03', text: 'Apakah Allah bangga kalau kita puasa?', category: 'Ibadah', emoji: '🕌' },
  { id: 'doa-dzikir-01', text: 'Apa itu doa?', category: 'Ibadah', emoji: '🕌' },
  { id: 'doa-dzikir-05', text: 'Apakah doa kita pasti dikabulkan?', category: 'Ibadah', emoji: '🕌' },
  { id: 'jujur-01', text: 'Kenapa kita harus jujur?', category: 'Akhlak', emoji: '💖' },
  { id: 'sabar-01', text: 'Apa itu sabar?', category: 'Akhlak', emoji: '💖' },
  { id: 'berbagi-01', text: 'Kenapa kita harus berbagi?', category: 'Akhlak', emoji: '💖' },
  { id: 'hormat-ortu-01', text: 'Kenapa kita harus hormat kepada orang tua?', category: 'Akhlak', emoji: '💖' },
  { id: 'nabi-01', text: 'Siapa itu Nabi Muhammad?', category: 'Sirah', emoji: '🌟' },
  { id: 'nabi-03', text: 'Apa ajaran paling penting dari Nabi Muhammad?', category: 'Sirah', emoji: '🌟' },
  { id: 'nabi-ibrahim-01', text: 'Siapa itu Nabi Ibrahim?', category: 'Sirah', emoji: '🌟' },
  { id: 'nabi-musa-01', text: 'Siapa itu Nabi Musa?', category: 'Sirah', emoji: '🌟' },
  { id: 'surga-neraka-01', text: 'Apa itu surga?', category: 'Akhirat', emoji: '🌅' },
  { id: 'surga-neraka-02', text: 'Apa itu neraka?', category: 'Akhirat', emoji: '🌅' },
  { id: 'surga-neraka-03', text: 'Bagaimana caranya masuk surga?', category: 'Akhirat', emoji: '🌅' },
  { id: 'malaikat-01', text: 'Apa itu malaikat?', category: 'Aqidah', emoji: '🤲' },
  { id: 'alam-01', text: 'Kenapa Allah menciptakan alam semesta?', category: 'Alam & Sains', emoji: '🌏' },
  { id: 'alam-03', text: 'Kenapa ada siang dan malam?', category: 'Alam & Sains', emoji: '🌏' },
  { id: 'ramadhan-01', text: 'Apa itu Ramadhan?', category: 'Ibadah', emoji: '🕌' },
  { id: 'teman-01', text: 'Bagaimana cara memilih teman yang baik?', category: 'Akhlak', emoji: '💖' },
  { id: 'sedekah-01', text: 'Apa itu sedekah?', category: 'Ibadah', emoji: '🕌' },
  { id: 'syukur-01', text: 'Apa artinya bersyukur?', category: 'Akhlak', emoji: '💖' },
];

// ── HyDE Prompts (single angle, simplified from get-ayat.js) ─────────────────

const HYDE_CURHAT =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan. ' +
  'Berdasarkan curahan hati pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema EMOSIONAL dari ayat Al-Qur\'an yang ideal: apa yang dirasakan seseorang, ' +
  'apa yang dibutuhkan secara emosional (ketenangan, harapan, penghiburan, keberanian, dll.), ' +
  'dan pesan hati apa yang relevan untuk kondisi ini. ' +
  'Gunakan kosakata tema Quranic: sabar, tawakal, tobat, syukur, ' +
  'kasih sayang Allah, rahmat, ampunan, tawadhu. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

const HYDE_PANDUAN =
  'Kamu membantu mencari ayat Al-Qur\'an yang relevan untuk panduan hidup. ' +
  'Berdasarkan pertanyaan pengguna, tulis 2–3 kalimat yang mendeskripsikan ' +
  'tema TOPIKAL dari ayat Al-Qur\'an yang ideal: topik apa yang dibahas langsung, ' +
  'hukum atau aturan apa yang disebutkan, dan konteks spesifik apa yang relevan. ' +
  'Gunakan kosakata tema Quranic: halal, haram, wajib, sunnah, ' +
  'fardhu, muamalah, ibadah, akhlak, syariah. ' +
  'Tulis dalam Bahasa Indonesia. Jangan menyebut nama surah atau nomor ayat.';

// ── Selection prompt — pick 1 best verse ─────────────────────────────────────

const SELECT_PROMPT_CURHAT = `Kamu adalah asisten untuk aplikasi refleksi Al-Qur'an.
Tugasmu HANYA memilih 1 ayat PALING relevan dari daftar kandidat di bawah ini,
berdasarkan curahan hati pengguna.

ATURAN:
1. JANGAN mengarang atau memodifikasi ayat.
2. HANYA pilih dari daftar kandidat, menggunakan nilai "id" yang persis sama.
3. Pilih TEPAT 1 ayat yang paling relevan secara emosional.

KANDIDAT:
{{CANDIDATES}}

FORMAT RESPONS (JSON):
{
  "selected_id": "id dari ayat terpilih",
  "reflection": "2-3 kalimat refleksi yang menghubungkan perasaan pengguna dengan ayat, penuh empati",
  "resonance": "1-2 kalimat mengapa ayat ini relevan untuk kondisi pengguna"
}`;

const SELECT_PROMPT_PANDUAN = `Kamu adalah asisten untuk aplikasi panduan hidup berdasarkan Al-Qur'an.
Tugasmu HANYA memilih 1 ayat PALING relevan dari daftar kandidat di bawah ini,
berdasarkan pertanyaan pengguna.

ATURAN:
1. JANGAN mengarang atau memodifikasi ayat.
2. HANYA pilih dari daftar kandidat, menggunakan nilai "id" yang persis sama.
3. Pilih TEPAT 1 ayat yang paling relevan secara topikal.

KANDIDAT:
{{CANDIDATES}}

FORMAT RESPONS (JSON):
{
  "selected_id": "id dari ayat terpilih",
  "explanation": "2-3 kalimat penjelasan yang menghubungkan topik dengan ayat",
  "relevance": "1-2 kalimat mengapa ayat ini relevan untuk topik ini"
}`;

// ── Main Handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Auth
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Today in WIB
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 3600_000);
    const todayStr = wib.toISOString().split('T')[0];
    const dayOfYear = Math.floor((wib - new Date(wib.getFullYear(), 0, 0)) / 86_400_000);

    // Idempotent: skip if today's row exists
    const { data: existing } = await supabase
      .from('daily_content')
      .select('id')
      .eq('content_date', todayStr)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ skipped: true, reason: 'Already generated', date: todayStr });
    }

    // ── Pick content deterministically ──────────────────────────────────────
    const feeling = FEELINGS[dayOfYear % FEELINGS.length];
    const topic   = TOPICS[(dayOfYear + 15) % TOPICS.length];
    const surah   = SURAH_META[dayOfYear % SURAH_META.length];
    const ajarkan = CURATED_AJARKAN[dayOfYear % CURATED_AJARKAN.length];

    // ── Generate verse + reflection for feeling (curhat) ────────────────────
    const feelingVerse = await findBestVerse(feeling.feeling, 'curhat');

    // ── Generate verse + explanation for topic (panduan) ─────────────────────
    const topicVerse = await findBestVerse(topic.query, 'panduan');

    // ── Insert row ──────────────────────────────────────────────────────────
    const { error: insertErr } = await supabase.from('daily_content').insert({
      content_date:          todayStr,
      feeling:               feeling.feeling,
      feeling_label:         feeling.label,
      feeling_emoji:         feeling.emoji,
      feeling_verse:         feelingVerse,
      topic:                 topic.label,
      topic_query:           topic.query,
      topic_emoji:           topic.emoji,
      topic_verse:           topicVerse,
      surah_number:          surah.number,
      surah_name:            surah.name,
      surah_name_arabic:     surah.name_arabic,
      surah_verse_count:     surah.verses,
      surah_type:            surah.type,
      ajarkan_question_id:   ajarkan.id,
      ajarkan_question_text: ajarkan.text,
      ajarkan_category:      ajarkan.category,
      ajarkan_category_emoji: ajarkan.emoji,
    });

    if (insertErr) throw insertErr;

    // ── Warm get-ayat.js server cache ───────────────────────────────────────
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://temuquran.com';

    await Promise.allSettled([
      fetch(`${baseUrl}/api/get-ayat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeling: feeling.feeling, mode: 'curhat' }),
      }),
      fetch(`${baseUrl}/api/get-ayat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeling: topic.query, mode: 'panduan' }),
      }),
    ]);

    console.log(`[generate-daily-content] Generated for ${todayStr}: feeling=${feeling.label}, topic=${topic.label}, surah=${surah.name}, ajarkan=${ajarkan.id}`);

    return res.status(200).json({
      success: true,
      date: todayStr,
      feeling: feeling.label,
      topic: topic.label,
      surah: surah.name,
      ajarkan: ajarkan.id,
    });
  } catch (err) {
    console.error('[generate-daily-content]', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
};

// ── Simplified HyDE Pipeline ─────────────────────────────────────────────────
// Single angle, single embedding, single search, pick 1 best verse.

async function findBestVerse(query, mode) {
  const isCurhat = mode === 'curhat';

  // Step 1: HyDE — generate hypothetical verse description
  const hydePrompt = isCurhat ? HYDE_CURHAT : HYDE_PANDUAN;
  const hydeRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages:    [
        { role: 'system', content: hydePrompt },
        { role: 'user',   content: query },
      ],
      max_tokens:  120,
      temperature: 0.3,
    }),
  });

  let hydeText = query;
  if (hydeRes.ok) {
    const hydeData = await hydeRes.json();
    hydeText = hydeData.choices?.[0]?.message?.content?.trim() || query;
  }

  // Step 2: Embed
  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:           'text-embedding-3-large',
      dimensions:      1536,
      input:           hydeText,
      encoding_format: 'float',
    }),
  });

  if (!embedRes.ok) throw new Error('Embedding failed');
  const embedData = await embedRes.json();
  const embedding = embedData.data[0].embedding;

  // Step 3: Vector search
  const searchRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/rpc/match_verses_hybrid`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        query_text:      query,
        match_count:     15,
      }),
    }
  );

  if (!searchRes.ok) throw new Error('Vector search failed');
  const candidates = await searchRes.json();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No candidates found');
  }

  // Step 4: GPT selects 1 best verse + writes reflection/explanation
  const candidatesForPrompt = candidates.slice(0, 12).map(v => ({
    id:          v.id,
    surah_name:  v.surah_name,
    verse_number: v.verse_number,
    translation: v.translation,
    tafsir_quraish_shihab: v.tafsir_quraish_shihab || null,
  }));

  const selectPrompt = (isCurhat ? SELECT_PROMPT_CURHAT : SELECT_PROMPT_PANDUAN)
    .replace('{{CANDIDATES}}', JSON.stringify(candidatesForPrompt, null, 2));

  const selectRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:           'gpt-4o-mini',
      messages:        [
        { role: 'system', content: selectPrompt },
        { role: 'user',   content: query },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.3,
      max_tokens:      300,
    }),
  });

  if (!selectRes.ok) throw new Error('Selection failed');
  const selectData = await selectRes.json();
  const parsed = JSON.parse(selectData.choices[0].message.content);

  const selectedId = parsed.selected_id;
  const selectedCandidate = candidates.find(v => v.id === selectedId) || candidates[0];

  // Step 5: Hydrate with full tafsir
  const tafsirRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/quran_verses` +
    `?select=id,tafsir_kemenag,tafsir_ibnu_kathir_id,tafsir_quraish_shihab,tafsir_summary` +
    `&id=eq.${encodeURIComponent(selectedCandidate.id)}`,
    {
      headers: {
        'apikey':        process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    }
  );

  let tafsirData = {};
  if (tafsirRes.ok) {
    const rows = await tafsirRes.json();
    if (rows.length > 0) tafsirData = rows[0];
  }

  // Build the verse JSONB
  const verse = {
    id:                    selectedCandidate.id,
    surah_name:            selectedCandidate.surah_name,
    surah_number:          selectedCandidate.surah_number,
    verse_number:          selectedCandidate.verse_number,
    arabic:                selectedCandidate.arabic,
    translation:           selectedCandidate.translation,
    ref:                   `QS. ${selectedCandidate.surah_name} : ${selectedCandidate.verse_number}`,
    tafsir_kemenag:        tafsirData.tafsir_kemenag || null,
    tafsir_ibnu_kathir_id: tafsirData.tafsir_ibnu_kathir_id || null,
    tafsir_quraish_shihab: tafsirData.tafsir_quraish_shihab || null,
    tafsir_summary:        tafsirData.tafsir_summary || null,
  };

  if (isCurhat) {
    verse.reflection = parsed.reflection || '';
    verse.resonance  = parsed.resonance || '';
  } else {
    verse.explanation = parsed.explanation || '';
    verse.relevance   = parsed.relevance || '';
  }

  return verse;
}
