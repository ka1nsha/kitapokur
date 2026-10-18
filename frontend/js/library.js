import { api, icons, percent, timeAgo, toast } from "./api.js";

const grid = document.getElementById("grid");
const continueEl = document.getElementById("continue");
const todayEl = document.getElementById("today");
const sortButtons = document.querySelectorAll(".sort button");
const renameDialog = document.getElementById("rename-dialog");
const deleteDialog = document.getElementById("delete-dialog");

const COVER_COLORS = ["#2F4A3A", "#3B3550", "#5A3B2B", "#1F3A5F", "#2E5E73", "#4A3B2F", "#3A4A2F"];
const POLL_MS = 2000;

let books = [];
let sortKey = readSort();
let pollTimer = null;
let openMenu = null;

// --- DOM yardımcısı ---------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // yalnızca sabit simgeler için
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function readSort() {
  try { return localStorage.getItem("okur.sort") || "recent"; } catch { return "recent"; }
}
function writeSort(value) {
  try { localStorage.setItem("okur.sort", value); } catch { /* özel pencere */ }
}

function readerUrl(book) {
  return `/reader.html?book=${book.id}`;
}

function coverColor(book) {
  return COVER_COLORS[book.id % COVER_COLORS.length];
}

// --- Kapak ve kartlar -------------------------------------------------------

function cover(book) {
  const el = h("div", { class: "cover", style: `--cover-color: ${coverColor(book)}` });
  if (book.cover_url) {
    el.append(h("img", { src: book.cover_url, alt: "", loading: "lazy", decoding: "async" }));
  } else {
    el.append(h("div", { class: "cover-fallback", "aria-hidden": "true" }, h("div", {}, book.title)));
  }
  if (book.status === "processing") {
    el.append(h("div", { class: "cover-overlay" }, h("span", { html: icons.spinner }), "Hazırlanıyor"));
  } else if (book.status === "error") {
    el.append(h("div", { class: "cover-overlay error" }, h("span", { html: icons.alert }), "İşlenemedi"));
  }
  return el;
}

function progressBar(book) {
  return h("div", { class: "progress", role: "presentation" },
    h("div", { style: `width: ${Math.round(book.progress * 100)}%` }));
}

function pageLabel(book) {
  if (book.progress >= 0.995) return "Bitti";
  return `Sayfa ${book.last_page} / ${book.page_count}`;
}

function wordNote(book) {
  if (!book.has_text) return h("div", { class: "card-note" }, "Taranmış PDF: metin bulunamadı");
  if (book.words_status === "pending" || book.words_status === "processing") {
    return h("div", { class: "card-note" }, `Kelimeler hazırlanıyor ${percent(book.words_progress || 0)}`);
  }
  if (book.words_status === "error") return h("div", { class: "card-note error" }, "Kelimeler çıkarılamadı");
  if (book.translating && book.translated < 1) {
    return h("div", { class: "card-note amber" }, `Çeviriler alınıyor ${percent(book.translated)}`);
  }
  if (book.new_words > 0) return h("div", { class: "card-note amber" }, `${book.new_words} yeni kelime`);
  return h("div", { class: "card-note accent" }, "Yeni kelime kalmadı");
}

function card(book) {
  const ready = book.status === "ready";
  const body = h("div", { class: "card-body" }, h("div", { class: "card-title" }, book.title));

  if (ready) {
    body.append(
      progressBar(book),
      h("div", { class: "card-meta" }, h("span", {}, pageLabel(book)), h("span", {}, percent(book.progress))),
    );
    body.append(wordNote(book));
  } else if (book.status === "processing") {
    body.append(h("div", { class: "card-note" }, "Sayfalar hazırlanıyor…"));
  } else {
    body.append(h("div", { class: "card-note error" }, book.error || "Bilinmeyen hata"));
  }

  const menuBtn = h("button", {
    type: "button", class: "card-menu-btn", "aria-label": `${book.title} için seçenekler`,
    "aria-haspopup": "menu", "aria-expanded": "false", html: icons.more,
    onclick: (e) => { e.stopPropagation(); toggleMenu(article, menuBtn, book); },
  });

  const article = h("article", { class: "card" },
    ready ? h("a", { class: "card-link", href: readerUrl(book), "aria-label": `${book.title} kitabını aç` }) : null,
    cover(book),
    body,
    menuBtn,
  );
  return article;
}

function toggleMenu(article, button, book) {
  const wasOpen = openMenu?.button === button;
  closeMenu();
  if (wasOpen) return;
  const menu = h("div", { class: "card-menu", role: "menu" },
    h("button", { type: "button", role: "menuitem", onclick: () => { closeMenu(); renameBook(book); } },
      "Bilgileri düzenle"),
    h("button", { type: "button", role: "menuitem", class: "danger", onclick: () => { closeMenu(); deleteBook(book); } },
      "Kitabı sil"),
  );
  article.append(menu);
  button.setAttribute("aria-expanded", "true");
  openMenu = { menu, button };
  menu.querySelector("button").focus();
}

