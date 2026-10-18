// Okuyucudaki içindekiler paneli.

import { api } from "./api.js";

export function createToc({ bookId, goTo }) {
  const root = document.getElementById("toc");
  const list = document.getElementById("toc-list");
  const toggle = document.getElementById("toc-toggle");
  const note = document.getElementById("toc-source");
  const narrow = window.matchMedia("(max-width: 900px)");

  let items = [];
  let buttons = [];
  let currentIndex = -1;

  function isOpen() { return !root.hidden; }

  function open() {
    root.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("toc-open");
    buttons[currentIndex]?.scrollIntoView({ block: "center" });
    (buttons[currentIndex] || buttons[0])?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    root.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("toc-open");
  }

  function render() {
    const frag = document.createDocumentFragment();
    buttons = items.map((item, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `toc-item level-${Math.min(item.level, 4)}`;
      const title = document.createElement("span");
      title.className = "toc-title";
      title.textContent = item.title;
      // Bölüm adları kitabın dilinde; büyük/küçük harf ve seslendirme İngilizce kurallara göre.
      title.lang = "en";
      const page = document.createElement("span");
      page.className = "toc-page";
      page.textContent = String(item.page);
      btn.append(title, page);
      btn.addEventListener("click", () => {
        goTo(item.page, item.offset);
        if (narrow.matches) close();
      });
      li.append(btn);
      frag.append(li);
      return btn;
    });
    list.replaceChildren(frag);
  }

  // Okunan konumu içeren bölümü işaretle.
  function setPosition(page, offset) {
    let idx = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.page < page || (it.page === page && it.offset <= offset + 0.02)) idx = i;
      else break;
    }
    if (idx === currentIndex) return;
    buttons[currentIndex]?.removeAttribute("aria-current");
    currentIndex = idx;
    buttons[idx]?.setAttribute("aria-current", "true");
  }

  async function load() {
    try {
      const data = await api.bookToc(bookId);
      // Sayfa sırasına göre (bazı PDF'lerde içindekiler sırasız olabiliyor).
      items = data.items.slice().sort((a, b) => a.page - b.page || a.offset - b.offset);
      if (!items.length) return;
      note.textContent = data.source === "auto"
        ? "Bu PDF'te içindekiler tablosu yok; bölüm başlıkları sayfalardan bulundu."
        : "";
      note.hidden = data.source !== "auto";
      render();
      toggle.hidden = false;
    } catch { /* içindekiler olmadan da okunabilir */ }
  }

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));
  document.getElementById("toc-close").addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); toggle.focus(); }
  });
  // Dar ekranda panelin dışına dokununca kapanır.
  document.addEventListener("pointerdown", (e) => {
    if (narrow.matches && isOpen() && !root.contains(e.target) && !toggle.contains(e.target)) close();
  });

  return { load, setPosition, close, isOpen };
}
