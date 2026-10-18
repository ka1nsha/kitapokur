// Kart tarayıcısı: destedeki kartları listele, ara, düzenle, elle kart ekle.
import { api, toast } from "./api.js";

const $ = (id) => document.getElementById(id);
const list = $("card-list");
const moreBtn = $("more");
const searchInput = $("search");
const deckSelect = $("deck-select");
const sortSelect = $("sort-select");
const addDialog = $("add-dialog");
const editDialog = $("edit-dialog");
const PAGE_SIZE = 50;

const STATE_LABEL = { 0: "Yeni", 1: "Öğreniyor", 2: "Tekrar", 3: "Öğreniyor" };
const STATE_CLASS = { 0: "new", 1: "learning", 2: "review", 3: "learning" };

const params = new URLSearchParams(location.search);
const state = {
  filter: params.get("filter") || "all",
  q: "",
  book: params.get("book") || "",
  sort: readPref("okur.cardSort", "due"),
  items: [],
  total: 0,
  now: 0,
  editing: null,
  loadSeq: 0,
};

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* özel pencere */ }
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function inText(seconds) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} dk sonra`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa sonra`;
  const days = Math.round(seconds / 86400);
  if (days === 1) return "yarın";
  if (days < 60) return `${days} gün sonra`;
  if (days < 365) return `${Math.round(days / 30)} ay sonra`;
  return `${(days / 365).toFixed(1).replace(".", ",")} yıl sonra`;
}

function dueText(card) {
  if (card.suspended) return "askıda";
  if (card.state === 0) return "henüz çalışılmadı";
  const left = card.due - state.now;
  return left <= 0 ? "zamanı geldi" : inText(left);
}

function chip(card) {
  if (card.suspended) return h("span", { class: "chip suspended" }, "Askıda");
  return h("span", { class: `chip ${STATE_CLASS[card.state]}` }, STATE_LABEL[card.state]);
}

// --- Liste ---------------------------------------------------------------------------

function row(card) {
  const source = card.book
    ? [h("span", { lang: "en" }, card.book.title), card.page ? ` · s. ${card.page}` : null]
    : "Elle eklendi";
  return h("li", {},
    h("button", { type: "button", class: `card-row${card.suspended ? " is-suspended" : ""}`, onclick: () => openEdit(card) },
      h("div", { class: "main" },
        h("div", { class: "line1" },
          h("span", { class: "lemma", lang: "en" }, card.lemma),
          h("span", { class: "tr" }, card.translation || "çeviri bekleniyor")),
        card.sentence ? h("div", { class: "sentence", lang: "en" }, card.sentence) : null,
        h("div", { class: "meta" }, h("span", {}, source),
          card.reviews ? h("span", {}, `${card.reviews} tekrar`) : null,
          card.lapses ? h("span", { class: "lapses" }, `${card.lapses} kez unutuldu`) : null,
          card.note ? h("span", { class: "has-note" }, "notlu") : null)),
      h("div", { class: "side" }, chip(card), h("span", { class: "due" }, dueText(card)))));
}

function renderCounts(counts) {
  for (const btn of document.querySelectorAll(".filters button")) {
    btn.querySelector("span").textContent = counts[btn.dataset.filter] ?? "";
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === state.filter));
  }
}

function emptyMessage() {
  if (state.q) return `"${state.q}" için kart bulunamadı.`;
  if (state.filter === "due") return "Şu an zamanı gelen kart yok.";
  if (state.filter === "suspended") return "Askıya alınmış kart yok.";
  if (state.filter !== "all") return "Bu durumda kart yok.";
  return "Desten boş. Okurken bir kelimeye \"Öğren\" de ya da yukarıdan elle kart ekle.";
}

function render() {
  list.replaceChildren(...state.items.map(row));
  if (!state.items.length) list.append(h("li", { class: "list-empty" }, emptyMessage()));
  moreBtn.hidden = state.items.length >= state.total;
  list.setAttribute("aria-busy", "false");
}

async function load({ append = false } = {}) {
  const seq = ++state.loadSeq;
  const query = new URLSearchParams({
    filter: state.filter, sort: state.sort, q: state.q, limit: PAGE_SIZE,
    offset: append ? state.items.length : 0,
  });
  if (state.book) query.set("book", state.book);
  try {
    const data = await api.cards(query);
    // Hızlı yazarken eski bir yanıt yenisinin üstüne yazmasın.
    if (seq !== state.loadSeq) return;
    state.items = append ? state.items.concat(data.items) : data.items;
    state.total = data.total;
    state.now = data.now;
    renderCounts(data.counts);
    render();
  } catch (err) {
    if (seq === state.loadSeq) toast(err.message, { error: true });
  }
}