function closeMenu() {
  if (!openMenu) return;
  openMenu.menu.remove();
  openMenu.button.setAttribute("aria-expanded", "false");
  openMenu = null;
  if (renderPending) {
    renderPending = false;
    queueMicrotask(() => render({ poll: true }));
  }
}

document.addEventListener("click", (e) => {
  if (openMenu && !openMenu.menu.contains(e.target)) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openMenu) {
    const btn = openMenu.button;
    closeMenu();
    btn.focus();
  }
});

function addTile() {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, class: "visually-hidden" });
  input.addEventListener("change", () => uploadFiles(input.files));
  return h("label", { class: "add-tile" },
    h("div", { class: "circle", html: icons.upload }),
    h("strong", {}, "Yeni PDF ekle"),
    h("span", {}, "Sürükleyip bırak ya da tıklayıp seç"),
    input,
  );
}

// --- Çizim ------------------------------------------------------------------

function sorted() {
  const list = [...books];
  if (sortKey === "progress") list.sort((a, b) => b.progress - a.progress);
  else if (sortKey === "title") list.sort((a, b) => a.title.localeCompare(b.title, "tr"));
  else list.sort((a, b) => (b.last_opened_at || b.created_at) - (a.last_opened_at || a.created_at));
  return list;
}

function renderContinue() {
  const book = books
    .filter((b) => b.status === "ready" && b.last_opened_at && b.progress < 0.995)
    .sort((a, b) => b.last_opened_at - a.last_opened_at)[0];
  continueEl.hidden = !book;
  if (!book) return;
  const author = book.author ? `${book.author} · ` : "";
  continueEl.replaceChildren(
    cover(book),
    h("div", { class: "info" },
      h("div", { class: "eyebrow" }, "Kaldığın yerden devam et"),
      h("h2", { id: "continue-title" }, book.title),
      h("div", { class: "meta" }, `${author}Son okuma: ${timeAgo(book.last_opened_at)}`),
      h("div", { class: "progress-wrap" },
        progressBar(book),
        h("div", { class: "progress-label" },
          h("span", {}, `Sayfa ${book.last_page} / ${book.page_count}`),
          h("span", {}, percent(book.progress))),
      ),
      h("div", { class: "continue-actions" },
        h("a", { class: "btn btn-primary", href: readerUrl(book) }, `Devam et · sayfa ${book.last_page}`),
        book.words_status === "ready" && book.new_words > 0
          ? h("span", { class: "pill amber" }, `Bu kitapta ${book.new_words} yeni kelime`) : null,
        book.learning_words > 0
          ? h("span", { class: "pill accent" }, `${book.learning_words} kelime öğreniyorsun`) : null,
      ),
    ),
  );
}

async function renderToday() {
  let s;
  try { s = await api.studySummary(); } catch { return; }
  const badge = document.getElementById("nav-due");
  badge.hidden = s.due === 0;
  badge.textContent = String(s.due);
  // Henüz hiç kart yoksa bu kart gösterilmez.
  todayEl.hidden = s.learning_total === 0;
  if (todayEl.hidden) return;
  todayEl.replaceChildren(
    h("div", { class: "eyebrow", id: "today-title" }, "Bugünkü çalışma"),
    h("div", { class: "big-count" },
      h("strong", {}, String(s.due)),
      h("span", {}, s.due ? "kart seni bekliyor" : "bekleyen kart yok")),
    h("div", { class: "split" },
      h("div", {}, h("small", {}, "Yeni"), h("b", {}, String(s.new))),
      h("div", {}, h("small", {}, "Tekrar"), h("b", {}, String(s.learning + s.review)))),
    h("a", { class: "btn btn-mint", href: "/study.html" }, s.due ? "Çalışmaya başla" : "Desteye bak"),
    h("div", { class: "foot" },
      h("span", {}, `${s.learning_total} kelime destede`),
      h("span", {}, s.streak ? `${s.streak} günlük seri` : `${s.reviewed_today} tekrar bugün`)),
  );
}

// poll: durum yoklamasından gelen yenileme; "Bugün" kutusu (ayrı istek) yenilenmez
// ve klavye odağı aynı kitaba geri verilir.
function render({ poll = false } = {}) {
  const focused = poll && grid.contains(document.activeElement) ? document.activeElement.getAttribute("href") : null;
  closeMenu();
  renderContinue();
  if (!poll) renderToday();
  if (focused) queueMicrotask(() => grid.querySelector(`[href="${CSS.escape(focused)}"]`)?.focus());
  grid.removeAttribute("aria-busy");
  if (books.length === 0) {
    grid.replaceChildren(h("div", { class: "empty" },
      h("h2", {}, "Kütüphanen boş"),
      h("p", {}, "İlk PDF'ini yükle. Kaldığın yer her kitap için ayrı saklanır."),
      h("label", { class: "btn btn-primary" },
        h("span", { html: icons.upload }), "PDF seç",
        (() => {
          const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, class: "visually-hidden" });
          input.addEventListener("change", () => uploadFiles(input.files));
          return input;
        })(),
      ),
    ));
    return;
  }
  grid.replaceChildren(...sorted().map(card), addTile());
}

