import * as pdfjsLib from "/vendor/pdfjs/pdf.min.mjs";
import { api, toast } from "./api.js";
import { createPanel } from "./panel.js";
import { createSearch } from "./search.js";
import { createSelectionTranslate } from "./selection.js";
import { createToc } from "./toc.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";

// css/reader.css içindeki .pages değerleriyle aynı olmalı.
const PAGE_GAP = 16;
const PAD_Y = 24;
const PAD_X = 12;

// Masaüstünde sayfa ekranı kaplamasın; okunaklı bir sütun genişliği.
const MAX_FIT_WIDTH = 900;
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Görünür alanın dışında önceden çizilecek ve bellekte tutulacak sayfa sayısı.
const RENDER_AHEAD = 1;
const KEEP_AROUND = 4;
// Telefonlarda bellek taşmasını önlemek için tek bir tuvalin piksel sınırı.
const MAX_CANVAS_PIXELS = 8 * 1024 * 1024;
const SAVE_DELAY = 1000;

const $ = (id) => document.getElementById(id);
const viewer = $("viewer");
const pagesEl = $("pages");
const pageInput = $("page-input");
const saveState = $("save-state");

const bookId = Number(new URLSearchParams(location.search).get("book"));
const panel = createPanel({ bookId, goToPage: (n) => goToPage(n) });
const toc = createToc({ bookId, goTo: (page, offset) => goToPosition(page, offset) });
const search = createSearch({
  bookId,
  goTo: (page, offset, opts) => goToPosition(page, offset, opts),
  currentPosition: () => currentPosition(),
  renderedPages: () => state.pages.flatMap((p, i) => (p.textLayer ? [{ page: i + 1, el: p.el }] : [])),
});
createSelectionTranslate({ viewer });
// PDF içi bağlantıların hedefi (isim ya da açık hedef dizisi).
const linkDest = new WeakMap();

const state = {
  book: null,
  pdf: null,
  sizes: [],       // her sayfanın PDF nokta cinsinden [genişlik, yükseklik] değeri
  tops: [],        // her sayfanın .pages içindeki üst konumu (px)
  heights: [],
  scale: 1,        // PDF noktasından CSS pikseline çarpan
  pageScales: [],  // sayfa başına gerçek çarpan (geniş sayfalar küçültülür)
  zoom: readZoom(),
  pages: [],       // { el, canvas, textLayer, linkLayer, renderedScale, task, busy }
  current: 1,
  ready: false,    // ilk konum geri yüklenmeden kayıt yapılmaz
  dirty: false,
  saveTimer: null,
  lastSaved: null,
};

// --- Yardımcılar ------------------------------------------------------------

function readZoom() {
  try { return Number(localStorage.getItem("okur.zoom")) || 1; } catch { return 1; }
}
function writeZoom(z) {
  try { localStorage.setItem("okur.zoom", String(z)); } catch { /* özel pencere */ }
}

function showMessage(title, text, { link = true } = {}) {
  const box = $("viewer-message");
  box.replaceChildren();
  const h2 = document.createElement("h2");
  h2.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  box.append(h2, p);
  if (link) {
    const a = document.createElement("a");
    a.href = "/";
    a.className = "btn btn-primary";
    a.textContent = "Kütüphaneye dön";
    box.append(a);
  }
  box.hidden = false;
}

function setSaveState(kind, text) {
  saveState.className = `save-state ${kind}`;
  saveState.textContent = text;
}

// Sayfaların çoğunun genişliği. Tek bir geniş sayfa (ör. katlanır harita)
// bütün kitabı küçültmesin diye en geniş yerine en sık görülen kullanılır.
function typicalWidth() {
  const counts = new Map();
  for (const [w] of state.sizes) counts.set(w, (counts.get(w) || 0) + 1);
  let best = state.sizes[0][0], bestCount = 0;
  for (const [w, c] of counts) if (c > bestCount) { best = w; bestCount = c; }
  return best;
}

