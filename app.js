'use strict';

// ── Utilities ────────────────────────────────────────────────────────────────

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ── Keyword Map ───────────────────────────────────────────────────────────────

const keywordMap = {
  sad: ['sad','cry','crying','tears','hurt','pain','grief','grieve','heartbroken','heartbreak','loss','missing','miss','down','depressed','depression','unhappy','sedih','menangis','berduka','bersedih','patah hati','hancur'],
  anxious: ['anxious','anxiety','worry','worried','fear','scared','nervous','panic','tense','uneasy','restless','afraid','cemas','khawatir','takut','gelisah','panik','was-was'],
  hopeless: ['hopeless','desperate','despair','give up','giving up','no hope','worthless','meaningless','pointless','empty','numb','putus asa','menyerah','hampa','tidak ada harapan'],
  grateful: ['grateful','gratitude','thankful','blessed','happy','joy','joyful','content','appreciate','alhamdulillah','syukur','bersyukur','bahagia','senang','lega'],
  angry: ['angry','anger','mad','furious','rage','frustrated','frustration','annoyed','irritated','upset','marah','kesal','frustrasi','jengkel','emosi','dongkol'],
  lonely: ['lonely','loneliness','alone','isolated','isolation','no one','nobody','abandoned','kesepian','sendirian','sepi','sendiri','terisolasi'],
  lost: ['lost','confused','confusion','uncertain','uncertainty','direction','purpose','meaning','unsure','bingung','galau','hilang arah','tidak tahu','ragu'],
  stressed: ['stress','stressed','overwhelmed','burnout','burned out','exhausted','tired','drained','overloaded','too much','lelah','kelelahan','capek','stres','kewalahan','kecapekan'],
  guilty: ['guilty','guilt','regret','regretful','ashamed','shame','sin','sinned','mistake','wrong','sorry','repent','bersalah','menyesal','malu','dosa','tobat','berdosa','sesal'],
  envious: ['jealous','jealousy','envy','envious','compare','comparing','unfair','covet','iri','dengki','cemburu','membandingkan','iri hati','sirik'],
};