function renderSkeleton() {
  grid.replaceChildren(...Array.from({ length: 4 }, () =>
    h("div", { class: "skeleton", "aria-hidden": "true" }, h("div", { class: "cover" }))));
}

// --- Veri -------------------------------------------------------------------

let pollFailures = 0;
let renderPending = false;

async function load({ poll = false } = {}) {
  try {
    books = await api.listBooks();
    pollFailures = 0;
    // Açık "⋯" menüsü yoklama yüzünden kapanmasın; menü kapanınca çizilir.
    if (poll && openMenu) renderPending = true;
    else render({ poll });
  } catch (err) {
    // Sunucuya ulaşılamıyorsa her denemede yeni bildirim çıkmasın.
    if (pollFailures === 0) toast(`Kitaplar yüklenemedi: ${err.message}`, { error: true });
    pollFailures += 1;
  }
  schedulePoll();
}

// İşlenmekte olan kitap varsa durumu kısa aralıklarla yokla. Hata olursa
// aralık 30 saniyeye kadar uzar; sekme arka plandayken yoklanmaz.
function schedulePoll() {
  clearTimeout(pollTimer);
  const busy = (b) => b.status === "processing"
    || (b.status === "ready" && (b.words_status === "pending" || b.words_status === "processing"))
    || (b.translating && b.translated < 1);
  if (!document.hidden && books.some(busy)) {
    const delay = Math.min(POLL_MS * 2 ** pollFailures, 30000);
    pollTimer = setTimeout(() => load({ poll: true }), delay);
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load({ poll: true });
  else clearTimeout(pollTimer);
});

async function uploadFiles(fileList) {
  const files = [...fileList].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (files.length === 0) {
    toast("Sadece PDF dosyaları yüklenebilir.", { error: true });
    return;
  }
  // Pi'yi yormamak için dosyalar sırayla yüklenir.
  for (const file of files) {
    const t = toast(file.name, { progress: true });
    try {
      const book = await api.uploadBook(file, (p) => t.setProgress(p));
      t.done(book.duplicate ? `"${book.title}" zaten kütüphanende` : `"${book.title}" eklendi`);
      await load();
    } catch (err) {
      t.done(`${file.name}: ${err.message}`, { isError: true });
    }
  }
}

async function renameBook(book) {
  // form.title, formun kendi "title" özelliğiyle çakışır; elements üzerinden eriş.
  const { title, author } = renameDialog.querySelector("form").elements;
  title.value = book.title;
  author.value = book.author;
  renameDialog.returnValue = "";
  renameDialog.showModal();
  title.select();
  await new Promise((r) => renameDialog.addEventListener("close", r, { once: true }));
  if (renameDialog.returnValue !== "save") return;
  try {
    await api.updateBook(book.id, { title: title.value, author: author.value });
    await load();
  } catch (err) {
    toast(err.message, { error: true });
  }
}

async function deleteBook(book) {
  deleteDialog.querySelector(".delete-text").textContent =
    `"${book.title}" kütüphaneden ve Pi'nin diskinden silinecek. Okuma konumu da kaybolur.`;
  deleteDialog.returnValue = "";
  deleteDialog.showModal();
  await new Promise((r) => deleteDialog.addEventListener("close", r, { once: true }));
  if (deleteDialog.returnValue !== "delete") return;
  try {
    await api.deleteBook(book.id);
    toast(`"${book.title}" silindi`);
    await load();
  } catch (err) {
    toast(err.message, { error: true });
  }
}

// --- Olaylar ----------------------------------------------------------------

document.querySelector(".file-input").addEventListener("change", (e) => {
  uploadFiles(e.target.files);
  e.target.value = "";
});

for (const btn of sortButtons) {
  btn.setAttribute("aria-pressed", String(btn.dataset.sort === sortKey));
  btn.addEventListener("click", () => {
    sortKey = btn.dataset.sort;
    writeSort(sortKey);
    sortButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    render();
  });
}

// Sayfanın herhangi bir yerine sürükle-bırak.
const overlay = document.querySelector(".drop-overlay");
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) overlay.hidden = true;
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  uploadFiles(e.dataTransfer.files);
});

// Okuyucudan geri dönüldüğünde (bfcache) ilerlemeyi tazele.
window.addEventListener("pageshow", (e) => { if (e.persisted) load(); });

async function loadProfile() {
  try {
    const me = await api.session();
    const chip = document.getElementById("profile-chip");
    const avatar = chip.querySelector(".avatar-sm");
    avatar.style.background = me.color;
    avatar.textContent = [...me.name][0]?.toLocaleUpperCase("tr") || "?";
    chip.querySelector(".chip-name").textContent = me.name;
    chip.setAttribute("aria-label", `${me.name} profili; profil değiştir`);
    chip.hidden = false;
  } catch { /* profil seçilmemişse api.js seçim ekranına yönlendirir */ }
}

renderSkeleton();
loadProfile();
load();
