// Profil seçimi ("Kim okuyor?").
import { api, toast } from "./api.js";

const COLORS = ["#0E6B5A", "#1F5FA8", "#9A4F0F", "#7A3E9D", "#A1281C", "#2E5E73", "#5A6168"];
const grid = document.getElementById("profile-grid");
const manageBtn = document.getElementById("manage");
const dialog = document.getElementById("profile-dialog");
const form = document.getElementById("profile-form");
const deleteDialog = document.getElementById("delete-dialog");
const formError = document.getElementById("form-error");

let users = [];
let managing = false;

// Yalnızca kendi sitemizdeki bir sayfaya dön.
function nextUrl() {
  const next = new URLSearchParams(location.search).get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function initial(name) {
  return [...name.trim()][0]?.toLocaleUpperCase("tr") || "?";
}

function meta(u) {
  const parts = [];
  if (u.deck) parts.push(`${u.deck} kelime destede`);
  if (u.books) parts.push(`${u.books} kitap`);
  return parts.join(" · ") || "Yeni profil";
}

function render() {
  grid.classList.toggle("managing", managing);
  manageBtn.textContent = managing ? "Bitti" : "Profilleri yönet";
  manageBtn.setAttribute("aria-pressed", String(managing));
  const items = users.map((u) => h("li", {},
    h("button", {
      type: "button", class: "profile", "aria-label": managing ? `${u.name} (yönetim modunda)` : `${u.name} olarak devam et`,
      onclick: () => (managing ? null : choose(u)),
    },
      h("span", { class: "avatar", style: `background: ${u.color}`, "aria-hidden": "true" }, initial(u.name)),
      h("span", { class: "name" }, u.name),
      h("span", { class: "meta" }, meta(u))),
    managing ? h("div", { class: "manage-row" },
      h("button", { type: "button", class: "btn btn-ghost", onclick: () => editProfile(u) }, "Düzenle"),
      h("button", { type: "button", class: "btn btn-ghost", onclick: () => removeProfile(u) }, "Sil")) : null,
  ));
  items.push(h("li", {},
    h("button", { type: "button", class: "profile add", onclick: () => editProfile(null) },
      h("span", { class: "avatar", "aria-hidden": "true" }, "+"),
      h("span", { class: "name" }, "Profil ekle"),
      h("span", { class: "meta" }, "Ailedeki başka biri için"))));
  grid.replaceChildren(...items);
}

async function load() {
  try {
    users = await api.users();
  } catch (err) {
    toast(`Profiller yüklenemedi: ${err.message}`, { error: true });
    return;
  }
  render();
}

async function choose(u) {
  try {
    await api.selectUser(u.id);
    location.href = nextUrl();
  } catch (err) {
    toast(err.message, { error: true });
  }
}

// --- Ekle / düzenle --------------------------------------------------------------

function renderSwatches(selected) {
  const box = document.getElementById("swatches");
  box.replaceChildren(...COLORS.map((c, i) => h("label", { class: "swatch" },
    h("input", { type: "radio", name: "color", value: c, checked: c === selected, "aria-label": `Renk ${i + 1}` }),
    h("span", { style: `background: ${c}` }))));
}

function editProfile(user) {
  // Düzenlenen profilin kimliği diyalogda saklanır; yeni profilde boştur.
  if (user) dialog.dataset.userId = String(user.id); else delete dialog.dataset.userId;
  document.getElementById("dialog-title").textContent = user ? "Profili düzenle" : "Yeni profil";
  form.elements.name.value = user?.name || "";
  renderSwatches(user?.color || COLORS[users.length % COLORS.length]);
  formError.hidden = true;
  dialog.returnValue = "";
  dialog.showModal();
  form.elements.name.focus();
}

// Hata olursa diyalog açık kalsın; bu yüzden gönderim elle yönetilir.
form.addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  e.preventDefault();
  const name = form.elements.name.value.trim();
  const color = form.querySelector("input[name=color]:checked")?.value;
  if (!name) return;
  try {
    if (dialog.dataset.userId) {
      await api.updateUser(Number(dialog.dataset.userId), { name, color });
      dialog.close();
      await load();
    } else {
      // Yeni profil oluşturulunca doğrudan o profille devam edilir.
      await api.createUser({ name, color });
      dialog.close();
      location.href = nextUrl();
    }
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

async function removeProfile(u) {
  deleteDialog.querySelector(".delete-text").textContent =
    `“${u.name}” profilinin okuma konumları, kelimeleri ve destesi (${u.deck} kart) kalıcı olarak silinecek. Kitaplar silinmez.`;
  deleteDialog.returnValue = "";
  deleteDialog.showModal();
  await new Promise((r) => deleteDialog.addEventListener("close", r, { once: true }));
  if (deleteDialog.returnValue !== "delete") return;
  try {
    await api.deleteUser(u.id);
    await load();
  } catch (err) {
    toast(err.message, { error: true });
  }
}

manageBtn.addEventListener("click", () => {
  managing = !managing;
  render();
});

load();