function fitScale() {
  const avail = Math.min(viewer.clientWidth - PAD_X * 2, MAX_FIT_WIDTH);
  return Math.max(avail, 200) / typicalWidth();
}

// Okuma konumu ekranın üst kısmındaki bir çizgiye göre ölçülür; böylece
// farklı ekran yüksekliklerinde de aynı satır aynı yere gelir.
function anchorY() {
  return Math.min(viewer.clientHeight * 0.25, 160);
}

function pageIndexAt(y) {
  const { tops } = state;
  let lo = 0, hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function currentPosition() {
  const y = viewer.scrollTop + anchorY();
  const i = pageIndexAt(y);
  const offset = Math.min(1, Math.max(0, (y - state.tops[i]) / state.heights[i]));
  return { page: i + 1, offset };
}

function scrollToPosition(page, offset) {
  const i = Math.min(Math.max(page, 1), state.sizes.length) - 1;
  viewer.scrollTop = state.tops[i] + offset * state.heights[i] - anchorY();
}

// --- Yerleşim ---------------------------------------------------------------

function buildPages() {
  const frag = document.createDocumentFragment();
  state.pages = state.sizes.map((_, i) => {
    const el = document.createElement("div");
    el.className = "page";
    el.dataset.page = String(i + 1);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `Sayfa ${i + 1}`);
    frag.append(el);
    return { el, canvas: null, textLayer: null, linkLayer: null, renderedScale: 0, task: null, busy: false };
  });
  pagesEl.replaceChildren(frag);
}

function layout() {
  state.scale = fitScale() * state.zoom;
  // Yakınlaştırılmamışken, ekrandan geniş sayfalar (yatay sayfa, katlanır
  // harita) ayrıca küçültülür; aksi halde tüm sütun yana taşar.
  const avail = viewer.clientWidth - PAD_X * 2;
  let y = PAD_Y;
  state.tops = [];
  state.heights = [];
  state.pageScales = [];
  state.sizes.forEach(([w, h], i) => {
    const scale = state.zoom <= 1 ? Math.min(state.scale, avail / w) : state.scale;
    const cw = w * scale, ch = h * scale;
    const { el } = state.pages[i];
    el.style.width = `${cw}px`;
    el.style.height = `${ch}px`;
    el.style.setProperty("--total-scale-factor", String(scale * (state.pages[i].userUnit || 1)));
    state.pageScales.push(scale);
    state.tops.push(y);
    state.heights.push(ch);
    y += ch + PAGE_GAP;
  });
  $("zoom-reset").textContent = `%${Math.round(state.zoom * 100)}`;
}

// Konumu koruyarak yeniden yerleştir (yakınlaştırma, pencere boyutu).
function relayout() {
  const pos = state.ready
    ? currentPosition()
    : { page: state.book.last_page, offset: state.book.last_offset };
  layout();
  scrollToPosition(pos.page, pos.offset);
  scheduleUpdate();
}

// --- Çizim ------------------------------------------------------------------

let updateQueued = false;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => {
    updateQueued = false;
    update();
  });
}

function update() {
  if (!state.pdf) return;
  const top = viewer.scrollTop;
  const first = pageIndexAt(top);
  const last = pageIndexAt(top + viewer.clientHeight);

  // Önce ekrandakiler, sonra hemen öncesi/sonrası.
  const order = [];
  for (let i = first; i <= last; i++) order.push(i);
  for (let d = 1; d <= RENDER_AHEAD; d++) order.push(last + d, first - d);
  for (const i of order) if (i >= 0 && i < state.pages.length) renderPage(i);

  // Uzaktaki sayfaların tuvallerini bırak.
  state.pages.forEach((p, i) => {
    if ((i < first - KEEP_AROUND || i > last + KEEP_AROUND) && (p.canvas || p.task)) releasePage(i);
  });

  const pos = currentPosition();
  if (pos.page !== state.current) {
    state.current = pos.page;
    updatePageUi();
    panel.setPage(pos.page);
  }
  toc.setPosition(pos.page, pos.offset);
  const total = state.sizes.length;
  $("read-progress").style.width = `${((pos.page - 1 + pos.offset) / total) * 100}%`;
}