function syncUrl() {
  const q = new URLSearchParams();
  if (state.filter !== "all") q.set("filter", state.filter);
  if (state.book) q.set("book", state.book);
  history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}`);
}

// --- Düzenleme -------------------------------------------------------------------------

function setTool(action, text, { danger = false } = {}) {
  const btn = editDialog.querySelector(`[data-action="${action}"]`);
  btn.textContent = text;
  btn.classList.toggle("confirming", danger);
  return btn;
}

function openEdit(card) {
  state.editing = card;
  const form = editDialog.querySelector("form");
  editDialog.querySelector("h2").textContent = card.lemma;
  editDialog.querySelector(".edit-head").replaceChild(chip(card), editDialog.querySelector(".edit-head .chip"));
  const source = card.book ? `${card.book.title}${card.page ? `, sayfa ${card.page}` : ""}` : "Elle eklendi";
  editDialog.querySelector(".edit-meta").textContent =
    `${source} · ${card.reviews} tekrar · sonraki: ${dueText(card)}`;
  form.elements.translation.value = card.own_translation ? card.translation : "";
  form.elements.translation.placeholder = card.own_translation ? "" : (card.translation || "");
  form.querySelector(".field .hint").textContent = card.own_translation
    ? "Boş bırakırsan otomatik çeviri kullanılır."
    : "Otomatik çeviri gösteriliyor; değiştirmek için kendi anlamını yaz.";
  form.elements.sentence.value = card.sentence || "";
  form.elements.note.value = card.note || "";
  setTool("suspend", card.suspended ? "Çalışmaya geri al" : "Askıya al");
  setTool("reset", "Baştan öğren");
  setTool("delete", "Sil");
  editDialog.querySelector('[data-action="reset"]').hidden = card.state === 0 && !card.reviews;
  editDialog.showModal();
}

function replaceCard(updated) {
  const i = state.items.findIndex((c) => c.id === updated.id);
  if (i >= 0) state.items[i] = updated;
}

editDialog.addEventListener("close", async () => {
  const card = state.editing;
  if (editDialog.returnValue !== "save" || !card) return;
  const form = editDialog.querySelector("form");
  try {
    replaceCard(await api.updateCard(card.id, {
      translation: form.elements.translation.value,
      sentence: form.elements.sentence.value,
      note: form.elements.note.value,
    }));
    render();
    toast("Kart kaydedildi");
  } catch (err) {
    toast(err.message, { error: true });
  }
});

editDialog.querySelector(".card-tools").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = state.editing;
  if (!btn || !card) return;
  const action = btn.dataset.action;
  // Geri alınamayan işlemler ikinci dokunuşta yapılır.
  if ((action === "delete" || action === "reset") && !btn.classList.contains("confirming")) {
    setTool(action, action === "delete" ? "Silmek için tekrar dokun" : "Emin misin? Tekrar dokun", { danger: true });
    return;
  }
  try {
    if (action === "suspend") {
      await api.updateCard(card.id, { suspended: !card.suspended });
      toast(card.suspended ? `"${card.lemma}" çalışmaya geri alındı` : `"${card.lemma}" askıya alındı`);
    } else if (action === "reset") {
      await api.resetCard(card.id);
      toast(`"${card.lemma}" yeni kart olarak baştan başlayacak`);
    } else if (action === "delete") {
      await api.deleteCard(card.id);
      toast(`"${card.lemma}" silindi`);
    }
    editDialog.close("cancel");
    load();
  } catch (err) {
    toast(err.message, { error: true });
  }
});

// --- Elle kart ekleme ------------------------------------------------------------------

$("add-btn").addEventListener("click", () => {
  const form = addDialog.querySelector("form");
  form.reset();
  form.querySelector(".form-error").hidden = true;
  addDialog.showModal();
});

addDialog.querySelector("form").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  // Hata olursa pencere açık kalsın diye gönderim burada yapılır.
  e.preventDefault();
  const form = e.target;
  const error = form.querySelector(".form-error");
  const submit = e.submitter;
  submit.disabled = true;
  try {
    const word = form.elements.word.value.trim();
    const card = await api.addCard({
      word,
      translation: form.elements.translation.value,
      sentence: form.elements.sentence.value,
      note: form.elements.note.value,
    });
    addDialog.close("save");
    let message = card.existed ? `"${card.lemma}" zaten destendeydi, bilgileri güncellendi` : `"${card.lemma}" desteye eklendi`;
    if (!card.existed && card.lemma !== word.toLowerCase()) message = `"${word}", kök hâliyle "${card.lemma}" olarak eklendi`;
    toast(message, { timeout: 5000 });
    load();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

// --- Olaylar --------------------------------------------------------------------------

document.querySelector(".filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn || btn.dataset.filter === state.filter) return;
  state.filter = btn.dataset.filter;
  syncUrl();
  load();
});

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = searchInput.value.trim();
    load();
  }, 200);
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  writePref("okur.cardSort", state.sort);
  load();
});

deckSelect.addEventListener("change", () => {
  state.book = deckSelect.value;
  syncUrl();
  load();
});

moreBtn.addEventListener("click", () => load({ append: true }));

// "/" ile aramaya geç, "n" ile yeni kart.
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, select, dialog")) return;
  if (e.key === "/") { e.preventDefault(); searchInput.focus(); }
  else if (e.key === "n") { e.preventDefault(); $("add-btn").click(); }
});

async function init() {
  sortSelect.value = state.sort;
  try {
    for (const b of await api.studyBooks()) {
      deckSelect.append(h("option", { value: String(b.id) }, `${b.title} (${b.cards})`));
    }
  } catch { /* deste listesi olmadan da çalışır */ }
  deckSelect.value = state.book;
  if (deckSelect.value !== state.book) state.book = "";
  load();
}

init();
