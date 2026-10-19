// Gramer çalışma sayfası. İçerik tamamen sayfanın içinde tanımlı; sunucuya
// ihtiyaç yok. Konular üç seviyeye ayrılmıştır (Temel / Orta / İleri). Her konu:
// kısa Türkçe açıklama, yapı tablosu, örnek cümleler (EN + TR) ve birkaç
// çoktan seçmeli alıştırma.

const LEVELS = [
  { key: "basic", id: "level-basic", tr: "Temel",
    title: "Temel Konular", sub: "Başlangıç seviyesi: temel zamanlar ve cümlenin yapı taşları." },
  { key: "inter", id: "level-inter", tr: "Orta",
    title: "Orta Seviye", sub: "Günlük İngilizcede sık geçen zamanlar ve kalıplar." },
  { key: "adv", id: "level-adv", tr: "İleri",
    title: "İleri Seviye", sub: "Üst seviye zamanlar ve karmaşık cümle yapıları." },
];

const TOPICS = [
  // ---- TEMEL ----------------------------------------------------------------
  {
    id: "present-simple", level: "basic",
    tr: "Geniş Zaman", en: "Present Simple",
    intro: "Alışkanlıkları, tekrar eden eylemleri ve genel doğruları anlatır. Özne 3. tekil şahıssa (he / she / it) fiile -s eklenir.",
    struct: [
      ["Olumlu", "I / you / we / they work · he / she / it works"],
      ["Olumsuz", "I don’t work · she doesn’t work"],
      ["Soru", "Do you work? · Does she work?"],
    ],
    examples: [
      ["She reads a book every night.", "O her gece bir kitap okur."],
      ["Water boils at 100 degrees.", "Su 100 derecede kaynar."],
      ["They don’t live here.", "Onlar burada yaşamıyor."],
      ["Does he speak English?", "O İngilizce konuşur mu?"],
    ],
    hint: "Sıklık zarfları (always, usually, often, sometimes, never) genellikle fiilden önce gelir: She always drinks tea.",
    quiz: [
      { q: "My brother ___ to work by bus.", opts: ["go", "goes", "going"], answer: 1,
        note: "3. tekil şahıs (he) olduğu için fiile -es eklenir: goes." },
      { q: "___ they live in Ankara?", opts: ["Do", "Does", "Are"], answer: 0,
        note: "Özne 'they' olduğu için soru 'Do' ile kurulur." },
      { q: "She ___ like coffee.", opts: ["don’t", "doesn’t", "isn’t"], answer: 1,
        note: "3. tekil şahısta olumsuzluk 'doesn’t' ile yapılır ve fiil yalın kalır." },
    ],
  },
  {
    id: "present-continuous", level: "basic",
    tr: "Şimdiki Zaman", en: "Present Continuous",
    intro: "Şu anda ya da bu günlerde süren eylemleri anlatır. Yapı: be (am / is / are) + fiil-ing.",
    struct: [
      ["Olumlu", "I am working · you are working · she is working"],
      ["Olumsuz", "I’m not working · they aren’t working"],
      ["Soru", "Are you working? · Is she working?"],
    ],
    examples: [
      ["I am reading right now.", "Şu anda okuyorum."],
      ["They are playing in the garden.", "Bahçede oynuyorlar."],
      ["She isn’t listening to you.", "Seni dinlemiyor."],
      ["What are you doing?", "Ne yapıyorsun?"],
    ],
    hint: "know, like, want, believe gibi durum fiilleri genellikle -ing almaz: I know the answer (I am knowing değil).",
    quiz: [
      { q: "Look! The baby ___ sleeping.", opts: ["is", "are", "does"], answer: 0,
        note: "Özne 'the baby' tekil olduğu için 'is' kullanılır." },
      { q: "We ___ watching a film at the moment.", opts: ["is", "are", "am"], answer: 1,
        note: "Özne 'we' için yardımcı fiil 'are'." },
      { q: "He is ___ a letter.", opts: ["write", "writes", "writing"], answer: 2,
        note: "be fiilinden sonra ana fiil -ing alır: writing." },
    ],
  },
  {
    id: "past-simple", level: "basic",
    tr: "Geçmiş Zaman", en: "Past Simple",
    intro: "Geçmişte tamamlanmış eylemleri anlatır. Düzenli fiiller -ed alır (work → worked); düzensiz fiillerin ikinci hâli (V2) ezberlenir (go → went, see → saw).",
    struct: [
      ["Olumlu", "I worked · she went"],
      ["Olumsuz", "I didn’t work · she didn’t go"],
      ["Soru", "Did you work? · Did she go?"],
    ],
    examples: [
      ["We visited the museum yesterday.", "Dün müzeyi ziyaret ettik."],
      ["He bought a new phone.", "Yeni bir telefon aldı."],
      ["I didn’t see her at school.", "Onu okulda görmedim."],
      ["Did they finish the project?", "Projeyi bitirdiler mi?"],
    ],
    hint: "Olumsuz ve soruda 'did' zamanı taşır, ana fiil yalın hâle döner: She didn’t go (didn’t went değil).",
    quiz: [
      { q: "They ___ to Italy last summer.", opts: ["go", "went", "gone"], answer: 1,
        note: "go fiilinin ikinci hâli (V2) 'went'." },
      { q: "I ___ watch TV last night.", opts: ["didn’t", "don’t", "wasn’t"], answer: 0,
        note: "Geçmiş zaman olumsuzu 'didn’t' + yalın fiil." },
      { q: "___ you call him yesterday?", opts: ["Do", "Did", "Were"], answer: 1,
        note: "Geçmiş zaman sorusu 'Did' ile kurulur." },
    ],
  },
  {
    id: "articles", level: "basic",
    tr: "Artikeller (a / an / the)", en: "Articles",
    intro: "'a / an' ilk kez bahsedilen, belirsiz tekil bir şey içindir; sesli harf sesiyle başlayan sözcüklerden önce 'an' gelir. 'the' hem konuşanın hem dinleyenin bildiği belirli bir şey içindir.",
    struct: [
      ["a / an", "a book · an apple · an hour (sessiz h)"],
      ["the", "the sun · the book you gave me"],
      ["artikelsiz", "I like music. · Dogs are loyal. (genel anlam)"],
    ],
    examples: [
      ["I saw a dog. The dog was black.", "Bir köpek gördüm. Köpek siyahtı."],
      ["She is an engineer.", "O bir mühendis."],
      ["The moon is bright tonight.", "Ay bu gece parlak."],
      ["I usually have breakfast at eight.", "Genellikle sekizde kahvaltı ederim."],
    ],
    hint: "Seçim yazılışa değil sese bağlıdır: 'an hour' (h okunmaz) ama 'a university' (yu- sesi).",
    quiz: [
      { q: "She wants to be ___ artist.", opts: ["a", "an", "the"], answer: 1,
        note: "'artist' sesli harf sesiyle başlar → an." },
      { q: "Can you close ___ door, please?", opts: ["a", "an", "the"], answer: 2,
        note: "Belirli, bilinen bir kapı → the." },
      { q: "I bought ___ umbrella yesterday.", opts: ["a", "an", "the"], answer: 1,
        note: "'umbrella' /ʌ/ sesiyle başlar → an." },
    ],
  },
  {
    id: "plurals", level: "basic",
    tr: "Çoğullar", en: "Plural Nouns",
    intro: "Çoğu isim -s alır. -s, -ss, -sh, -ch, -x ile bitenler -es alır. Ünsüz + y ile bitenlerde y düşer, -ies gelir. Bazı isimler düzensizdir.",
    struct: [
      ["+s", "book → books · car → cars"],
      ["+es", "box → boxes · watch → watches"],
      ["y → ies", "city → cities · baby → babies"],
      ["düzensiz", "man → men · child → children · foot → feet"],
    ],
    examples: [
      ["There are three buses at the stop.", "Durakta üç otobüs var."],
      ["She has two children.", "İki çocuğu var."],
      ["The leaves fall in autumn.", "Yapraklar sonbaharda düşer."],
      ["I need some potatoes.", "Biraz patatese ihtiyacım var."],
    ],
    hint: "Sesli harf + y ise kural dışıdır, sadece -s eklenir: day → days, key → keys.",
    quiz: [
      { q: "I have two ___.", opts: ["childs", "children", "childrens"], answer: 1,
        note: "child isminin düzensiz çoğulu 'children'." },
      { q: "There are many ___ in this city.", opts: ["churchs", "churches", "churchies"], answer: 1,
        note: "-ch ile biten isimler -es alır: churches." },
      { q: "We visited three ___ last year.", opts: ["citys", "cities", "cityes"], answer: 1,
        note: "Ünsüz + y: y düşer, -ies gelir: cities." },
    ],
  },
  {
    id: "prepositions", level: "basic",
    tr: "Zaman ve Yer Edatları", en: "in / on / at",
    intro: "in / on / at hem zaman hem yer için kullanılır. Genelden özele doğru daralır: in (geniş) → on (orta) → at (nokta).",
    struct: [
      ["Zaman", "in May, in 2020 · on Monday, on May 5 · at 7 o’clock, at night"],
      ["Yer", "in the room · on the table · at the door"],
    ],
    examples: [
      ["The meeting is on Friday.", "Toplantı cuma günü."],
      ["I was born in April.", "Nisan’da doğdum."],
      ["She is waiting at the bus stop.", "Otobüs durağında bekliyor."],
      ["The keys are on the table.", "Anahtarlar masanın üstünde."],
    ],
    hint: "Kalıplara dikkat: at night ama in the morning / in the afternoon / in the evening.",
    quiz: [
      { q: "The shop opens ___ 9 a.m.", opts: ["in", "on", "at"], answer: 2,
        note: "Saat için 'at' kullanılır: at 9 a.m." },
      { q: "My birthday is ___ December.", opts: ["in", "on", "at"], answer: 0,
        note: "Aylar için 'in' kullanılır: in December." },
      { q: "We have a lesson ___ Monday.", opts: ["in", "on", "at"], answer: 1,
        note: "Günler için 'on' kullanılır: on Monday." },
    ],
  },
  {
    id: "quantifiers", level: "basic",
    tr: "Miktar Belirten Sözcükler", en: "some / any / much / many",
    intro: "Sayılabilen isimler tek tek sayılır (one apple, two apples); sayılamayanlar sayılmaz (water, money). 'some' olumlu cümlelerde, 'any' olumsuz ve sorularda; 'many' sayılabilen çoğullarla, 'much' sayılamayanlarla kullanılır.",
    struct: [
      ["some / any", "I have some money. · I don’t have any money. · Do you have any questions?"],
      ["much / many", "How much water? · How many books?"],
      ["a lot of", "olumluda her ikisiyle: a lot of friends · a lot of time"],
    ],
    examples: [
      ["There is some milk in the fridge.", "Buzdolabında biraz süt var."],
      ["I don’t have any sugar.", "Hiç şekerim yok."],
      ["How many students are there?", "Kaç öğrenci var?"],
      ["She doesn’t drink much coffee.", "Fazla kahve içmez."],
    ],
    hint: "Soruda sayılamayanlar için 'how much', sayılabilenler için 'how many' kullanılır.",
    quiz: [
      { q: "There aren’t ___ eggs left.", opts: ["some", "any", "much"], answer: 1,
        note: "Olumsuz cümlede 'any' kullanılır." },
      { q: "How ___ money do you need?", opts: ["many", "much", "few"], answer: 1,
        note: "money sayılamaz, bu yüzden 'much'." },
      { q: "I have ___ books to read.", opts: ["much", "a lot of", "any"], answer: 1,
        note: "Olumlu cümlede sayılabilen çoğulla 'a lot of' doğaldır." },
    ],
  },

  // ---- ORTA -----------------------------------------------------------------
  {
    id: "present-perfect", level: "inter",
    tr: "Yakın Geçmiş (Present Perfect)", en: "Present Perfect",
    intro: "Geçmişte olup etkisi şimdiye uzanan ya da zamanı belirtilmemiş eylemler için kullanılır. Yapı: have / has + fiilin üçüncü hâli (V3).",
    struct: [
      ["Olumlu", "I have finished · she has finished"],
      ["Olumsuz", "I haven’t finished · she hasn’t finished"],
      ["Soru", "Have you finished? · Has she finished?"],
    ],
    examples: [
      ["I have read this book.", "Bu kitabı okudum (okumuş durumdayım)."],
      ["She has lived here for ten years.", "On yıldır burada yaşıyor."],
      ["We haven’t met before.", "Daha önce tanışmadık."],
      ["Have you ever been to London?", "Hiç Londra’ya gittin mi?"],
    ],
    hint: "'for' bir süre uzunluğunu (for three days), 'since' bir başlangıç anını (since Monday) gösterir.",
    quiz: [
      { q: "She ___ just arrived.", opts: ["have", "has", "is"], answer: 1,
        note: "3. tekil şahısta yardımcı fiil 'has'." },
      { q: "I have ___ my keys.", opts: ["lose", "lost", "losing"], answer: 1,
        note: "Present perfect'te fiilin üçüncü hâli (V3) kullanılır: lost." },
      { q: "They ___ finished their homework yet.", opts: ["haven’t", "didn’t", "don’t"], answer: 0,
        note: "'yet' ile birlikte present perfect olumsuzu: haven’t." },
    ],
  },
  {
    id: "future", level: "inter",
    tr: "Gelecek Zaman", en: "will / be going to",
    intro: "'will' o an verilen kararlar, tahminler ve vaatler için; 'be going to' önceden yapılmış planlar ve belirtileri olan tahminler için kullanılır.",
    struct: [
      ["will", "I will call you. · She won’t come."],
      ["be going to", "I am going to study. · Are you going to help?"],
    ],
    examples: [
      ["I think it will rain tomorrow.", "Sanırım yarın yağmur yağacak."],
      ["We are going to buy a car.", "Araba alacağız (planlıyoruz)."],
      ["She won’t be late.", "Geç kalmayacak."],
      ["Look at those clouds — it is going to rain.", "Şu bulutlara bak — yağmur yağacak."],
    ],
    hint: "Önceden kurulmuş bir planda 'be going to' daha doğaldır: I’m going to visit my aunt on Sunday.",
    quiz: [
      { q: "The phone is ringing. I ___ answer it.", opts: ["will", "am going to", "won’t"], answer: 0,
        note: "O an alınan karar için 'will' kullanılır." },
      { q: "We ___ going to paint the house next week.", opts: ["will", "are", "do"], answer: 1,
        note: "'be going to' yapısında özneye uygun be fiili gerekir: we → are." },
      { q: "She ___ come to the party. She is ill.", opts: ["will", "won’t", "is"], answer: 1,
        note: "Olumsuz tahmin: won’t (will not)." },
    ],
  },
  {
    id: "comparatives", level: "inter",
    tr: "Karşılaştırma", en: "Comparatives & Superlatives",
    intro: "Kısa sıfatlar -er / -est alır (tall → taller → the tallest). Uzun sıfatlarda more / most kullanılır. İki şeyi karşılaştırırken 'than' gelir.",
    struct: [
      ["Kısa sıfat", "cheap → cheaper → the cheapest"],
      ["Uzun sıfat", "useful → more useful → the most useful"],
      ["Düzensiz", "good → better → best · bad → worse → worst"],
    ],
    examples: [
      ["This book is cheaper than that one.", "Bu kitap şundan daha ucuz."],
      ["She is the tallest in her class.", "Sınıfının en uzunu o."],
      ["Today is more interesting than yesterday.", "Bugün dünden daha ilginç."],
      ["It was the best day of my life.", "Hayatımın en güzel günüydü."],
    ],
    hint: "Tek heceli ve sonu tek ünsüzle biten sıfatlarda ünsüz çiftlenir: big → bigger, hot → hottest.",
    quiz: [
      { q: "A plane is ___ than a car.", opts: ["fast", "faster", "fastest"], answer: 1,
        note: "İki şeyin karşılaştırması: faster + than." },
      { q: "This is the ___ film I have ever seen.", opts: ["good", "better", "best"], answer: 2,
        note: "good sıfatının üstünlük hâli düzensizdir: best." },
      { q: "Health is ___ important than money.", opts: ["more", "most", "much"], answer: 0,
        note: "Uzun sıfatta karşılaştırma 'more' ile yapılır." },
    ],
  },
  {
    id: "modals", level: "inter",
    tr: "Modal Fiiller", en: "can / must / should …",
    intro: "Modal fiiller yetenek, izin, zorunluluk ve öneri bildirir. Kendilerinden sonra her zaman yalın fiil gelir ve 3. tekil şahısta -s almazlar.",
    struct: [
      ["can / could", "yetenek, izin: I can swim."],
      ["must / have to", "zorunluluk: You must stop."],
      ["should", "öneri: You should rest."],
      ["may / might", "olasılık, izin: It might rain."],
    ],
    examples: [
      ["She can speak three languages.", "Üç dil konuşabiliyor."],
      ["You should see a doctor.", "Bir doktora görünmelisin."],
      ["We must wear a seatbelt.", "Emniyet kemeri takmalıyız."],
      ["Could you help me, please?", "Bana yardım edebilir misin?"],
    ],
    hint: "Modaldan sonra 'to' kullanılmaz: She can swim (can to swim değil). İstisna: have to, ought to.",
    quiz: [
      { q: "You ___ smoke here. It is forbidden.", opts: ["mustn’t", "shouldn’t", "can"], answer: 0,
        note: "Yasak bir şey için güçlü 'mustn’t' kullanılır." },
      { q: "She can ___ very well.", opts: ["sings", "sing", "singing"], answer: 1,
        note: "Modal fiilden sonra yalın fiil gelir: sing." },
      { q: "It’s cold. You ___ wear a coat.", opts: ["should", "must not", "can’t"], answer: 0,
        note: "Öneri bildirmek için 'should' uygundur." },
    ],
  },
  {
    id: "past-continuous", level: "inter",
    tr: "Sürekli Geçmiş Zaman", en: "Past Continuous",
    intro: "Geçmişte belirli bir anda sürmekte olan eylemi anlatır. Yapı: was / were + fiil-ing. Genellikle Past Simple ile birlikte, kesintiye uğrayan bir eylem için kullanılır.",
    struct: [
      ["Olumlu", "I was working · they were working"],
      ["Olumsuz", "I wasn’t working · they weren’t working"],
      ["Soru", "Were you working? · Was she working?"],
    ],
    examples: [
      ["I was reading when the phone rang.", "Telefon çaldığında okuyordum."],
      ["They were playing football at six.", "Saat altıda futbol oynuyorlardı."],
      ["What were you doing last night?", "Dün gece ne yapıyordun?"],
      ["While she was cooking, he arrived.", "O yemek yaparken adam geldi."],
    ],
    hint: "Kısa, kesen eylem Past Simple; sürmekte olan uzun eylem Past Continuous olur: While I was cooking, I cut my finger.",
    quiz: [
      { q: "While she ___, the lights went out.", opts: ["cooked", "was cooking", "cooks"], answer: 1,
        note: "Sürmekte olan uzun eylem için Past Continuous: was cooking." },
      { q: "They ___ sleeping when I arrived.", opts: ["was", "were", "are"], answer: 1,
        note: "Özne 'they' için 'were'." },
      { q: "I ___ watching TV at 9 p.m. yesterday.", opts: ["was", "were", "am"], answer: 0,
        note: "Özne 'I' için 'was'." },
    ],
  },
  {
    id: "used-to", level: "inter",
    tr: "Geçmiş Alışkanlıklar", en: "used to",
    intro: "'used to + yalın fiil', geçmişte düzenli yapılan ama artık yapılmayan eylemleri ya da geçmişteki durumları anlatır. Şimdiki zaman için karşılığı yoktur.",
    struct: [
      ["Olumlu", "I used to smoke."],
      ["Olumsuz", "I didn’t use to smoke."],
      ["Soru", "Did you use to smoke?"],
    ],
    examples: [
      ["I used to live in a village.", "Eskiden bir köyde yaşardım."],
      ["She used to play the piano.", "Eskiden piyano çalardı."],
      ["We didn’t use to have a car.", "Eskiden arabamız yoktu."],
      ["Did you use to walk to school?", "Eskiden okula yürür müydün?"],
    ],
    hint: "Olumsuz ve soruda sondaki 'd' düşer: didn’t use to, Did you use to (used to değil).",
    quiz: [
      { q: "He ___ to work here, but he left.", opts: ["use", "used", "uses"], answer: 1,
        note: "Olumlu cümlede 'used to'." },
      { q: "I didn’t ___ to like coffee.", opts: ["use", "used", "using"], answer: 0,
        note: "Olumsuzda 'd' düşer: didn’t use to." },
      { q: "There ___ to be a cinema here.", opts: ["use", "used", "uses"], answer: 1,
        note: "Geçmişteki durum: used to be." },
    ],
  },
  {
    id: "gerund-infinitive", level: "inter",
    tr: "Mastar ve -ing", en: "Gerund & Infinitive",
    intro: "Bazı fiillerden sonra -ing (gerund), bazılarından sonra 'to + fiil' (infinitive) gelir. enjoy, like, finish, avoid → -ing; want, decide, hope, need → to.",
    struct: [
      ["-ing", "enjoy reading · finish working · avoid eating"],
      ["to + fiil", "want to go · decide to stay · hope to win"],
      ["edattan sonra", "hep -ing: good at drawing · interested in learning"],
    ],
    examples: [
      ["I enjoy swimming.", "Yüzmekten keyif alırım."],
      ["She wants to learn French.", "Fransızca öğrenmek istiyor."],
      ["He is good at cooking.", "Yemek yapmakta iyidir."],
      ["Reading is fun.", "Okumak eğlencelidir."],
    ],
    hint: "Cümlenin öznesi olarak da -ing kullanılır: Smoking is bad for you.",
    quiz: [
      { q: "I want ___ home now.", opts: ["go", "to go", "going"], answer: 1,
        note: "want fiilinden sonra 'to + fiil' gelir." },
      { q: "She enjoys ___ to music.", opts: ["listen", "to listen", "listening"], answer: 2,
        note: "enjoy fiilinden sonra -ing gelir: listening." },
      { q: "They decided ___ early.", opts: ["leave", "to leave", "leaving"], answer: 1,
        note: "decide fiilinden sonra 'to + fiil' gelir." },
    ],
  },
  {
    id: "conditionals-12", level: "inter",
    tr: "Koşul Cümleleri (Tip 1 ve 2)", en: "First & Second Conditional",
    intro: "Tip 1 gerçek, olası durumlar içindir: If + present simple, will + fiil. Tip 2 hayali ya da olası olmayan durumlar içindir: If + past simple, would + fiil.",
    struct: [
      ["Tip 1 (olası)", "If it rains, I will stay home."],
      ["Tip 2 (hayali)", "If I had money, I would travel."],
      ["was → were", "If I were you, I would rest."],
    ],
    examples: [
      ["If you study, you will pass.", "Çalışırsan geçersin."],
      ["If I were rich, I would help people.", "Zengin olsam insanlara yardım ederdim."],
      ["She will call if she needs help.", "Yardıma ihtiyacı olursa arar."],
      ["What would you do if you won?", "Kazansan ne yapardın?"],
    ],
    hint: "Tip 2'de genellikle her öznede 'were' kullanılır: If he were here…",
    quiz: [
      { q: "If it ___ tomorrow, we will cancel.", opts: ["rains", "rained", "will rain"], answer: 0,
        note: "Tip 1: If + present simple → rains." },
      { q: "If I ___ you, I would apologize.", opts: ["am", "was", "were"], answer: 2,
        note: "Tip 2'de 'were' tercih edilir: If I were you." },
      { q: "She would buy it if she ___ enough money.", opts: ["has", "had", "will have"], answer: 1,
        note: "Tip 2: If + past simple → had." },
    ],
  },

  // ---- İLERİ ----------------------------------------------------------------
  {
    id: "past-perfect", level: "adv",
    tr: "Miş’li Geçmişin Hikâyesi", en: "Past Perfect",
    intro: "Geçmişteki bir olaydan daha önce tamamlanmış başka bir olayı anlatır. Yapı: had + fiilin üçüncü hâli (V3). İki geçmiş olaydan önce olanı belirtir.",
    struct: [
      ["Olumlu", "I had finished · she had gone"],
      ["Olumsuz", "I hadn’t finished"],
      ["Soru", "Had you finished?"],
    ],
    examples: [
      ["The train had left when we arrived.", "Biz vardığımızda tren kalkmıştı."],
      ["She had never seen the sea before.", "Daha önce denizi hiç görmemişti."],
      ["After he had eaten, he went out.", "Yemek yedikten sonra dışarı çıktı."],
      ["I realized I had forgotten my keys.", "Anahtarlarımı unuttuğumu fark ettim."],
    ],
    hint: "Önce olan eylem Past Perfect (had + V3), sonra olan eylem Past Simple olur.",
    quiz: [
      { q: "When I got there, the film ___ already started.", opts: ["has", "had", "was"], answer: 1,
        note: "Daha önce gerçekleşen olay: had + V3." },
      { q: "They ___ left before we called.", opts: ["have", "had", "did"], answer: 1,
        note: "Geçmişten önceki geçmiş için 'had'." },
      { q: "She had ___ her homework before dinner.", opts: ["do", "did", "done"], answer: 2,
        note: "had + fiilin üçüncü hâli (V3): done." },
    ],
  },
  {
    id: "present-perfect-continuous", level: "adv",
    tr: "Sürekli Yakın Geçmiş", en: "Present Perfect Continuous",
    intro: "Geçmişte başlayıp hâlâ süren (ya da yeni bitmiş) ve süresi vurgulanan eylemler içindir. Yapı: have / has been + fiil-ing.",
    struct: [
      ["Olumlu", "I have been working · she has been working"],
      ["Olumsuz", "I haven’t been working"],
      ["Soru", "Have you been working?"],
    ],
    examples: [
      ["I have been studying for three hours.", "Üç saattir çalışıyorum."],
      ["It has been raining all day.", "Bütün gün yağmur yağıyor."],
      ["She has been living here since 2010.", "2010’dan beri burada yaşıyor."],
      ["Why are you tired? — I have been running.", "Neden yorgunsun? — Koşuyordum."],
    ],
    hint: "Süre/süreklilik önemliyse Perfect Continuous; sonuç ya da adet önemliyse Present Perfect: I’ve read three books.",
    quiz: [
      { q: "I have been ___ for you for an hour.", opts: ["wait", "waited", "waiting"], answer: 2,
        note: "have been + fiil-ing: waiting." },
      { q: "She ___ been working since morning.", opts: ["have", "has", "is"], answer: 1,
        note: "3. tekil şahısta 'has been'." },
      { q: "How long have you ___ learning English?", opts: ["been", "being", "be"], answer: 0,
        note: "Yapı: have been + -ing." },
    ],
  },
  {
    id: "passive", level: "adv",
    tr: "Edilgen Çatı", en: "Passive Voice",
    intro: "Eylemi kimin yaptığından çok eylemin kendisi önemliyse edilgen çatı kullanılır. Yapı: be (uygun zamanda) + fiilin üçüncü hâli (V3). Yapanı belirtmek için 'by' gelir.",
    struct: [
      ["Present", "English is spoken here."],
      ["Past", "The house was built in 1990."],
      ["by ile", "The book was written by her."],
    ],
    examples: [
      ["This bridge was built last year.", "Bu köprü geçen yıl yapıldı."],
      ["Coffee is grown in Brazil.", "Kahve Brezilya’da yetiştirilir."],
      ["The window has been broken.", "Pencere kırılmış."],
      ["The results will be announced tomorrow.", "Sonuçlar yarın açıklanacak."],
    ],
    hint: "Edilgende özne, eylemi yapan değil eylemden etkilenendir: The cake was eaten (pasta yenildi).",
    quiz: [
      { q: "The letter ___ yesterday.", opts: ["sent", "was sent", "sends"], answer: 1,
        note: "Geçmiş edilgen: was + V3 (sent)." },
      { q: "English ___ in many countries.", opts: ["speaks", "is spoken", "spoke"], answer: 1,
        note: "Present edilgen: is + V3 (spoken)." },
      { q: "The room ___ cleaned every day.", opts: ["is", "was", "has"], answer: 0,
        note: "every day geniş zamanı gösterir: is cleaned." },
    ],
  },
  {
    id: "reported-speech", level: "adv",
    tr: "Dolaylı Anlatım", en: "Reported Speech",
    intro: "Birinin söylediğini aktarırken zaman genellikle bir adım geriye kayar (present → past), zamirler ve zaman ifadeleri değişir.",
    struct: [
      ["present → past", "“I am tired” → He said he was tired."],
      ["will → would", "“I will come” → She said she would come."],
      ["soru: ask", "“Where do you live?” → He asked where I lived."],
    ],
    examples: [
      ["She said (that) she was busy.", "Meşgul olduğunu söyledi."],
      ["He told me he had finished.", "Bitirdiğini söyledi."],
      ["They asked if I wanted tea.", "Çay isteyip istemediğimi sordular."],
      ["She said she would call later.", "Daha sonra arayacağını söyledi."],
    ],
    hint: "'say' nesnesiz, 'tell' nesneyle kullanılır: He said he was late / He told me he was late.",
    quiz: [
      { q: "She said she ___ tired.", opts: ["is", "was", "will"], answer: 1,
        note: "Dolaylı anlatımda present → past: was." },
      { q: "He told ___ he was leaving.", opts: ["to me", "me", "for me"], answer: 1,
        note: "tell + nesne (edatsız): told me." },
      { q: "They asked where I ___.", opts: ["live", "lived", "living"], answer: 1,
        note: "Dolaylı soruda zaman geriye kayar: lived." },
    ],
  },
  {
    id: "relative-clauses", level: "adv",
    tr: "İlgi Cümlecikleri", en: "Relative Clauses",
    intro: "Bir ismi tanımlamak için who (insan), which (nesne/hayvan), that (her ikisi), where (yer), whose (iyelik) kullanılır.",
    struct: [
      ["who / that", "the man who called · a book that sells well"],
      ["which", "the car which broke down"],
      ["where / whose", "the house where I live · the girl whose bag is red"],
    ],
    examples: [
      ["The woman who lives next door is a doctor.", "Yan dairede oturan kadın doktor."],
      ["This is the book that I told you about.", "Sana bahsettiğim kitap bu."],
      ["That’s the town where I was born.", "Doğduğum kasaba orası."],
      ["I know a man whose son is a pilot.", "Oğlu pilot olan bir adam tanıyorum."],
    ],
    hint: "Nesne konumunda who/which/that çoğu zaman düşebilir: the book (that) I read.",
    quiz: [
      { q: "The man ___ helped me was kind.", opts: ["which", "who", "where"], answer: 1,
        note: "İnsan için 'who'." },
      { q: "This is the phone ___ I bought.", opts: ["who", "which", "whose"], answer: 1,
        note: "Nesne için 'which'." },
      { q: "She lives in a city ___ it never snows.", opts: ["which", "where", "who"], answer: 1,
        note: "Yer için 'where'." },
    ],
  },
  {
    id: "third-conditional", level: "adv",
    tr: "Tip 3 Koşul ve wish", en: "Third Conditional & Wish",
    intro: "Tip 3, geçmişte gerçekleşmemiş hayali durumlar içindir: If + past perfect, would have + V3. 'wish + past perfect' geçmişle ilgili pişmanlık anlatır.",
    struct: [
      ["Tip 3", "If I had known, I would have come."],
      ["wish (geçmiş)", "I wish I had studied more."],
      ["wish (şimdi)", "I wish I were taller."],
    ],
    examples: [
      ["If she had hurried, she wouldn’t have missed the bus.", "Acele etseydi otobüsü kaçırmazdı."],
      ["I wish I had called you.", "Keşke seni arasaydım."],
      ["He wishes he hadn’t said that.", "Keşke onu söylememiş olsaydı."],
      ["If we had left earlier, we would have been on time.", "Daha erken çıksaydık zamanında varırdık."],
    ],
    hint: "Tip 3 hep geçmişe bakar ve artık değiştirilemeyecek bir durumu anlatır.",
    quiz: [
      { q: "If I had seen you, I ___ said hello.", opts: ["would", "would have", "will"], answer: 1,
        note: "Tip 3 sonuç kısmı: would have + V3." },
      { q: "I wish I ___ harder for the exam.", opts: ["studied", "had studied", "study"], answer: 1,
        note: "Geçmiş pişmanlığı: wish + past perfect (had studied)." },
      { q: "If they had left earlier, they ___ arrived on time.", opts: ["would have", "will have", "had"], answer: 0,
        note: "Tip 3: would have + V3." },
    ],
  },
  {
    id: "question-tags", level: "adv",
    tr: "Soru Ekleri", en: "Question Tags",
    intro: "Cümle sonuna eklenen kısa sorulardır; onay almak için kullanılır. Olumlu cümleye olumsuz ek, olumsuz cümleye olumlu ek gelir ve yardımcı fiil tekrarlanır.",
    struct: [
      ["olumlu → olumsuz ek", "You are tired, aren’t you?"],
      ["olumsuz → olumlu ek", "She isn’t here, is she?"],
      ["do / does / did", "You like tea, don’t you?"],
    ],
    examples: [
      ["It’s cold today, isn’t it?", "Bugün hava soğuk, değil mi?"],
      ["You can swim, can’t you?", "Yüzebiliyorsun, değil mi?"],
      ["They didn’t come, did they?", "Gelmediler, değil mi?"],
      ["She works here, doesn’t she?", "Burada çalışıyor, değil mi?"],
    ],
    hint: "'I am' için ek 'aren’t I?' olur: I’m late, aren’t I?",
    quiz: [
      { q: "She is a teacher, ___?", opts: ["isn’t she", "is she", "doesn’t she"], answer: 0,
        note: "Olumlu cümle → olumsuz ek: isn’t she." },
      { q: "You don’t smoke, ___?", opts: ["do you", "don’t you", "are you"], answer: 0,
        note: "Olumsuz cümle → olumlu ek: do you." },
      { q: "They can help, ___?", opts: ["can they", "can’t they", "do they"], answer: 1,
        note: "Olumlu cümle, yardımcı fiil 'can' → can’t they." },
    ],
  },
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("aria") || k === "role" || k === "type" || k === "href" || k === "id")
      node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function renderQuiz(topic) {
  const wrap = el("div", { class: "practice" });
  wrap.append(el("h3", { class: "practice-title", text: "Alıştırma" }));
  for (const item of topic.quiz) {
    const card = el("div", { class: "q" });
    // Soru metnini boşluk çevresinde bölüp ___ yerine bir işaret koyarız.
    const [before, after] = item.q.split("___");
    const line = el("p", { class: "q-text" }, [
      document.createTextNode(before),
      el("span", { class: "blank", text: "____" }),
      document.createTextNode(after ?? ""),
    ]);
    card.append(line);

    const opts = el("div", { class: "opts", role: "group" });
    const feedback = el("p", { class: "q-feedback", role: "status" });
    let answered = false;
    item.opts.forEach((text, i) => {
      const btn = el("button", { type: "button", class: "opt", text });
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === item.answer;
        [...opts.children].forEach((b, j) => {
          b.disabled = true;
          if (j === item.answer) b.classList.add("right");
          else if (j === i) b.classList.add("wrong");
        });
        feedback.textContent = (correct ? "Doğru. " : "Yanlış. ") + (item.note || "");
        feedback.classList.add(correct ? "ok" : "bad");
      });
      opts.append(btn);
    });
    card.append(opts, feedback);
    wrap.append(card);
  }
  return wrap;
}