async function renderPage(i) {
  const p = state.pages[i];
  if (p.busy || p.renderedScale === state.pageScales[i]) return;
  p.busy = true;
  const scale = state.pageScales[i];
  try {
    const page = await state.pdf.getPage(i + 1);
    let viewport = page.getViewport({ scale });

    // Sunucunun bildirdiği boyut PDF.js'inkinden farklıysa düzelt.
    const base = page.getViewport({ scale: 1 });
    p.userUnit = base.userUnit || 1;
    const [w, h] = state.sizes[i];
    if (Math.abs(base.width - w) > 0.5 || Math.abs(base.height - h) > 0.5) {
      state.sizes[i] = [base.width, base.height];
      p.busy = false;
      relayout();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let outputScale = dpr;
    const pixels = viewport.width * viewport.height * dpr * dpr;
    if (pixels > MAX_CANVAS_PIXELS) outputScale = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.setAttribute("aria-hidden", "true");

    p.task = page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
    });
    await p.task.promise;
    p.task = null;

    // Eski tuval, yenisi hazır olana kadar yerinde kalır (yakınlaştırmada titreme olmaz).
    if (p.canvas) p.canvas.replaceWith(canvas); else p.el.prepend(canvas);
    p.canvas = canvas;
    p.renderedScale = scale;

    // Metin katmanı CSS değişkeniyle ölçeklendiği için bir kez kurulması yeterli.
    if (!p.textLayer) {
      const div = document.createElement("div");
      div.className = "textLayer";
      p.el.append(div);
      p.textLayer = div;
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
        container: div,
        viewport,
      });
      await textLayer.render();
      panel.decorate(i + 1, p.el);
      search.decorate(i + 1, p.el);
      addLinks(p, page, viewport);
    }
  } catch (err) {
    if (err?.name !== "RenderingCancelledException") console.error(`Sayfa ${i + 1} çizilemedi`, err);
  } finally {
    p.busy = false;
    p.task = null;
  }
  // Çizim sürerken ölçek değiştiyse tekrar dene.
  if (p.renderedScale !== state.pageScales[i] && p.canvas) scheduleUpdate();
}

function releasePage(i) {
  const p = state.pages[i];
  p.task?.cancel();
  if (p.canvas) {
    // Tuval belleğini hemen geri ver (özellikle iOS Safari için önemli).
    p.canvas.width = p.canvas.height = 0;
    p.canvas.remove();
    p.canvas = null;
  }
  p.textLayer?.remove();
  p.linkLayer?.remove();
  p.el.querySelector(".search-layer")?.remove();
  panel.forget(i + 1);
  p.textLayer = null;
  p.linkLayer = null;
  p.renderedScale = 0;
  state.pdf.getPage(i + 1).then((page) => page.cleanup()).catch(() => {});
}

// --- PDF içi bağlantılar ------------------------------------------------------

async function addLinks(p, page, viewport) {
  let annotations;
  try {
    annotations = await page.getAnnotations({ intent: "display" });
  } catch { return; }
  const links = annotations.filter((a) => a.subtype === "Link" && (a.url || a.dest));
  if (!links.length || !p.textLayer) return;

  const layer = document.createElement("div");
  layer.className = "link-layer";
  for (const a of links) {
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    const el = document.createElement("a");
    el.style.cssText = `left:${(Math.min(x1, x2) / viewport.width) * 100}%;`
      + `top:${(Math.min(y1, y2) / viewport.height) * 100}%;`
      + `width:${(Math.abs(x2 - x1) / viewport.width) * 100}%;`
      + `height:${(Math.abs(y2 - y1) / viewport.height) * 100}%`;
    if (a.url) {
      // PDF.js yalnızca güvenli adresleri (http, https, mailto…) a.url olarak verir.
      el.href = a.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.title = a.url;
    } else {
      el.href = "#";
      el.title = "Bağlantıya git";
      linkDest.set(el, a.dest);
    }
    layer.append(el);
  }
  p.el.append(layer);
  p.linkLayer = layer;
}

