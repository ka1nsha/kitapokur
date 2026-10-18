// Sunucu API'si ve sayfalar arasında paylaşılan küçük yardımcılar.

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) goToProfiles();
  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Profil seçilmemişse (ya da profil silinmişse) seçim ekranına git, sonra buraya dön.
export function goToProfiles() {
  if (location.pathname === "/profiles.html") return;
  const next = location.pathname + location.search;
  location.href = `/profiles.html?next=${encodeURIComponent(next)}`;
}

async function errorMessage(res) {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
  } catch { /* gövde JSON değil */ }
  return `Sunucu hatası (${res.status})`;
}

export const api = {
  listBooks: () => request("GET", "/api/books"),
  getBook: (id) => request("GET", `/api/books/${id}`),
  bookToc: (id) => request("GET", `/api/books/${id}/toc`),
  searchBook: (id, q) => request("GET", `/api/books/${id}/search?${new URLSearchParams({ q })}`),
  searchPage: (id, page, q) => request("GET", `/api/books/${id}/pages/${page}/search?${new URLSearchParams({ q })}`),
  stats: () => request("GET", "/api/stats"),  updateBook: (id, fields) => request("PATCH", `/api/books/${id}`, fields),
  deleteBook: (id) => request("DELETE", `/api/books/${id}`),
  saveProgress: (id, page, offset) =>
    request("POST", `/api/books/${id}/progress`, { page, offset }),

  getSettings: () => request("GET", "/api/settings"),
  updateSettings: (fields) => request("PUT", "/api/settings", fields),
  pageWords: (id, page) => request("GET", `/api/books/${id}/pages/${page}/words`),
  bookWords: (id, { status = "new", sort = "count", limit = 100, offset = 0 } = {}) =>
    request("GET", `/api/books/${id}/words?${new URLSearchParams({ status, sort, limit, offset })}`),
  bookWord: (id, wordId, page) =>
    request("GET", `/api/books/${id}/words/${wordId}${page ? `?page=${page}` : ""}`),
  lookupAt: (id, page, x, y) =>
    request("GET", `/api/books/${id}/lookup?${new URLSearchParams({ page, x: x.toFixed(4), y: y.toFixed(4) })}`),
  users: () => request("GET", "/api/users"),
  createUser: (fields) => request("POST", "/api/users", fields),
  updateUser: (id, fields) => request("PATCH", `/api/users/${id}`, fields),
  deleteUser: (id) => request("DELETE", `/api/users/${id}`),
  session: () => request("GET", "/api/session"),
  selectUser: (userId) => request("POST", "/api/session", { user_id: userId }),
  setWordStatus: (wordId, status, context = {}) =>
    request("PUT", `/api/words/${wordId}/status`, { status, ...context }),
  studySummary: () => request("GET", "/api/study/summary"),
  studyBooks: () => request("GET", "/api/study/books"),
  studyNext: (book) => request("GET", `/api/study/next${book ? `?book=${book}` : ""}`),
  studyReview: (cardId, body, book) =>
    request("POST", `/api/study/cards/${cardId}/review${book ? `?book=${book}` : ""}`, body),
  studySettings: (fields) => request("PUT", "/api/study/settings", fields),
  cards: (query) => request("GET", `/api/cards?${query}`),
  addCard: (fields) => request("POST", "/api/cards", fields),
  updateCard: (id, fields) => request("PATCH", `/api/cards/${id}`, fields),
  resetCard: (id) => request("POST", `/api/cards/${id}/reset`),
  deleteCard: (id) => request("DELETE", `/api/cards/${id}`),
  wordDetails: (wordId) => request("GET", `/api/words/${wordId}/details`),
  translate: (text) => request("POST", "/api/translate", { text }),

  // Sayfa kapanırken bile gönderilebilen konum kaydı.
  beaconProgress(id, page, offset) {
    const blob = new Blob([JSON.stringify({ page, offset })], { type: "application/json" });
    return navigator.sendBeacon(`/api/books/${id}/progress`, blob);
  },

  // fetch yükleme ilerlemesini bildirmediği için XHR kullanılır.
  uploadBook(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/books");
      xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status === 401) goToProfiles();
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { /* boş gövde */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.detail && typeof data.detail === "string"
          ? data.detail : `Yükleme başarısız (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Sunucuya ulaşılamadı."));
      xhr.send(file);
    });
  },
};

export function timeAgo(unixSeconds) {
  if (!unixSeconds) return "Henüz açılmadı";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  const date = new Date(unixSeconds * 1000);
  const time = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return `bugün ${time}`;
  if (days === 1) return `dün ${time}`;
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function percent(progress) {
  return `%${Math.round(progress * 100)}`;
}

// Kısa süreli bildirim. İsteğe bağlı ilerleme çubuğu güncellenebilir.
export function toast(message, { error = false, progress = false, timeout = 4000, action = null } = {}) {
  let root = document.querySelector(".toasts");
  if (!root) {
    root = document.createElement("div");
    root.className = "toasts";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.append(root);
  }
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = message;
  const pct = document.createElement("span");
  row.append(name, pct);
  el.append(row);
  let bar = null;
  if (progress) {
    const track = document.createElement("div");
    track.className = "bar";
    bar = document.createElement("div");
    track.append(bar);
    el.append(track);
  }
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => { action.onClick(); el.remove(); });
    row.append(btn);
  }
  root.append(el);

  const close = () => el.remove();
  if (!progress) setTimeout(close, timeout);
  return {
    setProgress(p) {
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      pct.textContent = percent(p);
    },
    setText(text) { name.textContent = text; },
    done(text, { isError = false } = {}) {
      name.textContent = text;
      pct.textContent = "";
      el.classList.toggle("error", isError);
      bar?.parentElement.remove();
      setTimeout(close, isError ? 6000 : 3000);
    },
    close,
  };
}

export const icons = {
  upload: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  spinner: '<svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  alert: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg>',
};

// --- Site teması (Sistem / Açık / Koyu) ---------------------------------------
// "auto" cihazın açık/koyu ayarını izler; seçim cihaz başına saklanır. Her
// sayfanın <head> bölümündeki küçük betik de aynısını boyamadan önce uygular.

export const THEMES = { auto: "Sistem", light: "Açık", dark: "Koyu" };
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function siteTheme() {
  try {
    const t = localStorage.getItem("okur.theme");
    return t === "light" || t === "dark" ? t : "auto";
  } catch { return "auto"; }
}

export function isDark() {
  const t = siteTheme();
  return t === "dark" || (t === "auto" && darkQuery.matches);
}

function applySiteTheme() {
  const t = siteTheme();
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  // Okuyucu, tarayıcı çubuğu rengini okuma görünümüne göre kendisi ayarlar.
  if (!document.documentElement.dataset.reading) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark() ? "#1A1D20" : "#FFFFFF");
  }
}

export function setSiteTheme(t) {
  try { localStorage.setItem("okur.theme", t); } catch { /* özel pencere */ }
  applySiteTheme();
}

applySiteTheme();
darkQuery.addEventListener("change", applySiteTheme);

// Telefona kurulum ve bağlantı yokken açılış için (bkz. /sw.js). Tarayıcılar
// service worker'ı yalnızca HTTPS'te ya da localhost'ta çalıştırır.
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Diyaloglardaki "Vazgeç" düğmeleri formu göndermez; Enter tuşu böylece
// kaydetme düğmesini tetikler (HTML'de Enter ilk gönderme düğmesine basar).
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("dialog [data-close]");
  if (btn) btn.closest("dialog").close("cancel");
});