function renderTopic(topic) {
  const sec = el("section", { class: "topic", id: topic.id, "aria-labelledby": `${topic.id}-h` });

  const head = el("div", { class: "topic-head" }, [
    el("h3", { id: `${topic.id}-h`, class: "topic-title", text: topic.tr }),
    el("span", { class: "topic-en", text: topic.en }),
  ]);
  sec.append(head);
  sec.append(el("p", { class: "explain", text: topic.intro }));

  if (topic.struct) {
    const table = el("div", { class: "struct" });
    for (const [label, body] of topic.struct) {
      table.append(
        el("div", { class: "struct-row" }, [
          el("span", { class: "struct-label", text: label }),
          el("span", { class: "struct-body", text: body }),
        ]),
      );
    }
    sec.append(table);
  }

  const ex = el("ul", { class: "examples" });
  for (const [en, tr] of topic.examples) {
    ex.append(el("li", {}, [
      el("span", { class: "ex-en", text: en }),
      el("span", { class: "ex-tr", text: tr }),
    ]));
  }
  sec.append(ex);

  if (topic.hint) {
    sec.append(el("p", { class: "hint" }, [
      el("strong", { text: "İpucu: " }),
      document.createTextNode(topic.hint),
    ]));
  }

  sec.append(renderQuiz(topic));
  return sec;
}

function buildNav() {
  const nav = document.getElementById("level-nav");
  for (const lvl of LEVELS) {
    const count = TOPICS.filter((t) => t.level === lvl.key).length;
    const chip = el("a", { class: "level-chip", href: `#${lvl.id}` }, [
      document.createTextNode(lvl.tr),
      el("span", { class: "chip-count", text: String(count) }),
    ]);
    nav.append(chip);
  }
}

function main() {
  buildNav();
  const list = document.getElementById("topics");
  for (const lvl of LEVELS) {
    const section = el("section", { class: "level", "aria-labelledby": `${lvl.id}-h` });
    section.append(el("header", { class: "level-head", id: lvl.id }, [
      el("h2", { id: `${lvl.id}-h`, text: lvl.title }),
      el("p", { class: "level-sub", text: lvl.sub }),
    ]));
    for (const t of TOPICS.filter((t) => t.level === lvl.key)) section.append(renderTopic(t));
    list.append(section);
  }
  list.removeAttribute("aria-busy");
}

main();