// Bağlantı hedefini sayfa numarası ve sayfa içindeki konuma çevir.
async function resolveDest(dest) {
  const explicit = typeof dest === "string" ? await state.pdf.getDestination(dest) : dest;
  if (!Array.isArray(explicit)) return null;
  const [ref, kind, ...args] = explicit;
  const index = ref && typeof ref === "object" ? await state.pdf.getPageIndex(ref) : ref;
  if (!Number.isInteger(index)) return null;

  // Hedefin üst kenarı (PDF koordinatı, aşağıdan yukarı).
  let top = null;
  if (kind?.name === "XYZ") top = args[1];
  else if (kind?.name === "FitH" || kind?.name === "FitBH") top = args[0];
  else if (kind?.name === "FitR") top = args[3];

  let offset = 0;
  if (typeof top === "number") {
    const target = await state.pdf.getPage(index + 1);
    const [, y0, , y1] = target.view;
    offset = Math.min(1, Math.max(0, (y1 - top) / (y1 - y0)));
  }
  return { page: index + 1, offset };
}

async function followLink(el) {
  let target;
  try { target = await resolveDest(linkDest.get(el)); } catch { target = null; }
  if (!target) { toast("Bağlantının hedefi bulunamadı.", { error: true }); return; }
  const from = currentPosition();
  goToPosition(target.page, target.offset);
  // Dipnot ya da içindekiler bağlantısından sonra okunan yere kolayca dönülebilsin.
  toast("Bağlantıdaki sayfaya gidildi", {
    timeout: 8000,
    action: { label: "Geri dön", onClick: () => goToPosition(from.page, from.offset, { exact: true }) },
  });
}

// --- Gezinme ----------------------------------------------------------------

function updatePageUi() {
  const total = state.sizes.length;
  if (document.activeElement !== pageInput) pageInput.value = String(state.current);
  $("prev").disabled = state.current <= 1;
  $("next").disabled = state.current >= total;
}

function goToPage(n) {
  const total = state.sizes.length;
  const page = Math.min(Math.max(Math.round(n) || 1, 1), total);
  viewer.scrollTop = state.tops[page - 1] - PAD_Y / 2;
  // Art arda tuşa basıldığında bir sonraki hedef doğru hesaplansın diye
  // sayfa numarası bir sonraki kareyi beklemeden güncellenir.
  update();
}

// Sayfa içindeki bir konuma git. Hedef (bölüm başlığı, bağlantı) ekranın
// üstüne gelir; exact ise kaydedilen okuma konumu gibi okuma çizgisine.
function goToPosition(page, offset, { exact = false } = {}) {
  if (!state.sizes.length) return;
  if (exact) scrollToPosition(page, offset);
  else {
    const i = Math.min(Math.max(page, 1), state.sizes.length) - 1;
    viewer.scrollTop = state.tops[i] + offset * state.heights[i] - PAD_Y / 2;
  }
  update();
}

function setZoom(z) {
  state.zoom = Math.min(Math.max(z, ZOOM_STEPS[0]), ZOOM_STEPS.at(-1));
  writeZoom(state.zoom);
  relayout();
}

function zoomStep(dir) {
  const z = state.zoom;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
  if (next) setZoom(next);
}

// --- Konum kaydı ------------------------------------------------------------

function markDirty() {
  if (!state.ready) return;
  state.dirty = true;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, SAVE_DELAY);
}

