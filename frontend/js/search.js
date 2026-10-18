// Kitap içinde arama: sonuç listesi, sayfadaki vurgular, önceki/sonraki sonuç.
import { api, toast } from "./api.js";

const $ = (id) => document.getElementById(id);
const NARROW = window.matchMedia("(max-width: 720px)");

export function createSearch({ bookId, goTo, currentPosition, renderedPages }) {
  const bar = $("search-bar");
  const input = $("search-input");
  const count = $("search-count");
  const list = $("search-results");
  const toggle = $("search-toggle");
  const buttons = { prev: $("search-prev"), next: $("search-next"), list: $("search-list") };

  const state = {
    q: "",
    items: [],
    total: 0,
    truncated: false,
    index: -1,
    boxes: new Map(),   // sayfa → Promise<kutular>
    origin: null,       // arama açıldığında okunan yer
    moved: false,
    seq: 0,
  };

  function isOpen() { return !bar.hidden; }

  function open() {
    if (!isOpen()) {
      bar.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      state.origin = currentPosition();
      state.moved = false;
    }
    input.focus();
    input.select();
  }

  function close() {
    if (!isOpen()) return;
    bar.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    showList(false);
    reset();
    // Arama sonuçlarında gezindikten sonra okunan yere kolayca dönülebilsin.
    const from = state.origin;
    if (state.moved && from) {
      toast("Arama kapatıldı", {
        timeout: 8000,
        action: { label: "Okuduğun yere dön", onClick: () => goTo(from.page, from.offset, { exact: true }) },
      });
    }
    state.origin = null;
  }

  function reset() {
    state.seq++;
    state.q = "";
    state.items = [];
    state.total = 0;
    state.index = -1;
    state.boxes.clear();
    document.querySelectorAll(".search-layer").forEach((el) => el.remove());
    list.replaceChildren();
    count.textContent = "";
    for (const b of Object.values(buttons)) b.disabled = true;
  }

  async function run(q) {
    reset();
    if (q.length < 2) {
      count.textContent = q ? "En az iki harf" : "";
      return;
    }
    const seq = state.seq;
    state.q = q;
    count.textContent = "Aranıyor…";
    let res;
    try {
      res = await api.searchBook(bookId, q);
    } catch (err) {
      if (seq === state.seq) count.textContent = "";
      toast(err.message, { error: true });
      return;
    }
    if (seq !== state.seq) return;
    state.items = res.items;
    state.total = res.total;
    state.truncated = res.truncated;
    if (!res.items.length) {
      count.textContent = "Sonuç yok";
      return;
    }
    for (const b of Object.values(buttons)) b.disabled = false;
    renderList();
    for (const { page, el } of renderedPages()) decorate(page, el);
    // Okunan yerden sonraki ilk sonuçla başla.
    const here = currentPosition().page;
    const first = state.items.findIndex((it) => it.page >= here);
    go(first >= 0 ? first : 0);
    if (state.items.length > 1 && !NARROW.matches) showList(true);
  }

  function renderList() {
    list.replaceChildren(...state.items.map((it, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.index = String(i);
      const page = document.createElement("span");
      page.className = "result-page";
      page.textContent = `s. ${it.page}`;
      const text = document.createElement("span");
      text.className = "result-text";
      text.lang = "en";
      const mark = document.createElement("mark");
      mark.textContent = it.text.slice(it.start, it.start + it.length);
      text.append(it.text.slice(0, it.start), mark, it.text.slice(it.start + it.length));
      btn.append(page, text);
      li.append(btn);
      return li;
    }));
    if (state.truncated) {
      const li = document.createElement("li");
      li.className = "result-more";
      li.textContent = `${state.total} sonucun ilk ${state.items.length} tanesi gösteriliyor; aramayı daralt.`;
      list.append(li);
    }
  }

  function showList(show) {
    list.hidden = !show;
    buttons.list.setAttribute("aria-expanded", String(show));
  }

  function boxesFor(page) {
    if (!state.boxes.has(page)) {
      const q = state.q;
      state.boxes.set(page, api.searchPage(bookId, page, q).then((r) => r.boxes).catch(() => []));
    }
    return state.boxes.get(page);
  }

  // Aynı sayfadaki kaçıncı sonuç olduğu; kutular da sayfada okuma sırasıyla gelir.
  function rankOnPage(i) {
    const { page } = state.items[i];
    let k = 0;
    for (let j = i - 1; j >= 0 && state.items[j].page === page; j--) k++;
    return k;
  }

  async function go(i) {
    const n = state.items.length;
    if (!n) return;
    state.index = ((i % n) + n) % n;
    const it = state.items[state.index];
    count.textContent = `${state.index + 1} / ${state.total}`;
    list.querySelectorAll("button[aria-current]").forEach((b) => b.removeAttribute("aria-current"));
    const current = list.querySelector(`button[data-index="${state.index}"]`);
    current?.setAttribute("aria-current", "true");
    current?.scrollIntoView({ block: "nearest" });

    const seq = state.seq;
    const boxes = await boxesFor(it.page);
    if (seq !== state.seq) return;
    const box = boxes[Math.min(rankOnPage(state.index), boxes.length - 1)];
    // Sonuç ekranın üst kısmına, biraz boşlukla gelir.
    goTo(it.page, box ? Math.max(0, box[1] - 0.06) : 0);
    state.moved = true;
    markCurrent();
  }

  function markCurrent() {
    const it = state.items[state.index];
    const k = it ? rankOnPage(state.index) : -1;
    for (const layer of document.querySelectorAll(".search-layer")) {
      const onPage = it && Number(layer.dataset.page) === it.page;
      layer.querySelectorAll(".hit").forEach((el, j) => {
        el.classList.toggle("current", onPage && j === Math.min(k, layer.children.length - 1));
      });
    }
  }

  // Okuyucu bir sayfayı çizdiğinde çağırır; yalnızca sonucu olan sayfalar için istek yapılır.
  function decorate(page, el) {
    if (!state.q || !state.items.some((it) => it.page === page)) return;
    const seq = state.seq;
    boxesFor(page).then((boxes) => {
      if (seq !== state.seq || !el.isConnected) return;
      el.querySelector(".search-layer")?.remove();
      const layer = document.createElement("div");
      layer.className = "search-layer";
      layer.dataset.page = String(page);
      for (const [x0, y0, x1, y1] of boxes) {
        const hit = document.createElement("div");
        hit.className = "hit";
        hit.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`;
        layer.append(hit);
      }
      el.append(layer);
      markCurrent();
    });
  }

  // --- Olaylar ---------------------------------------------------------------

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));
  $("search-close").addEventListener("click", close);
  $("search-form").addEventListener("submit", (e) => e.preventDefault());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim().replace(/\s+/g, " ");
      if (q !== state.q) run(q);
      else go(state.index + (e.shiftKey ? -1 : 1));
    }
  });
  // Arama kutusundaki × ile temizlenince vurgular da kalkar.
  input.addEventListener("search", () => { if (!input.value) reset(); });
  buttons.next.addEventListener("click", () => go(state.index + 1));
  buttons.prev.addEventListener("click", () => go(state.index - 1));
  buttons.list.addEventListener("click", () => showList(list.hidden));
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-index]");
    if (!btn) return;
    go(Number(btn.dataset.index));
    if (NARROW.matches) showList(false);
  });

  return { open, close, isOpen, decorate };
}
