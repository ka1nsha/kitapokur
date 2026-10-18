// Seçili metni çevirme: okuyucuda metin seçilince altında küçük bir "Çevir"
// düğmesi çıkar; çeviri bir açılır kutuda (telefonda alttan çekmece) gösterilir.
import { api } from "./api.js";

const MAX_CHARS = 1500;   // sunucunun /api/translate sınırı
const PREVIEW_CHARS = 280;
const NARROW = window.matchMedia("(max-width: 720px)");
const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h8"/><path d="M8 3v2"/><path d="M5.5 5c.8 3 3 5.4 6 6.5"/><path d="M10.5 5c-.7 3.3-3 6-6.5 7.5"/><path d="M13 21l4-9 4 9"/><path d="M14.5 18h5"/></svg>';
const CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

// PDF metin katmanından gelen seçimde satır sonu tireleri ve boşluklar düzeltilir.
function clean(text) {
  return text.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2").replace(/\s+/g, " ").trim();
}

export function createSelectionTranslate({ viewer }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sel-translate";
  button.hidden = true;
  button.innerHTML = `${ICON}<span>Çevir</span>`;

  const pop = document.createElement("div");
  pop.className = "sel-pop";
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Seçili metnin çevirisi");
  document.body.append(button, pop);

  const cache = new Map();
  let selected = null;   // { text, rect }
  let timer = null;

  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    // Yalnızca kitap sayfalarındaki seçimler (arama kutusu, panel değil).
    if (!el?.closest(".pages")) return null;
    const text = clean(sel.toString());
    if (!/[a-z]/i.test(text)) return null;
    return { text, rect: range.getBoundingClientRect() };
  }

  // Seçimin altına, sığmazsa üstüne yerleştir.
  function place(el, rect, height) {
    const width = el.offsetWidth;
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function hideButton() {
    button.hidden = true;
  }

  function closePop() {
    pop.hidden = true;
  }

  function onSelectionChange() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      selected = readSelection();
      if (!selected) { hideButton(); return; }
      button.hidden = false;
      place(button, selected.rect, button.offsetHeight);
    }, 200);
  }

  async function translate() {
    if (!selected) return;
    const { text, rect } = selected;
    hideButton();
    const source = text.slice(0, MAX_CHARS);
    const tr = document.createElement("p");
    tr.className = "sel-tr";
    tr.textContent = "Çevriliyor…";
    const en = document.createElement("p");
    en.className = "sel-en";
    en.lang = "en";
    en.textContent = source.length > PREVIEW_CHARS ? `${source.slice(0, PREVIEW_CHARS)}…` : source;
    const head = document.createElement("div");
    head.className = "sel-head";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Google Çeviri";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-btn plain";
    close.setAttribute("aria-label", "Kapat");
    close.innerHTML = CLOSE;
    close.addEventListener("click", closePop);
    head.append(label, close);
    pop.replaceChildren(head, en, tr);
    if (text.length > MAX_CHARS) {
      const note = document.createElement("p");
      note.className = "sel-note";
      note.textContent = `Seçim uzun; ilk ${MAX_CHARS} karakter çevrildi.`;
      pop.append(note);
    }
    pop.hidden = false;
    if (!NARROW.matches) place(pop, rect, pop.offsetHeight + 80);
    else pop.style.top = pop.style.left = "";

    try {
      if (!cache.has(source)) cache.set(source, api.translate(source).then((r) => r.translation));
      tr.textContent = await cache.get(source);
    } catch (err) {
      cache.delete(source);
      tr.textContent = err.message || "Çeviri alınamadı.";
      tr.classList.add("error");
    }
    if (!NARROW.matches && !pop.hidden) place(pop, rect, pop.offsetHeight);
  }

  document.addEventListener("selectionchange", onSelectionChange);
  // Düğmeye basmak seçimi kaldırmasın.
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("click", translate);
  viewer.addEventListener("scroll", () => {
    hideButton();
    if (!NARROW.matches) closePop();
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== button) closePop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) { closePop(); e.stopPropagation(); }
  }, true);

  return { isOpen: () => !pop.hidden };
}