async function save() {
  if (!state.dirty) return;
  const { page, offset } = currentPosition();
  const key = `${page}:${offset.toFixed(3)}`;
  if (key === state.lastSaved) { state.dirty = false; return; }
  state.dirty = false;
  setSaveState("pending", "Kaydediliyor…");
  try {
    await api.saveProgress(bookId, page, offset);
    state.lastSaved = key;
    setSaveState("", "Konum kaydedildi");
  } catch {
    state.dirty = true;
    setSaveState("error", "Kaydedilemedi, tekrar denenecek");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(save, 5000);
  }
}

// Sekme kapanırken ya da arka plana geçerken bekleyen kaydı hemen gönder.
function flush() {
  if (!state.ready || !state.dirty) return;
  clearTimeout(state.saveTimer);
  const { page, offset } = currentPosition();
  if (api.beaconProgress(bookId, page, offset)) {
    state.dirty = false;
    state.lastSaved = `${page}:${offset.toFixed(3)}`;
  }
}

// --- Başlangıç --------------------------------------------------------------

async function waitUntilReady() {
  for (;;) {
    const book = await api.getBook(bookId);
    if (book.status !== "processing") return book;
    showMessage("Kitap hazırlanıyor", "Sayfalar işleniyor, birkaç saniye içinde açılacak.", { link: false });
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function init() {
  if (!bookId) {
    showMessage("Kitap seçilmedi", "Kütüphaneden bir kitap aç.");
    return;
  }

  let book;
  try {
    book = await waitUntilReady();
  } catch (err) {
    showMessage("Kitap açılamadı", err.message);
    return;
  }
  $("viewer-message").hidden = true;
  if (book.status === "error") {
    showMessage("Kitap açılamadı", book.error || "PDF işlenemedi.");
    return;
  }

  state.book = book;
  state.sizes = book.page_sizes;
  document.title = `${book.title} · Okur`;
  document.querySelector(".book-title").textContent = book.title;
  document.querySelector(".book-author").textContent = book.author;
  $("page-total").textContent = `/ ${book.page_count}`;

  // Sayfa iskeleti PDF indirilmeden kurulur ve okuma konumuna hemen gidilir.
  buildPages();
  layout();
  scrollToPosition(book.last_page, book.last_offset);
  state.current = book.last_page;
  updatePageUi();
  panel.setPage(book.last_page);
  // Kelime listesi PDF'i beklemeden yüklenmeye başlar.
  panel.start(book);
  toc.load().then(() => {
    const pos = currentPosition();
    toc.setPosition(pos.page, pos.offset);
  });

  try {
    // PDF bütünüyle indirilmez; yalnızca gereken parçalar Range istekleriyle alınır.
    state.pdf = await pdfjsLib.getDocument({
      url: `/api/books/${bookId}/file`,
      rangeChunkSize: 256 * 1024,
      disableAutoFetch: true,
      disableStream: true,
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      wasmUrl: "/vendor/pdfjs/wasm/",
      isEvalSupported: false,
    }).promise;
  } catch (err) {
    showMessage("PDF açılamadı", err?.message || "Dosya okunamadı.");
    return;
  }

  state.ready = true;
  update();
  // Açılışı "son okunan" olarak işaretle.
  state.dirty = true;
  save();
}

// --- Olaylar ----------------------------------------------------------------

viewer.addEventListener("scroll", () => {
  scheduleUpdate();
  markDirty();
}, { passive: true });

// Pencere boyutu ya da kelime panelinin açılıp kapanması okuma alanını değiştirir.
let resizeTimer;
let lastWidth = 0;
new ResizeObserver(() => {
  if (viewer.clientWidth === lastWidth) return;
  lastWidth = viewer.clientWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.sizes.length && relayout(), 120);
}).observe(viewer);

$("prev").addEventListener("click", () => goToPage(state.current - 1));
$("next").addEventListener("click", () => goToPage(state.current + 1));
$("zoom-in").addEventListener("click", () => zoomStep(1));
$("zoom-out").addEventListener("click", () => zoomStep(-1));
$("zoom-reset").addEventListener("click", () => setZoom(1));

$("page-form").addEventListener("submit", (e) => {
  e.preventDefault();
  goToPage(Number(pageInput.value));
  pageInput.blur();
});
// Kutu, kullanıcı ona gelene kadar salt okunur kalır. Bazı tarayıcı
// eklentileri sayfa açılırken ilk düzenlenebilir kutuya odaklanıyor; bu da
// ok tuşlarıyla sayfa çevirmeyi engelliyordu.
// Dokunmatik ekranda klavyenin açılması için kutu odaklanmadan önce açılmalı.
pageInput.addEventListener("pointerdown", () => { if (state.ready) pageInput.readOnly = false; });
pageInput.addEventListener("focus", () => {
  if (!state.ready) return;
  pageInput.readOnly = false;
  pageInput.select();
});
pageInput.addEventListener("blur", () => {
  pageInput.readOnly = true;
  pageInput.value = String(state.current);
});

// PDF.js sayfaları ekrana geldikçe çizildiği için tarayıcının kendi araması
// kitabın tamamını göremez; Ctrl+F uygulamanın aramasını açar.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f" && state.ready) {
    e.preventDefault();
    search.open();
  } else if (e.key === "Escape" && search.isOpen() && !e.target.closest("input, .panel, .toc, dialog")) {
    search.close();
  }
});