function detectEmotion(text) {
  const lower = text.toLowerCase();
  const scores = {};
  for (const [id, keywords] of Object.entries(keywordMap)) {
    scores[id] = keywords.filter(kw => lower.includes(kw)).length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : null;
}

// ── Emotion + Verse Data ─────────────────────────────────────────────────────

const emotions = [
  {
    id: 'sad', label: 'Sad', labelId: 'Sedih', emoji: '🌧️',
    desc: 'Merasa sedih atau patah hati',
    color: '#4A7FA5', bg: '#EBF4FF',
    verses: [
      {
        surah: 'Al-Inshirah', ref: '94:5–6',
        arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٦﴾',
        id: 'Maka sesungguhnya bersama kesulitan ada kemudahan. Sesungguhnya bersama kesulitan ada kemudahan.',
        reflection: 'Allah menjanjikan kemudahan dua kali untuk setiap kesulitan — pengingat bahwa rasa sakit ini tidak akan bertahan selamanya.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:286',
        arabic: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
        id: 'Allah tidak membebani seseorang melainkan sesuai dengan kesanggupannya.',
        reflection: 'Kamu lebih kuat dari yang kamu kira. Allah tahu persis apa yang bisa kamu tanggung.',
      },
      {
        surah: "Ali 'Imran", ref: '3:139',
        arabic: 'وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ',
        id: 'Janganlah kamu (merasa) lemah, dan jangan (pula) bersedih hati, sebab kamu paling tinggi (derajatnya), jika kamu orang beriman.',
        reflection: 'Imanmu adalah kekuatanmu. Kesedihan itu wajar, tapi tidak mendefinisikan takdirmu.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:156',
        arabic: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ',
        id: 'Sesungguhnya kami milik Allah dan kepada-Nya kami kembali.',
        reflection: 'Kata-kata ini bukan hanya untuk kematian — tapi untuk setiap momen kehilangan. Semuanya kembali kepada-Nya.',
      },
    ],
  },
  {
    id: 'anxious', label: 'Anxious', labelId: 'Cemas', emoji: '💭',
    desc: 'Merasa khawatir atau takut',
    color: '#7C3AED', bg: '#F5F3FF',
    verses: [
      {
        surah: "Ar-Ra'd", ref: '13:28',
        arabic: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ',
        id: 'Ingatlah, hanya dengan mengingat Allah hati menjadi tenteram.',
        reflection: 'Ketika kecemasan menguasai, kembalilah ke dzikir. Itulah jangkar bagi hati yang gelisah.',
      },
      {
        surah: 'At-Talaq', ref: '65:3',
        arabic: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ۚ إِنَّ اللَّهَ بَالِغُ أَمْرِهِ',
        id: 'Barang siapa bertawakal kepada Allah, niscaya Allah akan mencukupkan (keperluan)nya. Sungguh, Allah melaksanakan urusan-Nya.',
        reflection: 'Kamu tidak perlu menanggung beban sendirian. Serahkan hasilnya kepada Allah.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:45',
        arabic: 'وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى الْخَاشِعِينَ',
        id: 'Mohonlah pertolongan (kepada Allah) dengan sabar dan salat. Dan (salat) itu sungguh berat, kecuali bagi orang-orang yang khusyuk.',
        reflection: 'Shalat bukan sekadar ibadah — tapi penyembuhan. Ubah kecemasanmu menjadi doa.',
      },
      {
        surah: 'Yunus', ref: '10:62',
        arabic: 'أَلَا إِنَّ أَوْلِيَاءَ اللَّهِ لَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ',
        id: 'Ingatlah, wali-wali Allah itu, tidak ada rasa takut pada mereka dan mereka tidak bersedih hati.',
        reflection: 'Kedekatan dengan Allah adalah perisai terbesar dari rasa takut. Dekatkanlah dirimu kepada-Nya.',
      },
    ],
  },
  {
    id: 'hopeless', label: 'Hopeless', labelId: 'Putus Asa', emoji: '🌑',
    desc: 'Merasa putus asa atau tanpa harapan',
    color: '#6B7280', bg: '#F9FAFB',
    verses: [
      {
        surah: 'Az-Zumar', ref: '39:53',
        arabic: 'قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا',
        id: "Katakanlah: Wahai hamba-hamba-Ku yang melampaui batas! Janganlah kamu berputus asa dari rahmat Allah. Sesungguhnya Allah mengampuni dosa-dosa semuanya.",
        reflection: 'Seberapa jauh pun kamu merasa, rahmat-Nya selalu lebih besar. Selalu ada jalan untuk kembali.',
      },
      {
        surah: 'Yusuf', ref: '12:87',
        arabic: 'إِنَّهُ لَا يَيْأَسُ مِن رَّوْحِ اللَّهِ إِلَّا الْقَوْمُ الْكَافِرُونَ',
        id: 'Sesungguhnya yang berputus asa dari rahmat Allah, hanyalah orang-orang yang kafir.',
        reflection: 'Putus asa bukan dari iman. Selama kamu percaya, selalu ada harapan.',
      },
      {
        surah: 'Al-Inshirah', ref: '94:5–6',
        arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٦﴾',
        id: 'Maka sesungguhnya bersama kesulitan ada kemudahan. Sesungguhnya bersama kesulitan ada kemudahan.',
        reflection: 'Kemudahan dijanjikan — bukan setelah kesulitan, tapi bersamanya. Fajar sudah hadir di dalam kegelapan.',
      },
      {
        surah: 'Al-Hijr', ref: '15:56',
        arabic: 'وَمَن يَقْنَطُ مِن رَّحْمَةِ رَبِّهِ إِلَّا الضَّالُّونَ',
        id: 'Siapakah yang berputus asa dari rahmat Tuhannya, selain orang-orang yang sesat?',
        reflection: 'Berputus asa berarti melupakan siapa Allah itu. Ingatlah: rahmat-Nya jauh lebih luas dari kesalahan apapun.',
      },
    ],
  },
  {
    id: 'grateful', label: 'Grateful', labelId: 'Bersyukur', emoji: '🌟',
    desc: 'Merasa bersyukur dan beruntung',
    color: '#059669', bg: '#ECFDF5',
    verses: [
      {
        surah: 'Ibrahim', ref: '14:7',
        arabic: 'لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ',
        id: '"Sesungguhnya jika kamu bersyukur, niscaya Aku akan menambah (nikmat) kepadamu."',
        reflection: 'Syukur bukan sekadar perasaan — tapi kunci yang membuka lebih banyak nikmat.',
      },
      {
        surah: 'Ar-Rahman', ref: '55:13',
        arabic: 'فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ',
        id: 'Maka nikmat Tuhanmu yang manakah yang kamu dustakan?',
        reflection: 'Ayat ini diulang 31 kali dalam Surah Ar-Rahman — pengingat lembut untuk tidak pernah berhenti memperhatikan karunia-Nya.',
      },
      {
        surah: 'An-Nahl', ref: '16:18',
        arabic: 'وَإِن تَعُدُّوا نِعْمَةَ اللَّهِ لَا تُحْصُوهَا',
        id: 'Dan jika kamu menghitung nikmat Allah, niscaya kamu tidak akan mampu menghitungnya.',
        reflection: 'Nikmatmu tak terhitung. Biarkan kenyataan yang mengagumkan ini memperdalam rasa syukurmu.',
      },
      {
        surah: "An-Naml", ref: '27:40',
        arabic: 'هَٰذَا مِن فَضْلِ رَبِّي لِيَبْلُوَنِي أَأَشْكُرُ أَمْ أَكْفُرُ',
        id: '"Ini termasuk karunia Tuhanku untuk mengujiku, apakah aku bersyukur atau kufur."',
        reflection: 'Setiap nikmat adalah ujian rasa syukurmu. Menyadari ini akan memperdalam rasa terima kasih.',
      },
    ],
  },
  {
    id: 'angry', label: 'Angry', labelId: 'Marah', emoji: '🌋',
    desc: 'Merasa frustrasi atau marah',
    color: '#DC2626', bg: '#FEF2F2',
    verses: [
      {
        surah: "Ali 'Imran", ref: '3:134',
        arabic: 'وَالْكَاظِمِينَ الْغَيْظَ وَالْعَافِينَ عَنِ النَّاسِ ۗ وَاللَّهُ يُحِبُّ الْمُحْسِنِينَ',
        id: '...dan orang-orang yang menahan amarahnya dan memaafkan (kesalahan) orang. Dan Allah mencintai orang yang berbuat kebaikan.',
        reflection: 'Kemampuan menahan amarah adalah tanda kekuatan, bukan kelemahan. Allah mencintai mereka yang memilih memaafkan.',
      },
      {
        surah: 'Ash-Shura', ref: '42:37',
        arabic: 'وَالَّذِينَ يَجْتَنِبُونَ كَبَائِرَ الْإِثْمِ وَالْفَوَاحِشَ وَإِذَا مَا غَضِبُوا هُمْ يَغْفِرُونَ',
        id: 'Dan (bagi) orang-orang yang menjauhi dosa-dosa besar dan perbuatan keji, dan apabila mereka marah segera memberi maaf.',
        reflection: 'Memaafkan di tengah amarah adalah salah satu kualitas tertinggi seorang mukmin.',
      },
      {
        surah: "Ali 'Imran", ref: '3:159',
        arabic: 'وَلَوْ كُنتَ فَظًّا غَلِيظَ الْقَلْبِ لَانفَضُّوا مِنْ حَوْلِكَ',
        id: 'Seandainya engkau bersikap keras dan berhati kasar, tentulah mereka menjauhkan diri dari sekitarmu.',
        reflection: 'Amarah menjauhkan orang lain. Kelembutan, bahkan di momen sulit, mendekatkan hati.',
      },
      {
        surah: "Al-A'raf", ref: '7:199',
        arabic: 'خُذِ الْعَفْوَ وَأْمُرْ بِالْعُرْفِ وَأَعْرِضْ عَنِ الْجَاهِلِينَ',
        id: 'Jadilah pemaaf dan suruhlah orang mengerjakan yang makruf, serta jangan pedulikan orang-orang yang bodoh.',
        reflection: 'Ketika orang lain memprovokasi, respons terbijak adalah mundur. Tidak setiap pertempuran layak energimu.',
      },
    ],
  },
  {
    id: 'lonely', label: 'Lonely', labelId: 'Kesepian', emoji: '🌙',
    desc: 'Merasa kesepian atau sendirian',
    color: '#D97706', bg: '#FFFBEB',
    verses: [
      {
        surah: 'Al-Baqarah', ref: '2:186',
        arabic: 'وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ',
        id: 'Apabila hamba-hamba-Ku bertanya kepadamu tentang Aku, maka sesungguhnya Aku dekat. Aku kabulkan permohonan orang yang berdoa apabila dia berdoa kepada-Ku.',
        reflection: 'Kamu tidak pernah benar-benar sendirian. Setiap kali kamu menyeru-Nya, Dia menjawab.',
      },
      {
        surah: 'Qaf', ref: '50:16',
        arabic: 'وَنَحْنُ أَقْرَبُ إِلَيْهِ مِنْ حَبْلِ الْوَرِيدِ',
        id: 'Dan Kami lebih dekat kepadanya daripada urat lehernya.',
        reflection: 'Allah lebih dekat dari detak jantungmu sendiri. Kesepian memudar saat kamu menyadari kebenaran ini.',
      },
      {
        surah: 'At-Tawbah', ref: '9:40',
        arabic: 'إِنَّ اللَّهَ مَعَنَا',
        id: '"Sesungguhnya Allah bersama kami."',
        reflection: 'Ini adalah kata-kata Nabi ﷺ di momen paling gelap beliau. Jadikan itu milikmu juga.',
      },
      {
        surah: 'Al-Hadid', ref: '57:4',
        arabic: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ',
        id: 'Dan Dia bersama kamu di mana saja kamu berada.',
        reflection: 'Bahkan di momen paling terisolasi sekalipun, kamu tidak sendiri. Allah ada di sana.',
      },
    ],
  },
  {
    id: 'lost', label: 'Lost', labelId: 'Kebingungan', emoji: '🗺️',
    desc: 'Merasa bingung atau tidak pasti arah',
    color: '#5B4DBE', bg: '#EEF2FF',
    verses: [
      {
        surah: 'Al-Fatiha', ref: '1:6–7',
        arabic: 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ',
        id: 'Tunjukilah kami jalan yang lurus, (yaitu) jalan orang-orang yang telah Engkau beri nikmat kepadanya.',
        reflection: "Ini adalah doa yang paling banyak diulang dalam Al-Qur'an. Bahkan yang sudah dibimbing pun memohon petunjuk. Jangan pernah berhenti meminta.",
      },
      {
        surah: 'An-Nahl', ref: '16:9',
        arabic: 'وَعَلَى اللَّهِ قَصْدُ السَّبِيلِ',
        id: 'Dan hak Allah (menerangkan) jalan yang lurus.',
        reflection: 'Jalan itu ada. Kamu belum kehilangannya selamanya. Mintalah Allah untuk menunjukkannya kembali.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:2',
        arabic: 'ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ',
        id: "Kitab (Al-Qur'an) ini tidak ada keraguan padanya; petunjuk bagi mereka yang bertakwa.",
        reflection: "Ketika kamu tersesat, kembalilah kepada Al-Qur'an. Ia diturunkan tepat untuk memberi petunjuk.",
      },
      {
        surah: 'Al-Kahf', ref: '18:10',
        arabic: 'رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا',
        id: 'Ya Tuhan kami, berikanlah rahmat kepada kami dari sisi-Mu dan sempurnakanlah bagi kami petunjuk yang lurus dalam urusan kami.',
        reflection: 'Ini adalah doa para Ashabul Kahfi di momen paling rentan mereka. Ini juga milikmu.',
      },
    ],
  },
  {
    id: 'stressed', label: 'Stressed', labelId: 'Stres', emoji: '⚡',
    desc: 'Merasa kewalahan atau kelelahan',
    color: '#0891B2', bg: '#ECFEFF',
    verses: [
      {
        surah: 'Al-Baqarah', ref: '2:153',
        arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ',
        id: 'Wahai orang-orang yang beriman! Mohonlah pertolongan (kepada Allah) dengan sabar dan salat. Sungguh, Allah beserta orang-orang yang sabar.',
        reflection: 'Ketika segalanya terasa terlalu berat, berhentilah. Shalat. Allah ada tepat bersama orang-orang yang sabar.',
      },
      {
        surah: 'Al-Inshirah', ref: '94:5–6',
        arabic: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٦﴾',
        id: 'Maka sesungguhnya bersama kesulitan ada kemudahan. Sesungguhnya bersama kesulitan ada kemudahan.',
        reflection: 'Kemudahan sudah dalam perjalanan. Musim stres ini ada batas akhirnya.',
      },
      {
        surah: 'Az-Zumar', ref: '39:38',
        arabic: 'أَلَيْسَ اللَّهُ بِكَافٍ عَبْدَهُ',
        id: 'Bukankah Allah cukup untuk melindungi hamba-hamba-Nya?',
        reflection: 'Kamu tidak perlu menyelesaikan semuanya sendiri. Kecukupan Allah lebih besar dari setiap kebutuhanmu.',
      },
      {
        surah: 'At-Talaq', ref: '65:7',
        arabic: 'سَيَجْعَلُ اللَّهُ بَعْدَ عُسْرٍ يُسْرًا',
        id: 'Allah kelak akan memberikan kelapangan setelah kesempitan.',
        reflection: 'Bukan mungkin. Bukan barangkali. Allah pasti mendatangkan kemudahan. Pegang janji ini.',
      },
    ],
  },
  {
    id: 'guilty', label: 'Guilty', labelId: 'Bersalah', emoji: '😔',
    desc: 'Merasa bersalah atau menyesal',
    color: '#9C4A52', bg: '#FFF0F1',
    verses: [
      {
        surah: 'Az-Zumar', ref: '39:53',
        arabic: 'لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا ۚ إِنَّهُ هُوَ الْغَفُورُ الرَّحِيمُ',
        id: 'Janganlah berputus asa dari rahmat Allah. Sesungguhnya Allah mengampuni dosa-dosa semuanya. Sesungguhnya Dialah Yang Maha Pengampun, Maha Penyayang.',
        reflection: 'Tidak ada dosa yang terlalu besar untuk diampuni-Nya. Pintu taubat selalu terbuka.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:222',
        arabic: 'إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ وَيُحِبُّ الْمُتَطَهِّرِينَ',
        id: 'Sesungguhnya Allah menyukai orang-orang yang bertobat dan menyukai orang-orang yang mensucikan diri.',
        reflection: 'Taubat tidak hanya menghapus dosa — tapi mendatangkan cinta Allah. Kembalilah kepada-Nya lagi dan lagi.',
      },
      {
        surah: "An-Nisa", ref: '4:110',
        arabic: 'وَمَن يَعْمَلْ سُوءًا أَوْ يَظْلِمْ نَفْسَهُ ثُمَّ يَسْتَغْفِرِ اللَّهَ يَجِدِ اللَّهَ غَفُورًا رَّحِيمًا',
        id: 'Barang siapa berbuat kejahatan atau menganiaya dirinya sendiri, kemudian dia memohon ampunan kepada Allah, niscaya dia akan mendapati Allah Maha Pengampun, Maha Penyayang.',
        reflection: 'Memohon ampunan adalah satu-satunya hal yang berdiri antara kamu dan rahmat-Nya. Jangan tunda.',
      },
      {
        surah: 'Hud', ref: '11:90',
        arabic: 'وَاسْتَغْفِرُوا رَبَّكُمْ ثُمَّ تُوبُوا إِلَيْهِ ۚ إِنَّ رَبِّي رَحِيمٌ وَدُودٌ',
        id: 'Mohonlah ampunan kepada Tuhanmu, kemudian bertobatlah kepada-Nya. Sesungguhnya Tuhanku Maha Penyayang, Maha Pengasih.',
        reflection: 'Dia bukan hanya Maha Pengampun — tapi hangat dan penuh kasih kepada mereka yang kembali kepada-Nya.',
      },
    ],
  },
  {
    id: 'envious', label: 'Envious', labelId: 'Iri Hati', emoji: '🌿',
    desc: 'Merasa iri atau suka membandingkan',
    color: '#2E7D5E', bg: '#EDFAF3',
    verses: [
      {
        surah: "An-Nisa", ref: '4:32',
        arabic: 'وَلَا تَتَمَنَّوْا مَا فَضَّلَ اللَّهُ بِهِ بَعْضَكُمْ عَلَىٰ بَعْضٍ',
        id: 'Janganlah kamu iri hati terhadap apa yang dikaruniakan Allah kepada sebagian kamu lebih banyak dari sebagian yang lain.',
        reflection: 'Perbandingan adalah pencuri kedamaian. Nikmat setiap orang diukur Allah dengan kebijaksanaan yang sempurna.',
      },
      {
        surah: 'Az-Zumar', ref: '39:52',
        arabic: 'أَوَلَمْ يَعْلَمُوا أَنَّ اللَّهَ يَبْسُطُ الرِّزْقَ لِمَن يَشَاءُ وَيَقْدِرُ',
        id: 'Tidakkah mereka mengetahui bahwa Allah melapangkan rezeki bagi siapa yang Dia kehendaki dan membatasinya? Sesungguhnya pada yang demikian terdapat tanda-tanda bagi orang yang beriman.',
        reflection: 'Apa yang dimiliki orang lain diberikan Allah dengan alasan yang melampaui penglihatanmu. Percayai pembagian-Nya.',
      },
      {
        surah: 'Al-Isra', ref: '17:20',
        arabic: 'كُلًّا نُّمِدُّ هَٰؤُلَاءِ وَهَٰؤُلَاءِ مِنْ عَطَاءِ رَبِّكَ ۚ وَمَا كَانَ عَطَاءُ رَبِّكَ مَحْظُورًا',
        id: "Kepada masing-masing golongan, Kami berikan bantuan dari kemurahan Tuhanmu. Dan kemurahan Tuhanmu tidak dapat dihalangi.",
        reflection: 'Kemurahan Allah bukan permainan zero-sum. Berkah mereka tidak mengurangi berkahmu.',
      },
      {
        surah: 'Al-Baqarah', ref: '2:269',
        arabic: 'يُؤْتِي الْحِكْمَةَ مَن يَشَاءُ ۚ وَمَن يُؤْتَ الْحِكْمَةَ فَقَدْ أُوتِيَ خَيْرًا كَثِيرًا',
        id: 'Dia memberikan hikmah kepada siapa yang Dia kehendaki. Barang siapa diberi hikmah, sesungguhnya dia telah diberi kebaikan yang banyak.',
        reflection: 'Karunia terbaik yang bisa diminta bukan apa yang dimiliki orang lain — tapi kebijaksanaan untuk melihat kebaikan yang sudah ada di sekitarmu.',
      },
    ],
  },
];

// ── Copy / Share ──────────────────────────────────────────────────────────────

async function copyVerse(verse) {
  const text = `${verse.arabic}\n\n"${verse.id}"\n\n— ${verse.surah} · ${verse.ref}`;
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
      title: `${verse.surah} ${verse.ref} — Quran untuk Hati`,
      text: `${verse.arabic}\n\n"${verse.id}"\n\n— ${verse.surah} · ${verse.ref}`,
    });
  } catch (err) {
    if (err.name !== 'AbortError') copyVerse(verse);
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHARE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

function buildVerseCard(verse) {
  const card = document.createElement('article');
  card.className = 'verse-card';
  card.innerHTML = `
    <div class="vc-ref">
      <span class="vc-ref-dot"></span>
      <span class="vc-ref-text">${verse.surah} &nbsp;·&nbsp; ${verse.ref}</span>
    </div>
    <p class="vc-arabic">${verse.arabic}</p>
    <p class="vc-translation">${verse.id}</p>
    <p class="vc-reflection">${verse.reflection}</p>
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

function renderEmotionCards() {
  const grid = document.getElementById('emotion-grid');
  grid.innerHTML = emotions.map(e => `
    <button
      class="emotion-card"
      data-id="${e.id}"
      style="--ec-color: ${e.color}; --ec-bg: ${e.bg};"
      aria-label="${e.labelId} — ${e.desc}"
    >
      <span class="ec-emoji">${e.emoji}</span>
      <span class="ec-label">${e.labelId}</span>
      <span class="ec-desc">${e.desc}</span>
    </button>
  `).join('');
  grid.querySelectorAll('.emotion-card').forEach(card => {
    card.addEventListener('click', () => showVerses(card.dataset.id));
  });
}

function showVerses(emotionId) {
  const emotion = emotions.find(e => e.id === emotionId);
  if (!emotion) return;

  document.getElementById('verses-header').innerHTML = `
    <div class="vh-tag" style="color: ${emotion.color}; background: ${emotion.bg};">
      <span>${emotion.emoji}</span>
      <span>${emotion.labelId}</span>
    </div>
    <h2 class="vh-title">Untuk kamu yang sedang merasa ${emotion.labelId.toLowerCase()}…</h2>
    <p class="vh-sub">Berikut ayat-ayat Al-Qur'an untukmu</p>
  `;

  const grid = document.getElementById('verses-grid');
  grid.innerHTML = '';
  emotion.verses.forEach(verse => grid.appendChild(buildVerseCard(verse)));

  switchView('verses-view');
}

function switchView(targetId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Search / Keyword Detection ────────────────────────────────────────────────

function showSuggestion(emotionId) {
  const el = document.getElementById('keyword-suggestion');
  if (!emotionId) { el.classList.add('hidden'); return; }
  const emotion = emotions.find(e => e.id === emotionId);
  if (!emotion) { el.classList.add('hidden'); return; }
  el.innerHTML = `
    <span class="kw-label">Sepertinya kamu sedang merasa</span>
    <span class="kw-pill" style="color: ${emotion.color}; background: ${emotion.bg};">${emotion.emoji} ${emotion.labelId}</span>
    <button class="kw-show-btn" data-id="${emotion.id}">Tampilkan ayat →</button>
  `;
  el.classList.remove('hidden');
  el.querySelector('.kw-show-btn').addEventListener('click', () => showVerses(emotion.id));
}

function initSearch() {
  const input = document.getElementById('feeling-input');
  const clearBtn = document.getElementById('feeling-clear');

  const debouncedDetect = debounce((text) => {
    showSuggestion(text.trim().length >= 3 ? detectEmotion(text) : null);
  }, 350);

  input.addEventListener('input', (e) => {
    const val = e.target.value;
    clearBtn.classList.toggle('hidden', val.length === 0);
    debouncedDetect(val);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const id = detectEmotion(e.target.value);
      if (id) showVerses(id);
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    document.getElementById('keyword-suggestion').classList.add('hidden');
    input.focus();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('back-btn').addEventListener('click', () => {
  switchView('selection-view');
});

renderEmotionCards();
initSearch();
