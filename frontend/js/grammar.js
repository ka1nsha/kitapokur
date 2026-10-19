// Gramer çalışma sayfası. İçerik tamamen sayfanın içinde tanımlı; sunucuya
// ihtiyaç yok. Her konu: kısa Türkçe açıklama, yapı tablosu, örnek cümleler
// (EN + TR) ve birkaç çoktan seçmeli alıştırma.

const TOPICS = [
  {
    id: "present-simple",
    tr: "Geniş Zaman",
    en: "Present Simple",
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
    id: "present-continuous",
    tr: "Şimdiki Zaman",
    en: "Present Continuous",
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
    id: "past-simple",
    tr: "Geçmiş Zaman",
    en: "Past Simple",
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
    id: "present-perfect",
    tr: "Yakın Geçmiş (Present Perfect)",
    en: "Present Perfect",
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
    id: "future",
    tr: "Gelecek Zaman",
    en: "will / be going to",
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
    id: "articles",
    tr: "Artikeller (a / an / the)",
    en: "Articles",
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
    id: "plurals",
    tr: "Çoğullar",
    en: "Plural Nouns",
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
    id: "comparatives",
    tr: "Karşılaştırma",
    en: "Comparatives & Superlatives",
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
    id: "modals",
    tr: "Modal Fiiller",
    en: "can / must / should …",
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
    id: "prepositions",
    tr: "Zaman ve Yer Edatları",
    en: "in / on / at",
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
    el("h2", { id: `${topic.id}-h`, text: topic.tr }),
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
  const nav = document.getElementById("topic-nav");
  for (const t of TOPICS) {
    const chip = el("a", { class: "chip", href: `#${t.id}`, text: t.tr });
    nav.append(chip);
  }
}

function main() {
  buildNav();
  const list = document.getElementById("topics");
  for (const t of TOPICS) list.append(renderTopic(t));
  list.removeAttribute("aria-busy");
}

main();