// --- Okuma görünümü (açık / sepya / gece) -------------------------------------

const READING_THEMES = ["light", "sepia", "night"];
const themeToggle = $("theme-toggle");
const themePop = $("theme-pop");

function applyReadingTheme(theme) {
  if (!READING_THEMES.includes(theme)) theme = "light";
  document.documentElement.dataset.reading = theme;
  try { localStorage.setItem("okur.reading", theme); } catch { /* özel pencere */ }
  themePop.querySelectorAll("[data-reading]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.reading === theme)));
  // Tarayıcı çubuğunun rengi de görünüme uysun (telefonda).
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",
    { light: "#FFFFFF", sepia: "#F3EAD6", night: "#16191B" }[theme]);
}

function setThemePop(open) {
  themePop.hidden = !open;
  themeToggle.setAttribute("aria-expanded", String(open));
  if (open) themePop.querySelector('[aria-checked="true"]')?.focus();
}

applyReadingTheme(document.documentElement.dataset.reading);
themeToggle.addEventListener("click", () => setThemePop(themePop.hidden));
themePop.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-reading]");
  if (!btn) return;
  applyReadingTheme(btn.dataset.reading);
  setThemePop(false);
  themeToggle.focus();
});
themePop.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.stopPropagation(); setThemePop(false); themeToggle.focus(); }
});
document.addEventListener("pointerdown", (e) => {
  if (!themePop.hidden && !e.target.closest(".theme-menu")) setThemePop(false);
});

document.addEventListener("keydown", (e) => {
  if (!state.ready || e.target.closest("input, textarea, select, [contenteditable], .panel, .toc, dialog")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomStep(1); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoomStep(-1); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setZoom(1); }
    return;
  }
  if (e.key === "ArrowRight") { e.preventDefault(); goToPage(state.current + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); goToPage(state.current - 1); }
  else if (e.key === "Home") { e.preventDefault(); goToPage(1); }
  else if (e.key === "End") { e.preventDefault(); goToPage(state.sizes.length); }
});

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
window.addEventListener("pagehide", flush);

viewer.addEventListener("click", (e) => {
  const link = e.target.closest?.(".link-layer a");
  if (link) {
    // Web adresleri yeni sekmede açılır; kitap içi bağlantılar burada izlenir.
    if (linkDest.has(link)) { e.preventDefault(); followLink(link); }
    return;
  }
  panel.handleViewerClick(e);
});

viewer.focus({ preventScroll: true });
init();
