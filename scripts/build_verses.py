#!/usr/bin/env python3
"""
build_verses.py
Fetches Arabic + Indonesian for each seed verse from alquran.cloud
and writes data/verses.json.
Run: python3 scripts/build_verses.py
"""

import json, time, urllib.request, os, sys

SEED = [
  # ── PARENTING / FAMILY ──────────────────────────────────────────────────────
  {"ref":"31:14","name":"Luqman","themes":["parenting","family","mother","gratitude","sacrifice","children","tired"],"tafsir":"Allah memerintahkan manusia untuk bersyukur kepada-Nya dan kepada kedua orang tua. Ibu menanggung beban kehamilan yang berat dan menyusui dua tahun penuh. Pengorbanan seorang ibu sangat besar dan diakui langsung oleh Allah."},
  {"ref":"46:15","name":"Al-Ahqaf","themes":["parenting","mother","family","sacrifice","exhaustion","tired","patience","children"],"tafsir":"Ayat ini menggambarkan perjuangan luar biasa seorang ibu — mengandung dengan susah payah dan melahirkan dengan susah payah. Allah mengakui beratnya pengorbanan ini secara eksplisit dan menjanjikan pahala bagi yang bersyukur dan bersabar."},
  {"ref":"17:23","name":"Al-Isra","themes":["parenting","family","respect","kindness","duty","parents"],"tafsir":"Allah memerintahkan untuk berbuat baik kepada orang tua. Jangan ucapkan kata kasar kepada mereka dan berbicaralah dengan mulia. Kewajiban ini disebutkan Allah tepat setelah larangan syirik — menunjukkan betapa tinggi kedudukannya."},
  {"ref":"17:24","name":"Al-Isra","themes":["parenting","family","humility","love","prayer","parents"],"tafsir":"Rendahkan dirimu kepada orang tua dengan penuh kasih sayang dan doakanlah mereka. Doa ini adalah bentuk balas budi paling tulus yang bisa diberikan seorang anak kepada orang tuanya."},
  {"ref":"18:46","name":"Al-Kahfi","themes":["parenting","children","perspective","blessings","world","family"],"tafsir":"Harta dan anak-anak adalah perhiasan dunia yang sementara. Namun amal saleh yang kekal memiliki nilai jauh lebih tinggi di sisi Allah. Ini mengajarkan untuk melihat anak bukan sekadar kebanggaan, tapi amanah yang dipercayakan."},
  {"ref":"64:15","name":"At-Taghabun","themes":["parenting","children","trial","patience","family"],"tafsir":"Harta dan anak-anak adalah ujian. Memahami ini membantu orang tua untuk bersabar dalam mengasuh anak dengan penuh kesadaran — setiap kesulitan dalam merawat anak adalah ujian yang bernilai pahala di sisi Allah."},
  {"ref":"2:233","name":"Al-Baqarah","themes":["parenting","mother","nursing","family","responsibility","care","children"],"tafsir":"Para ibu menyusui anaknya dua tahun penuh bagi yang ingin menyempurnakan penyusuan. Allah menetapkan tanggung jawab yang adil — ini adalah sistem yang Allah rancang untuk melindungi ibu yang kelelahan dan anak yang membutuhkan."},
  {"ref":"66:6","name":"At-Tahrim","themes":["parenting","family","responsibility","protection","children"],"tafsir":"Jagalah dirimu dan keluargamu dari api neraka. Merawat dan mendidik anak bukan sekadar tugas duniawi — ia adalah ibadah dan amanah terbesar yang Allah percayakan kepada kita."},
  {"ref":"28:7","name":"Al-Qashash","themes":["parenting","fear","children","comfort","trust","mother"],"tafsir":"Janganlah kamu takut dan jangan pula bersedih. Allah berjanji untuk mengembalikan dan menjadikannya salah seorang rasul. Bagi orang tua yang cemas akan keselamatan anaknya, Allah mengingatkan bahwa Dia menggenggam setiap anak dalam perlindungan-Nya."},

  # ── EXHAUSTION / FATIGUE / TIRED ────────────────────────────────────────────
  {"ref":"94:5","name":"Al-Insyirah","themes":["exhaustion","hardship","hope","ease","tired","stress","hopelessness","grief"],"tafsir":"Sesungguhnya bersama kesulitan ada kemudahan. Janji Allah ini menegaskan bahwa kelelahan yang dirasakan sekarang tidaklah abadi — selalu ada jalan keluar yang menyertai setiap ujian."},
  {"ref":"94:6","name":"Al-Insyirah","themes":["exhaustion","hardship","hope","ease","tired","stress"],"tafsir":"Allah mengulang janji ini dua kali berturut-turut untuk menegaskan kepastiannya. Kemudahan bukan sekadar harapan — ia adalah kepastian dari Allah Yang Maha Menepati Janji."},
  {"ref":"2:286","name":"Al-Baqarah","themes":["exhaustion","burden","capacity","mercy","stress","anxiety","overwhelming","tired"],"tafsir":"Allah tidak membebani seseorang melainkan sesuai dengan kesanggupannya. Setiap beban yang terasa berat — Allah sudah menghitung bahwa kamu mampu menanggungnya. Ini bukan kebetulan."},
  {"ref":"39:10","name":"Az-Zumar","themes":["exhaustion","patience","reward","steadfast","sacrifice","tired"],"tafsir":"Hanya orang-orang yang bersabarlah yang dicukupkan pahala mereka tanpa batas. Setiap tetesan keringat dan usaha yang dilakukan dengan sabar dicatat Allah tanpa pengurangan sedikit pun."},
  {"ref":"90:4","name":"Al-Balad","themes":["exhaustion","hardship","human","struggle","reality","tired"],"tafsir":"Sungguh Kami telah menciptakan manusia dalam keadaan susah payah. Kelelahan dan perjuangan adalah bagian dari fitrah manusia — bukan tanda kegagalan, melainkan tanda bahwa kamu sedang hidup sepenuhnya."},
  {"ref":"3:200","name":"Ali Imran","themes":["exhaustion","patience","steadfast","strength","perseverance","tired"],"tafsir":"Bersabarlah dan bertahanlah. Kesabaran bukan hanya diam menunggu — ia adalah keteguhan aktif untuk terus melangkah meski terasa berat, dan Allah bersama orang-orang yang bertahan."},
  {"ref":"2:153","name":"Al-Baqarah","themes":["exhaustion","patience","prayer","help","comfort","tired","stress"],"tafsir":"Mohonlah pertolongan dengan sabar dan shalat. Sesungguhnya Allah beserta orang-orang yang sabar. Dalam kelelahan, kembali kepada Allah adalah sumber kekuatan yang tidak pernah habis."},

  # ── ANXIETY / WORRY / FEAR ──────────────────────────────────────────────────
  {"ref":"2:155","name":"Al-Baqarah","themes":["anxiety","fear","test","patience","hardship","grief"],"tafsir":"Allah akan menguji dengan rasa takut, kelaparan, dan kekurangan harta. Ini bukan hukuman — ini seleksi untuk mengetahui siapa yang tetap beriman dan sabar di tengah kesulitan."},
  {"ref":"2:156","name":"Al-Baqarah","themes":["anxiety","grief","loss","acceptance","surrender","comfort"],"tafsir":"Orang-orang yang ketika ditimpa musibah berkata: Sesungguhnya kami milik Allah dan kepada-Nya kami kembali. Kalimat ini adalah penawar terbaik untuk hati yang gelisah dan tidak tenang."},
  {"ref":"2:157","name":"Al-Baqarah","themes":["anxiety","grief","comfort","blessing","mercy","peace"],"tafsir":"Mereka itulah yang mendapat shalawat dari Tuhan mereka beserta rahmat. Ketenangan batin adalah hadiah Allah bagi yang berserah diri di tengah kepedihan dan kekhawatiran."},
  {"ref":"57:22","name":"Al-Hadid","themes":["anxiety","control","trust","fate","acceptance","worry"],"tafsir":"Tidak ada musibah yang terjadi melainkan telah ada dalam kitab Allah sebelum diciptakan. Ini mengajarkan untuk tidak terlalu cemas atas hal-hal di luar kendali kita — semuanya sudah dalam rencana-Nya."},
  {"ref":"65:3","name":"At-Talaq","themes":["anxiety","trust","provision","reliance","stress","financial","worry"],"tafsir":"Barangsiapa bertawakal kepada Allah, maka Dia akan mencukupinya. Allah tidak akan membiarkan hamba-Nya yang berserah diri tanpa pertolongan dan jalan keluar."},
  {"ref":"3:173","name":"Ali Imran","themes":["anxiety","courage","faith","trust","sufficiency","fear"],"tafsir":"Cukuplah Allah bagi kami, dan Dia adalah sebaik-baik pelindung. Ucapan ini adalah perisai dari segala kekhawatiran — menyerahkan segalanya kepada Yang Maha Kuasa."},
  {"ref":"13:28","name":"Ar-Ra'd","themes":["anxiety","peace","remembrance","heart","comfort","stress","lost"],"tafsir":"Ketahuilah, hanya dengan mengingat Allah hati menjadi tenteram. Ini adalah obat yang Allah sendiri resepkan untuk jiwa yang gelisah dan pikiran yang sulit tenang."},

  # ── HOPELESSNESS / DESPAIR ───────────────────────────────────────────────────
  {"ref":"39:53","name":"Az-Zumar","themes":["hopelessness","despair","forgiveness","mercy","hope","guilt"],"tafsir":"Janganlah berputus asa dari rahmat Allah. Sesungguhnya Allah mengampuni semua dosa. Seberapa jauh pun seseorang merasa tersesat, pintu Allah selalu terbuka lebar bagi yang mau kembali."},
  {"ref":"15:56","name":"Al-Hijr","themes":["hopelessness","despair","hope","faith"],"tafsir":"Tidak ada yang berputus asa dari rahmat Tuhannya kecuali orang-orang yang sesat. Berputus asa dari Allah berarti melupakan betapa besar dan luasnya kasih sayang-Nya yang tanpa batas."},
  {"ref":"12:87","name":"Yusuf","themes":["hopelessness","despair","hope","trust","patience"],"tafsir":"Janganlah berputus asa dari pertolongan Allah. Kisah Nabi Yusuf mengajarkan bahwa pertolongan Allah bisa datang kapan saja, dari arah yang paling tidak disangka, bahkan setelah bertahun-tahun."},
  {"ref":"65:7","name":"At-Talaq","themes":["hopelessness","ease","hardship","hope","comfort"],"tafsir":"Allah akan memberikan kelapangan sesudah kesempitan. Tidak ada kesulitan yang kekal — Allah selalu menyiapkan jalan keluar bagi yang beriman dan tidak menyerah."},
  {"ref":"21:87","name":"Al-Anbiya","themes":["hopelessness","guilt","prayer","rescue","lost","trapped"],"tafsir":"Doa Nabi Yunus dari dalam perut ikan: tidak ada Tuhan selain Engkau, Maha Suci Engkau, sesungguhnya aku termasuk orang yang zalim. Doa ini mengajarkan bahwa bahkan di titik paling gelap sekalipun, masih ada jalan keluar melalui pengakuan dan doa yang tulus."},
  {"ref":"7:156","name":"Al-A'raf","themes":["hopelessness","mercy","hope","forgiveness","compassion"],"tafsir":"Rahmat-Ku meliputi segala sesuatu. Tidak ada situasi yang benar-benar berada di luar jangkauan kasih sayang Allah. Luasnya rahmat Allah jauh melampaui segala kesalahan dan kelemahan manusia."},

  # ── LONELINESS / FEELING ALONE ───────────────────────────────────────────────
  {"ref":"2:186","name":"Al-Baqarah","themes":["loneliness","closeness","prayer","connection","lost","alone"],"tafsir":"Aku dekat. Aku mengabulkan permohonan orang yang berdoa apabila ia memohon kepada-Ku. Tidak ada yang benar-benar sendirian selama masih bisa berdoa — Allah selalu mendengar."},
  {"ref":"50:16","name":"Qaf","themes":["loneliness","closeness","seen","known","comfort","alone"],"tafsir":"Kami lebih dekat kepadanya daripada urat lehernya sendiri. Tidak ada momen yang terlewatkan tanpa Allah mengetahuinya. Kamu tidak pernah benar-benar sendirian — Allah selalu hadir."},
  {"ref":"9:40","name":"At-Taubah","themes":["loneliness","comfort","courage","faith","alone"],"tafsir":"Jangan bersedih, sesungguhnya Allah bersama kita. Kata-kata Nabi di saat paling sulit ini mengingatkan bahwa kehadiran Allah adalah ketenangan paling nyata di tengah kesepian."},
  {"ref":"58:7","name":"Al-Mujadila","themes":["loneliness","presence","awareness","alone"],"tafsir":"Tidaklah ada pembicaraan rahasia antara tiga orang melainkan Dialah yang keempatnya. Allah selalu hadir dan tidak pernah absen dari setiap momen kehidupan kita, sesunyi apapun rasanya."},
  {"ref":"20:46","name":"Taha","themes":["loneliness","fear","comfort","courage","alone"],"tafsir":"Janganlah kamu berdua takut. Sesungguhnya Aku bersama kamu berdua; Aku mendengar dan melihat. Kata-kata Allah kepada Musa dan Harun ini adalah pengingat abadi bahwa Allah selalu menyaksikan dan menyertai."},

  # ── GUILT / REGRET ───────────────────────────────────────────────────────────
  {"ref":"2:222","name":"Al-Baqarah","themes":["guilt","repentance","love","purification","renewal"],"tafsir":"Allah mencintai orang-orang yang bertaubat dan mencintai orang-orang yang menyucikan diri. Taubat bukan tanda kelemahan — ia adalah tanda kecerdasan dan keberanian spiritual yang Allah cintai."},
  {"ref":"66:8","name":"At-Tahrim","themes":["guilt","repentance","hope","sincerity","fresh start"],"tafsir":"Bertaubatlah kepada Allah dengan taubat yang sesungguhnya. Allah menjanjikan ampunan dan kebaikan bagi yang sungguh-sungguh kembali kepada-Nya dengan hati yang tulus."},
  {"ref":"4:110","name":"An-Nisa","themes":["guilt","forgiveness","mercy","hope","reassurance"],"tafsir":"Barangsiapa berbuat dosa kemudian memohon ampunan, niscaya dia mendapati Allah Maha Pengampun lagi Maha Penyayang. Tidak ada dosa yang membuat Allah menutup pintu ampunan bagi yang sungguh meminta."},
  {"ref":"25:70","name":"Al-Furqan","themes":["guilt","transformation","hope","mercy","new beginning"],"tafsir":"Allah akan mengganti keburukan mereka dengan kebaikan. Kabar gembira ini menunjukkan bahwa setiap taubat yang tulus bisa menjadi awal dari lembaran baru yang lebih indah."},

  # ── LOST DIRECTION / CONFUSION ───────────────────────────────────────────────
  {"ref":"1:6","name":"Al-Fatihah","themes":["lost","guidance","direction","clarity","faith"],"tafsir":"Tunjukilah kami jalan yang lurus. Doa yang kita panjatkan paling tidak 17 kali sehari ini mengingatkan bahwa mencari arah dalam hidup adalah ibadah itu sendiri — dan Allah selalu menjawab."},
  {"ref":"6:125","name":"Al-An'am","themes":["lost","guidance","faith","openness","heart"],"tafsir":"Barangsiapa yang Allah kehendaki untuk diberi petunjuk, Allah lapangkan dadanya untuk Islam. Kelapangan hati dalam menerima kebenaran adalah tanda bahwa Allah sedang membimbing kita ke arah yang benar."},
  {"ref":"94:1","name":"Al-Insyirah","themes":["lost","stress","relief","heart","burden","clarity"],"tafsir":"Bukankah Kami telah melapangkan dadamu? Pertanyaan ini adalah pengingat bahwa Allah sudah pernah melepaskan beban dari seseorang sebelumnya — dan Dia bisa melakukannya lagi untuk kita."},

  # ── ANGER / FRUSTRATION ──────────────────────────────────────────────────────
  {"ref":"3:134","name":"Ali Imran","themes":["anger","patience","forgiveness","control","character"],"tafsir":"Ciri orang yang bertakwa adalah menahan amarah dan memaafkan sesama manusia. Memaafkan bukan tanda kelemahan — ia adalah tanda kebesaran jiwa yang Allah cintai dan muliakan."},
  {"ref":"42:43","name":"Asy-Syura","themes":["anger","patience","forgiveness","strength","virtue"],"tafsir":"Barangsiapa yang bersabar dan memaafkan, sesungguhnya yang demikian itu termasuk hal yang memerlukan keteguhan hati. Mengendalikan amarah adalah prestasi batin yang Allah akui dan hargai."},
  {"ref":"41:34","name":"Fushshilat","themes":["anger","kindness","response","character","wisdom"],"tafsir":"Balaslah perbuatan buruk dengan yang lebih baik. Dengan begitu orang yang pernah bermusuhan denganmu akan menjadi seperti sahabat yang setia. Kebaikan adalah respon paling kuat terhadap kejahatan."},
  {"ref":"7:199","name":"Al-A'raf","themes":["anger","patience","tolerance","wisdom","practicality"],"tafsir":"Jadilah pemaaf, perintahkan kebaikan, dan berpalinglah dari orang-orang yang bodoh. Panduan praktis Allah untuk menghadapi situasi yang memancing emosi dengan kepala dingin."},
  {"ref":"16:126","name":"An-Nahl","themes":["anger","patience","endurance","wisdom","balance"],"tafsir":"Jika kamu membalas, maka balaslah setimpal. Namun jika kamu bersabar, itu lebih baik bagi orang-orang yang sabar. Kesabaran selalu memiliki nilai lebih dari sekadar keadilan."},

  # ── GRATITUDE ────────────────────────────────────────────────────────────────
  {"ref":"14:7","name":"Ibrahim","themes":["gratitude","blessings","increase","thankfulness","abundance"],"tafsir":"Jika kamu bersyukur, sungguh Aku akan menambahkan nikmat kepadamu. Syukur bukan sekedar ucapan terima kasih — ia adalah kunci yang Allah sediakan untuk membuka pintu kelimpahan yang lebih besar."},
  {"ref":"2:152","name":"Al-Baqarah","themes":["gratitude","remembrance","connection","relationship","thankfulness"],"tafsir":"Ingatlah Aku, niscaya Aku ingat pula kepadamu. Bersyukurlah kepada-Ku dan janganlah ingkar. Syukur adalah bentuk komunikasi paling tulus antara hamba dan Tuhannya."},
  {"ref":"16:18","name":"An-Nahl","themes":["gratitude","blessings","abundance","recognition","perspective"],"tafsir":"Jika kamu mencoba menghitung nikmat Allah, niscaya kamu tidak akan sanggup menghitungnya. Undangan untuk mengalihkan fokus dari kekurangan kepada kelimpahan yang sebenarnya sudah ada."},
  {"ref":"55:13","name":"Ar-Rahman","themes":["gratitude","blessings","recognition","awareness"],"tafsir":"Maka nikmat Tuhanmu yang manakah yang kamu dustakan? Pertanyaan berulang ini adalah cara Allah mengajak kita benar-benar berhenti dan sadar akan betapa banyaknya yang sudah diberikan."},
  {"ref":"93:11","name":"Ad-Duha","themes":["gratitude","blessings","expression","sharing","joy"],"tafsir":"Terhadap nikmat Tuhanmu, hendaklah kamu menyebut-nyebutnya. Mengekspresikan rasa syukur bukan sombong — itu adalah bentuk ibadah yang Allah perintahkan dan Allah ridhai."},

  # ── GRIEF / SADNESS ──────────────────────────────────────────────────────────
  {"ref":"2:216","name":"Al-Baqarah","themes":["grief","acceptance","wisdom","trust","sadness","disappointment"],"tafsir":"Boleh jadi kamu membenci sesuatu padahal ia amat baik bagimu. Dan boleh jadi kamu menyukai sesuatu padahal ia amat buruk bagimu. Allah Maha Mengetahui — sedang kamu tidak mengetahui."},
  {"ref":"3:139","name":"Ali Imran","themes":["grief","strength","hope","faith","sadness","resilience"],"tafsir":"Janganlah kamu bersikap lemah dan jangan pula berduka cita. Padahal kamulah yang paling tinggi derajatnya jika kamu beriman. Iman adalah sumber kekuatan yang tidak pernah habis."},

  # ── JEALOUSY / ENVY ──────────────────────────────────────────────────────────
  {"ref":"4:32","name":"An-Nisa","themes":["jealousy","envy","contentment","rizq","acceptance"],"tafsir":"Janganlah kamu iri hati terhadap apa yang Allah karuniakan kepada sebagian yang lain. Setiap orang memiliki bagiannya yang sudah Allah tetapkan dengan adil dan penuh hikmah."},
  {"ref":"2:148","name":"Al-Baqarah","themes":["jealousy","envy","competition","focus","redirect"],"tafsir":"Setiap umat mempunyai kiblatnya. Maka berlomba-lombalah dalam berbuat kebaikan. Energi yang terpakai untuk iri lebih produktif jika dialihkan untuk berlomba dalam amal yang bermakna."},
  {"ref":"16:71","name":"An-Nahl","themes":["jealousy","provision","trust","acceptance","wisdom"],"tafsir":"Allah melebihkan sebagian kamu dari sebagian yang lain dalam rezeki. Perbedaan ini ada dalam rencana Allah yang penuh hikmah — bukan ketidakadilan yang perlu diratapi."},

  # ── FINANCIAL WORRY / RIZQ ────────────────────────────────────────────────────
  {"ref":"11:6","name":"Hud","themes":["financial","provision","rizq","trust","certainty"],"tafsir":"Tidak ada makhluk yang merangkak di bumi kecuali Allah yang menanggung rezekinya. Kamu tidak sendirian menanggung beban finansial — Allah adalah penanggung rezeki yang sejati dan tidak pernah lalai."},
  {"ref":"17:30","name":"Al-Isra","themes":["financial","provision","rizq","wisdom","trust"],"tafsir":"Tuhanmu melapangkan rezeki bagi siapa yang Dia kehendaki dan menyempitkannya. Naik turunnya kondisi finansial ada dalam pengaturan Allah yang penuh hikmah dan kasih sayang."},
  {"ref":"51:22","name":"Adz-Dzariyat","themes":["financial","provision","certainty","trust","rizq"],"tafsir":"Di langit ada rezekinya dan apa yang dijanjikan kepadamu. Rezekinya sudah ada di sana, sudah ditetapkan — tugasmu hanya berikhtiar dan bertawakal tanpa kehilangan harapan."},

  # ── MARRIAGE / RELATIONSHIPS ──────────────────────────────────────────────────
  {"ref":"30:21","name":"Ar-Rum","themes":["marriage","relationship","love","mercy","companionship","family"],"tafsir":"Di antara tanda-tanda kekuasaan-Nya Dia menciptakan bagimu pasangan hidup agar kamu cenderung dan tenteram kepadanya, dan dijadikan-Nya rasa kasih dan sayang di antara kamu. Cinta dalam pernikahan adalah ayat Allah yang nyata."},
  {"ref":"2:187","name":"Al-Baqarah","themes":["marriage","relationship","intimacy","companionship","protection"],"tafsir":"Mereka adalah pakaian bagimu dan kamu adalah pakaian bagi mereka. Gambaran pakaian ini menyiratkan perlindungan, kehangatan, dan keintiman yang Allah kehendaki dalam pernikahan."},
  {"ref":"4:19","name":"An-Nisa","themes":["marriage","relationship","kindness","respect","patience"],"tafsir":"Pergaulilah mereka dengan cara yang patut. Jika kamu tidak menyukai mereka, boleh jadi kamu tidak menyukai sesuatu padahal Allah menjadikan padanya kebaikan yang banyak."},

  # ── HEALTH / ILLNESS ──────────────────────────────────────────────────────────
  {"ref":"26:80","name":"Asy-Syu'ara","themes":["health","illness","healing","trust","hope","surrender"],"tafsir":"Dan apabila aku sakit, Dialah yang menyembuhkan aku. Sakit bukan akhir dari segalanya — dan kesembuhan ada di tangan Allah Al-Syafi, Sang Maha Penyembuh yang tidak pernah gagal."},
  {"ref":"10:57","name":"Yunus","themes":["health","guidance","healing","heart","comfort","hope"],"tafsir":"Wahai manusia, sungguh telah datang kepadamu pelajaran dari Tuhanmu dan penyembuh bagi penyakit dalam dada. Al-Quran sendiri adalah obat — bukan hanya untuk tubuh, tapi terutama untuk jiwa."},
]

