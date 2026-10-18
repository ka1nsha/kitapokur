// Okuyucunun kelime paneli: sayfa/kitap/deste listeleri, kelime kartı ve
// sayfa üzerindeki vurgular.
import { api, toast } from "./api.js";

const $ = (id) => document.getElementById(id);
const LIST_LIMIT = 100;
const NARROW = window.matchMedia("(max-width: 900px)");
const STATUS_LABEL = { new: "Yeni", learning: "Öğreniyor", known: "Biliyorum", ignored: "Yoksayıldı" };
export const POS_LABEL = {
  noun: "isim", verb: "fiil", adjective: "sıfat", adverb: "zarf", pronoun: "zamir",
  preposition: "edat", conjunction: "bağlaç", interjection: "ünlem", determiner: "belirteç",
  article: "tanımlık", abbreviation: "kısaltma", phrase: "deyim", prefix: "önek", suffix: "sonek",
};
export const speakerIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';

// Bir kelimeyi seslendir: önce gerçek kayıt, olmazsa tarayıcının konuşma sentezi.
export function speak(text, audioUrl) {
  const synth = () => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  };
  if (!audioUrl) return synth();
  new Audio(audioUrl).play().catch(synth);
}

// Örnek cümlede kelimeyi (ve çekimli biçimlerini) kalın göster.
export function emphasize(sentence, forms) {
  const esc = forms.filter(Boolean).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = esc.length && new RegExp(`\\b(${esc.join("|")})\\w*`, "i").exec(sentence);
  if (!m) return [sentence];
  const strong = document.createElement("strong");
  strong.textContent = m[0];
  return [sentence.slice(0, m.index), strong, sentence.slice(m.index + m[0].length)];
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // yalnızca sabit simgeler için
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function rarity(zipf) {
  if (zipf >= 4.5) return "yaygın";
  if (zipf >= 3.5) return "orta sıklıkta";
  if (zipf >= 2.5) return "seyrek";
  return "çok seyrek";
}

function readPanelPref() {
  try { return localStorage.getItem("okur.panel") !== "closed"; } catch { return true; }
}
function writePanelPref(open) {
  try { localStorage.setItem("okur.panel", open ? "open" : "closed"); } catch { /* özel pencere */ }
}

const closeIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

export function createPanel({ bookId, goToPage }) {
  const panel = $("panel");
  const toggleBtn = $("panel-toggle");
  const badge = $("panel-badge");
  const card = $("word-card");
  const notice = $("panel-notice");
  const levelSelect = $("level-select");
  const bookSort = $("book-sort");
  const tabs = { page: $("tab-page"), book: $("tab-book"), deck: $("tab-deck") };
  const views = { page: $("view-page"), book: $("view-book"), deck: $("view-deck") };

  const state = {
    ready: false,
    page: 1,
    pageCount: 1,
    tab: "page",
    details: new Map(),      // kelime id → Promise<ayrıntı>
    sentenceTr: new Map(),   // cümle → Promise<çeviri>
    statuses: new Map(),     // kelime id → durum (sunucudan gelenin üstüne yazılır)
    pageCache: new Map(),    // sayfa → Promise<sayfa verisi>
    decorated: new Map(),    // sayfa → metin katmanı
    selected: null,          // kartta gösterilen kelime
    lists: {
      book: { items: [], total: 0, loaded: false },
      deck: { items: [], total: 0, loaded: false },
    },
  };

  // --- Durum yardımcıları --------------------------------------------------

  const statusOf = (w) => state.statuses.get(w.id) ?? w.status;
  const isVisible = (w) => { const s = statusOf(w); return s === "new" || s === "learning"; };

  function pageData(n) {
    if (!state.pageCache.has(n)) {
      const p = api.pageWords(bookId, n).catch((err) => {
        state.pageCache.delete(n);
        throw err;
      });
      state.pageCache.set(n, p);
    }
    return state.pageCache.get(n);
  }

  // --- Açma / kapama -------------------------------------------------------

  function setOpen(open, { remember = true } = {}) {
    panel.hidden = !open;
    toggleBtn.setAttribute("aria-expanded", String(open));
    if (remember && !NARROW.matches) writePanelPref(open);
  }
  const isOpen = () => !panel.hidden;

  toggleBtn.addEventListener("click", () => setOpen(!isOpen()));
  $("panel-close").addEventListener("click", () => { setOpen(false); toggleBtn.focus(); });
  // Telefonda panel kapalı başlar; geniş ekranda son tercih hatırlanır.
  setOpen(!NARROW.matches && readPanelPref(), { remember: false });

  // --- Sekmeler ------------------------------------------------------------

  function selectTab(name, { focus = false } = {}) {
    state.tab = name;
    for (const [key, tab] of Object.entries(tabs)) {
      const on = key === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      views[key].hidden = !on;
    }
    if (focus) tabs[name].focus();
    if (name === "page") renderPageList();
    else if (!state.lists[name].loaded) loadList(name, true);
  }

  const tabOrder = ["page", "book", "deck"];
  for (const [key, tab] of Object.entries(tabs)) {
    tab.addEventListener("click", () => selectTab(key));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const i = tabOrder.indexOf(key) + (e.key === "ArrowRight" ? 1 : -1);
      selectTab(tabOrder[(i + tabOrder.length) % tabOrder.length], { focus: true });
    });
  }

  // --- Listeler ------------------------------------------------------------

  function wordRow(w, { sub, active }) {
    const s = statusOf(w);
    return h("li", {},
      h("button", {
        type: "button", class: "word-row", "aria-current": active ? "true" : "false",
        onclick: () => selectWord(w),
      },
        h("span", { class: "main" },
          h("span", { class: "lemma" }, w.lemma),
          sub ? h("span", { class: "sub" }, sub) : null),
        h("span", { class: "side" },
          h("span", { class: `chip ${s}` }, STATUS_LABEL[s]),
          h("span", { class: "freq" }, `${w.book_count}×`)),
      ));
  }

  function emptyItem(text) {
    return h("li", { class: "list-empty" }, text);
  }

  async function renderPageList() {
    if (!state.ready) return;
    const page = state.page;
    let data;
    try {
      data = await pageData(page);
    } catch {
      $("list-page").replaceChildren(emptyItem("Kelimeler yüklenemedi."));
      return;
    }
    if (page !== state.page) return; // bu arada sayfa değişti
    const words = data.words.filter(isVisible);
    updatePageCount(words.length);
    if (state.tab !== "page") return;
    $("list-page").replaceChildren(...(words.length
      ? words.map((w) => {
        const forms = w.surfaces.filter((s) => s !== w.lemma);
        return wordRow(w, { sub: w.translation || (forms.length ? forms.join(", ") : null), active: state.selected?.id === w.id });
      })
      : [emptyItem("Bu sayfada yeni kelime kalmadı.")]));
  }

  function updatePageCount(n) {
    tabs.page.querySelector(".tab-count").textContent = String(n);
    badge.hidden = n === 0;
    badge.textContent = String(n);
  }

  async function loadList(name, reset) {
    const list = state.lists[name];
    if (reset) { list.items = []; list.total = 0; }
    const status = name === "deck" ? "learning" : "new";
    const sort = name === "book" ? bookSort.value : "page";
    try {
      const res = await api.bookWords(bookId, { status, sort, limit: LIST_LIMIT, offset: list.items.length });
      list.items.push(...res.items);
      list.total = res.total;
      list.loaded = true;
    } catch (err) {
      toast(`Liste yüklenemedi: ${err.message}`, { error: true });
    }
    renderList(name);
  }

  function renderList(name) {
    const list = state.lists[name];
    tabs[name].querySelector(".tab-count").textContent = list.loaded ? String(list.total) : "";
    const ul = $(name === "book" ? "list-book" : "list-deck");
    const items = list.items.filter((w) => (name === "deck" ? statusOf(w) === "learning" : statusOf(w) === "new"));
    ul.replaceChildren(...(items.length
      ? items.map((w) => wordRow(w, {
        sub: [w.translation, `sayfa ${w.first_page}`].filter(Boolean).join(" · "),
        active: state.selected?.id === w.id,
      }))
      : [emptyItem(name === "deck"
        ? "Henüz öğrenmek için kelime seçmedin. Bir kelimede “Öğren”e bas."
        : "Bu kitapta yeni kelime kalmadı.")]));
    $(name === "book" ? "book-more" : "deck-more").hidden = list.items.length >= list.total;
  }

  async function refreshTotals() {
    try {
      const [fresh, learning] = await Promise.all([
        api.bookWords(bookId, { status: "new", limit: 1 }),
        api.bookWords(bookId, { status: "learning", limit: 1 }),
      ]);
      state.lists.book.total = fresh.total;
      state.lists.deck.total = learning.total;
      tabs.book.querySelector(".tab-count").textContent = String(fresh.total);
      tabs.deck.querySelector(".tab-count").textContent = String(learning.total);
    } catch { /* sayılar bir sonraki değişiklikte tazelenir */ }
  }

  bookSort.addEventListener("change", () => loadList("book", true));
  $("book-more").addEventListener("click", () => loadList("book", false));
  $("deck-more").addEventListener("click", () => loadList("deck", false));

  // --- Kelime kartı ----------------------------------------------------------

  async function selectWord(w, { page = state.page } = {}) {
    // Listede cümle yoksa (ör. "Tüm kitap"), ayrıntıyı sunucudan al.
    let detail = w;
    if (!w.sentence) {
      try {
        detail = { ...w, ...(await api.bookWord(bookId, w.id, page)) };
      } catch (err) {
        toast(err.message, { error: true });
        return;
      }
    } else if (!("page" in w)) {
      detail = { ...w, page };
    }
    showCard(detail);
  }

  function quote(sentence, surfaces) {
    const forms = surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const m = new RegExp(`\\b(${forms.join("|")})\\b`, "i").exec(sentence);
    if (!m) return [sentence];
    return [sentence.slice(0, m.index), h("strong", {}, m[0]), sentence.slice(m.index + m[0].length)];
  }

  function cached(map, key, load) {
    if (!map.has(key)) map.set(key, load().catch((err) => { map.delete(key); throw err; }));
    return map.get(key);
  }
  const wordDetails = (id) => cached(state.details, id, () => api.wordDetails(id));
  const sentenceTranslation = (text) =>
    cached(state.sentenceTr, text, () => api.translate(text).then((r) => r.translation));

  // Ağdan gelen bölümler kart açıldıktan sonra doldurulur.
  function fillDetails(w, slots) {
    wordDetails(w.id).then((d) => {
      if (state.selected?.id !== w.id) return;
      slots.tr.classList.remove("muted");
      slots.tr.textContent = w.translation || d.translation || "Çeviri bulunamadı";
      if (d.phonetic) slots.phonetic.textContent = d.phonetic;
      slots.speak.onclick = () => speak(w.lemma, d.audio);

      const withTr = (d.meanings || []).filter((m) => m.tr?.length);
      slots.meanings.replaceChildren(...withTr.slice(0, 4).map((m) =>
        h("li", {}, h("span", { class: "pos" }, POS_LABEL[m.pos] || m.pos), " ", m.tr.slice(0, 5).join(", "))));
      slots.meanings.hidden = withTr.length === 0;

      const def = (d.meanings || []).flatMap((m) => m.defs.map((x) => ({ ...x, pos: m.pos })))[0];
      slots.definition.replaceChildren(...(def ? [
        h("div", { class: "label" }, `Tanım · ${POS_LABEL[def.pos] || def.pos}`),
        h("p", { class: "def", lang: "en" }, def.en),
        def.example ? h("p", { class: "def-example", lang: "en" }, `“${def.example}”`) : null,
      ] : []));
      slots.definition.hidden = !def;

      const ex = d.examples?.[0];
      const stem = w.lemma.slice(0, Math.max(3, w.lemma.length - 2));
      slots.example.replaceChildren(...(ex ? [
        h("div", { class: "label" }, "Örnek cümle · Tatoeba"),
        h("p", { class: "ex-en", lang: "en" }, emphasize(ex.en, [stem, ...(w.surfaces || [])])),
        h("p", { class: "ex-tr" }, ex.tr),
      ] : []));
      slots.example.hidden = !ex;
    }).catch(() => {
      if (state.selected?.id !== w.id) return;
      slots.tr.classList.remove("muted");
      if (!w.translation) slots.tr.textContent = "Çeviri alınamadı (internet bağlantısı?)";
    });

    if (w.sentence && slots.sentenceTr) {
      sentenceTranslation(w.sentence)
        .then((t) => { if (state.selected?.id === w.id) slots.sentenceTr.textContent = t; })
        .catch(() => { slots.sentenceTr.hidden = true; });
    }
  }

  function showCard(w) {
    state.selected = w;
    const s = statusOf(w);
    const forms = (w.surfaces || []).filter((f) => f !== w.lemma);

    const actions = s === "known" || s === "ignored"
      ? [h("button", { type: "button", class: "btn btn-ghost", onclick: () => setStatus(w, "new") }, "Tekrar göster")]
      : [
        s === "learning"
          ? h("button", { type: "button", class: "btn btn-learning", "aria-pressed": "true", onclick: () => setStatus(w, "new") }, "Öğreniyorum ✓")
          : h("button", { type: "button", class: "btn btn-primary", "aria-pressed": "false", onclick: () => setStatus(w, "learning") }, "Öğren"),
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => setStatus(w, "known") }, "Biliyorum"),
        h("button", { type: "button", class: "btn btn-plain", onclick: () => setStatus(w, "ignored") }, "Yoksay"),
      ];

    const onOtherPage = w.page && w.page !== state.page;
    const slots = {
      tr: h("p", { class: "tr-main" + (w.translation ? "" : " muted") }, w.translation || "Çeviri yükleniyor…"),
      phonetic: h("span", { class: "phonetic", lang: "en" }),
      speak: h("button", {
        type: "button", class: "speak", "aria-label": `${w.lemma} kelimesini dinle`, html: speakerIcon,
        onclick: () => speak(w.lemma, null),
      }),
      meanings: h("ul", { class: "meanings", hidden: true }),
      definition: h("div", { class: "definition", hidden: true }),
      example: h("div", { class: "example", hidden: true }),
      sentenceTr: w.sentence ? h("p", { class: "quote-tr" }, "Çevriliyor…") : null,
    };
    card.replaceChildren(
      h("div", { class: "top" },
        h("div", { class: "head-main" },
          h("div", { class: "headword" },
            h("h3", { lang: "en" }, w.lemma),
            h("span", { class: `chip ${s}` }, STATUS_LABEL[s])),
          h("div", { class: "forms" }, slots.phonetic, forms.length ? h("span", {}, `Metinde: ${forms.join(", ")}`) : null)),
        h("div", { class: "head-buttons" },
          slots.speak,
          h("button", { type: "button", class: "close", "aria-label": "Kartı kapat", html: closeIcon, onclick: hideCard }))),
      h("div", {},
        h("div", { class: "label" }, "Google Çeviri"),
        slots.tr,
        slots.meanings),
      w.sentence
        ? h("div", { class: "context" },
          h("div", { class: "label" }, `Kitaptan · sayfa ${w.page}`),
          h("p", { class: "quote", lang: "en" }, quote(w.sentence, w.surfaces?.length ? w.surfaces : [w.lemma])),
          slots.sentenceTr)
        : null,
      slots.definition,
      slots.example,
      h("div", { class: "stats" },
        h("span", {}, w.book_count ? `Bu kitapta ${w.book_count} kez geçiyor` : "Bu kitapta geçmiyor"),
        h("span", {}, `İngilizcede ${rarity(w.zipf)}`),
        onOtherPage ? h("button", { type: "button", class: "link-btn", onclick: () => goToPage(w.page) }, `Sayfa ${w.page}'e git`) : null),
      h("div", { class: "actions" }, actions),
    );
    card.hidden = false;
    fillDetails(w, slots);
    refreshMarks();
    rerenderLists();
    if (!isOpen()) setOpen(true, { remember: false });
    $("panel-body").scrollTo({ top: 0 });
  }

  function hideCard() {
    state.selected = null;
    card.hidden = true;
    refreshMarks();
    rerenderLists();
  }

  function rerenderLists() {
    if (state.tab === "page") renderPageList();
    else renderList(state.tab);
  }

  // --- Durum değişikliği -----------------------------------------------------

  async function setStatus(w, status, { undoable = true } = {}) {
    const previous = statusOf(w);
    if (previous === status) return;
    state.statuses.set(w.id, status);
    afterStatusChange(w);
    try {
      await api.setWordStatus(w.id, status, { book_id: bookId, page: w.page || state.page });
    } catch (err) {
      state.statuses.set(w.id, previous);
      afterStatusChange(w);
      toast(`Kaydedilemedi: ${err.message}`, { error: true });
      return;
    }
    refreshTotals();
    state.lists.deck.loaded = false;
    if (undoable && (status === "known" || status === "ignored")) {
      toast(`“${w.lemma}” ${status === "known" ? "bilinenlere eklendi" : "yoksayıldı"}`, {
        timeout: 6000,
        action: { label: "Geri al", onClick: () => setStatus(w, previous, { undoable: false }) },
      });
    }
  }

  function afterStatusChange(w) {
    if (state.selected?.id === w.id) {
      const s = statusOf(w);
      // Bilinen bir kelimenin kartı açık kalmasın; sayfadaki bir sonraki kelimeye geç.
      if ((s === "known" || s === "ignored") && state.tab === "page") selectNextOnPage(w);
      else showCard(state.selected);
    }
    refreshMarks();
    rerenderLists();
  }

  async function selectNextOnPage(current) {
    const data = await pageData(state.page).catch(() => null);
    const words = data ? data.words.filter(isVisible) : [];
    const next = words.find((x) => x.id !== current.id);
    if (next) showCard({ ...next, page: state.page });
    else hideCard();
  }

  // --- Sayfa vurguları -------------------------------------------------------

  // Vurgular sunucudan gelen kelime kutularıyla, sayfanın üstünde ayrı bir
  // katmana çizilir (oranlar sayesinde yakınlaştırmada da yerinde kalır).
  async function decorate(pageNo, pageEl) {
    state.decorated.set(pageNo, pageEl);
    if (!state.ready || pageEl.querySelector(".hl-layer")) return;
    let data;
    try { data = await pageData(pageNo); } catch { return; }
    if (!pageEl.isConnected || pageEl.querySelector(".hl-layer") || state.decorated.get(pageNo) !== pageEl) return;
    const layer = document.createElement("div");
    layer.className = "hl-layer";
    layer.setAttribute("aria-hidden", "true");
    for (const w of data.words) {
      for (const [x0, y0, x1, y1] of w.boxes) {
        const el = document.createElement("div");
        el.className = "w";
        el.dataset.word = String(w.id);
        el.dataset.status = w.status;
        el.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`;
        layer.append(el);
      }
    }
    pageEl.append(layer);
    refreshMarks(layer);
  }

  function undecorateAll() {
    for (const pageEl of state.decorated.values()) pageEl.querySelector(".hl-layer")?.remove();
  }

  function redecorateAll() {
    for (const [pageNo, pageEl] of state.decorated) {
      if (pageEl.isConnected) decorate(pageNo, pageEl);
      else state.decorated.delete(pageNo);
    }
  }

  // Vurgu sınıflarını kelimelerin güncel durumuna göre ayarla.
  function refreshMarks(root = document.getElementById("pages")) {
    for (const mark of root.querySelectorAll(".hl-layer .w, .hl-layer.w")) {
      const id = Number(mark.dataset.word);
      const s = state.statuses.get(id) ?? mark.dataset.status;
      mark.classList.toggle("off", s === "known" || s === "ignored");
      mark.classList.toggle("learning", s === "learning");
      mark.classList.toggle("selected", state.selected?.id === id);
    }
  }

  // --- Okuyucudaki tıklamalar ------------------------------------------------

  async function handleViewerClick(e) {
    const pageEl = e.target.closest?.(".page");
    if (!pageEl || !state.ready) return;
    // Metin seçiliyorsa tıklama sayılmaz.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const page = Number(pageEl.dataset.page);

    const mark = e.target.closest(".w");
    if (mark && !mark.classList.contains("off")) {
      const data = await pageData(page).catch(() => null);
      const w = data?.words.find((x) => String(x.id) === mark.dataset.word);
      if (w) { showCard({ ...w, page }); return; }
    }

    // Vurgusuz bir kelime: tıklama noktası sunucuda kelime kutularıyla eşleştirilir.
    const r = pageEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    try {
      showCard(await api.lookupAt(bookId, page, x, y));
    } catch { /* boş bir yere tıklandı */ }
  }

  // --- Seviye ----------------------------------------------------------------

  levelSelect.addEventListener("change", async () => {
    try {
      await api.updateSettings({ level: levelSelect.value });
    } catch (err) {
      toast(err.message, { error: true });
      return;
    }
    state.pageCache.clear();
    state.lists.book.loaded = state.lists.deck.loaded = false;
    undecorateAll();
    redecorateAll();
    refreshTotals();
    rerenderListsAfterLevel();
  });

  function rerenderListsAfterLevel() {
    if (state.tab === "page") renderPageList();
    else loadList(state.tab, true);
  }

  // --- Hazırlık --------------------------------------------------------------

  function showNotice(content) {
    notice.replaceChildren(...content);
    notice.hidden = false;
    for (const v of Object.values(views)) v.hidden = true;
  }

  async function waitForWords(book) {
    let current = book;
    while (current.words_status === "pending" || current.words_status === "processing") {
      const pct = Math.round((current.words_progress || 0) * 100);
      showNotice([
        h("strong", {}, "Kelimeler hazırlanıyor"),
        h("div", { class: "progress" }, h("div", { style: `width: ${pct}%` })),
        h("span", {}, `%${pct} · Okumaya devam edebilirsin, liste hazır olunca burada görünecek.`),
      ]);
      await new Promise((r) => setTimeout(r, 1500));
      try { current = await api.getBook(bookId); } catch { /* tekrar dene */ }
    }
    return current;
  }

  async function start(book) {
    state.pageCount = book.page_count;
    $("deck-study").href = `/study.html?book=${bookId}`;
    const settled = await waitForWords(book);
    if (settled.words_status === "none") {
      showNotice([h("strong", {}, "Bu PDF'te seçilebilir metin yok"),
        h("span", {}, "Taranmış bir kitap olabilir. Kelime listesi için metin içeren bir PDF gerekiyor.")]);
      updatePageCount(0);
      return;
    }
    if (settled.words_status === "error") {
      showNotice([h("strong", {}, "Kelimeler çıkarılamadı"),
        h("span", {}, "Kitabı okumaya devam edebilirsin. Sorun sürerse PDF'i yeniden yükle.")]);
      return;
    }
    notice.hidden = true;
    try {
      const settings = await api.getSettings();
      levelSelect.value = settings.level;
    } catch { /* varsayılan seviye */ }
    state.ready = true;
    selectTab(state.tab);
    refreshTotals();
    redecorateAll();
  }

  return {
    start,
    setPage(n) {
      if (n === state.page && state.ready) return;
      state.page = n;
      if (!state.ready) return;
      renderPageList();
      // Sonraki sayfanın kelimelerini önceden iste.
      if (n < state.pageCount) pageData(n + 1).catch(() => {});
      if (state.selected && state.tab === "page" && !card.hidden) refreshMarks();
    },
    decorate,
    handleViewerClick,
    forget(pageNo) {
      state.decorated.get(pageNo)?.querySelector(".hl-layer")?.remove();
      state.decorated.delete(pageNo);
    },
  };
}
