// Flashcard çalışma ekranı.
import { api, toast } from "./api.js";
import { emphasize, formsBlock, POS_LABEL, sentenceWords, speak, speakerIcon, usedForm } from "./panel.js";

const $ = (id) => document.getElementById(id);
const cardEl = $("flashcard");
const messageEl = $("study-message");
const deckSelect = $("deck-select");
const newPerDay = $("new-per-day");
const MODES = ["classic", "reverse", "cloze"];

const state = {
  book: new URLSearchParams(location.search).get("book") || "",
  mode: readPref("okur.studyMode", "classic"),
  card: null,
  shownMode: "classic",
  revealed: false,
  shownAt: 0,
  done: 0,
  busy: false,
  waitTimer: null,
  sentenceTr: new Map(),
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
    else if (k === "html") el.innerHTML = v; // yalnızca sabit simgeler için
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export function formatInterval(seconds) {
  if (seconds < 60) return "<1 dk";
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa`;
  const days = seconds / 86400;
  if (days < 30) return `${Math.round(days)} gün`;
  if (days < 365) return `${Math.round(days / 30)} ay`;
  return `${(days / 365).toFixed(1).replace(".", ",")} yıl`;
}

// --- Oturum durumu ---------------------------------------------------------------

function updateCounts(counts) {
  $("c-new").textContent = counts.new;
  $("c-learn").textContent = counts.learning;
  $("c-review").textContent = counts.review;
  const remaining = counts.new + counts.learning + counts.review;
  const total = state.done + remaining;
  $("session-done").textContent = `${state.done} / ${total} kart`;
  $("session-bar").style.width = total ? `${(state.done / total) * 100}%` : "0%";
}

function pickMode(card) {
  let mode = state.mode === "mixed" ? MODES[Math.floor(Math.random() * MODES.length)] : state.mode;
  // Boşluk doldurma için kitaptan cümle, tersten kart için çeviri gerekir.
  if (mode === "cloze" && !card.cloze) mode = "classic";
  if (mode === "reverse" && !card.translation) mode = "classic";
  return mode;
}

// --- Kartı çiz ----------------------------------------------------------------------

// Kitap adı İngilizce işaretlenir; yoksa büyük harfe çevrilirken "i" Türkçe kurala göre "İ" olur.
function sourceLabel(card) {
  if (!card.book) return "Desten";
  return [h("span", { lang: "en" }, card.book.title), card.page ? ` · sayfa ${card.page}` : null];
}

function sentenceWithWord(card, { blank = false } = {}) {
  if (!card.sentence) return null;
  if (!card.cloze) return h("p", { class: "sentence", lang: "en" }, card.sentence);
  const [before, word, after] = card.cloze;
  return h("p", { class: "sentence", lang: "en" },
    before,
    blank ? h("span", { class: "blank", "aria-label": "boşluk" }, word) : h("strong", {}, word),
    after);
}

function renderFront(card, mode) {
  const d = card.details || {};
  if (mode === "reverse") {
    const hint = (d.meanings || []).find((m) => m.tr?.length);
    return h("div", { class: "front" },
      h("span", { class: "source" }, sourceLabel(card)),
      h("span", { class: "big tr" }, card.translation),
      h("span", { class: "sub" }, hint ? `${POS_LABEL[hint.pos] || hint.pos} · İngilizcesi ne?` : "İngilizcesi ne?"));
  }
  if (mode === "cloze") {
    return h("div", { class: "front" },
      h("span", { class: "source" }, sourceLabel(card)),
      h("span", { class: "big" }, "Boşluğu doldur"),
      h("span", { class: "sub" }, card.translation ? `ipucu: ${card.translation}` : "ipucu yok"),
      sentenceWithWord(card, { blank: true }));
  }
  return h("div", { class: "front" },
    h("span", { class: "source" }, sourceLabel(card)),
    h("span", { class: "big", lang: "en" }, card.lemma),
    d.phonetic ? h("span", { class: "sub mono", lang: "en" }, d.phonetic) : null,
    sentenceWithWord(card));
}

function renderBack(card, mode) {
  const d = card.details || {};
  const meanings = (d.meanings || []).filter((m) => m.tr?.length).slice(0, 3);
  const def = (d.meanings || []).flatMap((m) => m.defs.map((x) => ({ ...x, pos: m.pos })))[0];
  const ex = d.examples?.[0];
  const used = usedForm(d.forms, sentenceWords(card.sentence));
  const big = mode === "classic" ? (card.translation || "Çeviri yok") : card.lemma;
  const sub = mode === "classic" ? [card.lemma, d.phonetic].filter(Boolean).join(" · ")
    : [d.phonetic, card.translation].filter(Boolean).join(" · ");

  const contextTr = h("p", {}, "Çevriliyor…");
  if (card.sentence) {
    if (!state.sentenceTr.has(card.sentence)) {
      state.sentenceTr.set(card.sentence, api.translate(card.sentence).then((r) => r.translation).catch(() => null));
    }
    state.sentenceTr.get(card.sentence).then((t) => { contextTr.textContent = t || "Çeviri alınamadı"; });
  }

  return h("div", { class: "back-side" },
    h("div", { class: "answer-row" },
      h("div", { class: "answer" },
        h("span", { class: "answer-big", lang: mode === "classic" ? "tr" : "en" }, big),
        sub ? h("span", { class: "answer-sub" }, sub) : null),
      h("button", { type: "button", class: "speak", "aria-label": "Telaffuzu dinle", html: speakerIcon,
        onclick: () => speak(card.lemma, d.audio) })),
    meanings.length ? h("ul", { class: "meanings" }, meanings.map((m) =>
      h("li", {}, h("span", { class: "pos" }, POS_LABEL[m.pos] || m.pos), m.tr.slice(0, 5).join(", ")))) : null,
    used ? h("p", { class: "used-form" }, "Kitapta: ", h("strong", { lang: "en" }, used.form), ` · ${used.label}`) : null,
    formsBlock(d.forms, used),
    card.note ? h("div", { class: "info note" }, h("span", { class: "label" }, "Notun"), h("p", {}, card.note)) : null,
    (card.sentence || def) ? h("div", { class: "info-grid" },
      card.sentence ? h("div", { class: "info context" },
        h("span", { class: "label" }, mode === "cloze" ? "Cümlenin tamamı ve çevirisi" : "Kitaptaki cümlenin çevirisi"),
        mode === "cloze" ? sentenceWithWord(card) : null,
        contextTr) : null,
      def ? h("div", { class: "info" },
        h("span", { class: "label" }, `Tanım · ${POS_LABEL[def.pos] || def.pos}`),
        h("p", { lang: "en" }, def.en)) : null) : null,
    ex ? h("div", { class: "example" },
      h("span", { class: "label" }, "Örnek cümle · Tatoeba"),
      h("p", { lang: "en" }, emphasize(ex.en, [card.lemma.slice(0, Math.max(3, card.lemma.length - 2))])),
      h("p", {}, ex.tr)) : null);
}

const RATINGS = [
  { value: 1, key: "again", label: "Tekrar" },
  { value: 2, key: "hard", label: "Zor" },
  { value: 3, key: "good", label: "İyi" },
  { value: 4, key: "easy", label: "Kolay" },
];

function render() {
  const card = state.card;
  const mode = state.shownMode;
  const parts = [renderFront(card, mode)];
  if (!state.revealed) {
    parts.push(h("div", { class: "reveal-row" },
      h("button", { type: "button", class: "reveal", id: "reveal", onclick: reveal }, "Cevabı göster")));
  } else {
    parts.push(renderBack(card, mode));
    parts.push(h("div", { class: "ratings", role: "group", "aria-label": "Ne kadar iyi hatırladın?" },
      RATINGS.map((r) => h("button", {
        type: "button", class: `rate ${r.key}`, "aria-keyshortcuts": String(r.value),
        onclick: () => answer(r.value),
      },
        h("span", { class: "r-label" }, r.label),
        h("span", { class: "r-ivl" }, formatInterval(card.intervals[r.value]))))));
  }
  cardEl.replaceChildren(...parts);
  cardEl.hidden = false;
  messageEl.hidden = true;
}

function reveal() {
  if (!state.card || state.revealed) return;
  state.revealed = true;
  render();
  cardEl.querySelector(".rate.good")?.focus({ preventScroll: true });
}

// --- Akış ----------------------------------------------------------------------------

function show(data) {
  clearTimeout(state.waitTimer);
  updateCounts(data.counts);
  if (data.card) {
    state.card = data.card;
    state.shownMode = pickMode(data.card);
    state.revealed = false;
    state.shownAt = performance.now();
    render();
    $("reveal")?.focus({ preventScroll: true });
    return;
  }
  state.card = null;
  cardEl.hidden = true;
  if (data.wait_until) {
    const secs = Math.max(1, data.wait_until - Date.now() / 1000);
    showMessage("Biraz ara ver", `Öğrenme adımındaki kartlar ${formatInterval(secs)} sonra tekrar gelecek. Bu sayfa açık kalırsa kendiliğinden devam eder.`);
    state.waitTimer = setTimeout(load, secs * 1000 + 500);
    return;
  }
  finished();
}

async function finished() {
  let summary = null;
  try { summary = await api.studySummary(); } catch { /* özet olmadan da gösterilebilir */ }
  if (summary && summary.learning_total === 0) {
    showMessage("Desten henüz boş",
      "Okurken bir kelimeye dokunup “Öğren” dediğinde buraya kart olarak eklenir.",
      { link: true });
    return;
  }
  showMessage(state.done ? "Bugünlük bu kadar" : "Şu an çalışılacak kart yok",
    "Sıradaki tekrarlar zamanı gelince burada olacak.",
    { link: true, summary });
}

function showMessage(title, text, { link = false, summary = null } = {}) {
  messageEl.replaceChildren(...[
    h("h2", {}, title),
    h("p", {}, text),
    summary ? h("div", { class: "stats" },
      h("div", { class: "stat" }, h("strong", {}, String(summary.reviewed_today)), h("span", {}, "bugün tekrar")),
      h("div", { class: "stat" }, h("strong", {}, String(summary.learning_total)), h("span", {}, "destedeki kelime")),
      h("div", { class: "stat" }, h("strong", {}, String(summary.streak)), h("span", {}, "günlük seri"))) : null,
    link ? h("a", { class: "btn btn-primary", href: "/" }, "Kütüphaneye dön") : null,
  ].filter(Boolean));
  messageEl.hidden = false;
}

async function load() {
  try {
    show(await api.studyNext(state.book));
  } catch (err) {
    showMessage("Kartlar yüklenemedi", err.message, { link: true });
  }
}

async function answer(rating) {
  if (!state.card || !state.revealed || state.busy) return;
  state.busy = true;
  cardEl.querySelectorAll(".rate").forEach((b) => { b.disabled = true; });
  const duration = Math.round(performance.now() - state.shownAt);
  try {
    const data = await api.studyReview(state.card.id, { rating, mode: state.shownMode, duration_ms: duration }, state.book);
    state.done += 1;
    show(data);
  } catch (err) {
    toast(`Kaydedilemedi: ${err.message}`, { error: true });
    cardEl.querySelectorAll(".rate").forEach((b) => { b.disabled = false; });
  } finally {
    state.busy = false;
  }
}

// --- Ayarlar ve olaylar ----------------------------------------------------------

function setMode(mode) {
  state.mode = mode;
  writePref("okur.studyMode", mode);
  document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (state.card) {
    state.shownMode = pickMode(state.card);
    state.revealed = false;
    render();
  }
}

document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
setMode(state.mode);

deckSelect.addEventListener("change", () => {
  state.book = deckSelect.value;
  const url = new URL(location.href);
  if (state.book) url.searchParams.set("book", state.book); else url.searchParams.delete("book");
  history.replaceState(null, "", url);
  load();
});

newPerDay.addEventListener("change", async () => {
  try {
    await api.studySettings({ new_per_day: Number(newPerDay.value) });
    if (!state.card) load();
    else updateCounts((await api.studyNext(state.book)).counts);
  } catch (err) {
    toast(err.message, { error: true });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, select, textarea")) return;
  if ((e.key === " " || e.key === "Enter") && !state.revealed && state.card) {
    e.preventDefault();
    reveal();
  } else if (state.revealed && ["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    answer(Number(e.key));
  } else if ((e.key === "s" || e.key === "S") && state.card) {
    speak(state.card.lemma, state.card.details?.audio);
  }
});

async function init() {
  try {
    const [books, summary] = await Promise.all([api.studyBooks(), api.studySummary()]);
    for (const b of books) deckSelect.append(h("option", { value: String(b.id) }, `${b.title} (${b.cards})`));
    deckSelect.value = state.book;
    const opts = [...newPerDay.options].map((o) => o.value);
    if (!opts.includes(String(summary.new_per_day))) newPerDay.append(h("option", { value: String(summary.new_per_day) }, String(summary.new_per_day)));
    newPerDay.value = String(summary.new_per_day);
  } catch { /* liste olmadan da çalışılabilir */ }
  load();
}

init();