def fetch_verse(ref):
    url = f"https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-simple,id.indonesian"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read().decode())
    if data.get("code") != 200 or not data.get("data") or len(data["data"]) < 2:
        raise ValueError(f"API error for {ref}: {data.get('status','unknown')}")
    arabic      = data["data"][0]["text"]
    translation = data["data"][1]["text"]
    ayah_no     = data["data"][0]["numberInSurah"]
    return arabic, translation, ayah_no

def build():
    verses = []
    ok = fail = 0
    for item in SEED:
        print(f"  Fetching {item['ref']} ({item['name']}) … ", end="", flush=True)
        try:
            arabic, translation, ayah_no = fetch_verse(item["ref"])
            verses.append({
                "id":            item["ref"],
                "surah_name":    item["name"],
                "verse_number":  str(ayah_no),
                "arabic":        arabic,
                "translation":   translation,
                "themes":        item["themes"],
                "tafsir_summary": item["tafsir"],
            })
            print("✓")
            ok += 1
        except Exception as e:
            print(f"✗  {e}")
            fail += 1
        time.sleep(0.3)

    out_path = os.path.join(os.path.dirname(__file__), "../data/verses.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(verses, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Built {ok} verses → data/verses.json  ({fail} failed)")

if __name__ == "__main__":
    build()
