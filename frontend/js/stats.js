// İstatistik sayfası: seri, son 30 günün tekrarları, yaklaşan tekrarlar, kartlar ve kitaplar.
import { api, percent, timeAgo, toast } from "./api.js";

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

function fmt(n) {
  return n.toLocaleString("tr-TR");
}

function tiles(data) {
  const s = data.summary;
  const items = [
    ["Günlük seri", `${s.streak} gün`, s.streak ? "Her gün en az bir tekrar" : "Bugün bir kart çalışınca başlar"],
    ["Bugün", fmt(s.reviewed_today), `tekrar · ${fmt(s.due)} kart bekliyor`],
    ["Destedeki kelime", fmt(s.learning_total), `${fmt(s.mature)} tanesi kalıcı`],
    ["Bilinen kelime", fmt(data.words.known), "“Biliyorum” dediklerin"],
    ["Doğruluk", data.accuracy_30 == null ? "–" : percent(data.accuracy_30), "son 30 günde"],
    ["Çalışma süresi", `${fmt(data.minutes_30)} dk`, "son 30 günde"],
  ];
  $("tiles").replaceChildren(...items.map(([label, value, sub]) =>
    h("div", { class: "tile" },
      h("span", { class: "tile-label" }, label),
      h("strong", { class: "tile-value" }, value),
      h("span", { class: "tile-sub" }, sub))));
}

function dayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

function history(days, accuracy) {
  const max = Math.max(1, ...days.map((d) => d.reviews));
  const active = days.filter((d) => d.reviews).length;
  const total = days.reduce((a, d) => a + d.reviews, 0);
  $("history-sub").textContent = total
    ? `${fmt(total)} tekrar · ${active} gün çalışıldı · %${Math.round((accuracy || 0) * 100)} doğru`
    : "Henüz tekrar yok";
  const chart = $("history");
  chart.setAttribute("aria-label", `Son 30 günde ${total} tekrar, ${active} gün çalışıldı.`);
  chart.replaceChildren(...days.map((d, i) => {
    const wrong = d.reviews - d.correct;
    const title = `${dayLabel(d.date)}: ${d.reviews} tekrar (${d.correct} doğru)`
      + (d.added ? `, ${d.added} yeni kelime` : "") + (d.minutes ? `, ${d.minutes} dk` : "");
    const day = new Date(`${d.date}T12:00:00`);
    // Etiket kalabalığı olmasın: bugün ve her pazartesi.
    const label = i === days.length - 1 ? "Bugün" : day.getDay() === 1 ? String(day.getDate()) : "";
    return h("div", { class: "col", title },
      h("div", { class: "bar" },
        wrong ? h("div", { class: "seg bad", style: `height:${(wrong / max) * 100}%` }) : null,
        d.correct ? h("div", { class: "seg ok", style: `height:${(d.correct / max) * 100}%` }) : null),
      h("span", { class: "tick" }, label));
  }));
}

function forecast(counts) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  $("forecast-sub").textContent = total
    ? `Bugün ${fmt(counts[0])}, bu hafta ${fmt(counts.slice(0, 7).reduce((a, b) => a + b, 0))} tekrar`
    : "Önümüzdeki iki haftada tekrar yok";
  const chart = $("forecast");
  chart.setAttribute("aria-label", `Önümüzdeki 14 günde ${total} tekrar.`);
  const today = new Date();
  chart.replaceChildren(...counts.map((n, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const label = i === 0 ? "Bugün" : i === 1 ? "Yarın" : DAY_NAMES[day.getDay()];
    // Dar ekranda yalnızca bugün ve pazartesiler yazılır.
    const minor = i !== 0 && (i === 1 || day.getDay() !== 1);
    return h("div", { class: "col", title: `${label}: ${n} tekrar` },
      h("span", { class: "count" }, n ? String(n) : ""),
      h("div", { class: "bar" }, n ? h("div", { class: "seg due", style: `height:${(n / max) * 100}%` }) : null),
      h("span", { class: minor ? "tick minor" : "tick" }, label));
  }));
}

function states(s) {
  const parts = [
    ["new", "Yeni", s.new], ["learning", "Öğreniyor", s.learning],
    ["review", "Tekrar", s.review], ["suspended", "Askıda", s.suspended],
  ];
  const total = parts.reduce((a, p) => a + p[2], 0);
  const stack = $("states");
  stack.setAttribute("aria-label", parts.map(([, l, n]) => `${l} ${n}`).join(", "));
  stack.replaceChildren(...(total ? parts.filter((p) => p[2]).map(([k, , n]) =>
    h("div", { class: `part ${k}`, style: `flex-grow:${n}` })) : [h("div", { class: "part empty" })]));
  $("states-legend").replaceChildren(...parts.map(([k, l, n]) =>
    h("li", {}, h("i", { class: `dot ${k}` }), h("span", {}, l), h("strong", {}, fmt(n)))));
}

function words(w) {
  $("words").replaceChildren(
    h("li", {}, h("i", { class: "dot learning" }), h("span", {}, "Öğreniyorum"), h("strong", {}, fmt(w.learning))),
    h("li", {}, h("i", { class: "dot review" }), h("span", {}, "Biliyorum"), h("strong", {}, fmt(w.known))),
    h("li", {}, h("i", { class: "dot suspended" }), h("span", {}, "Yoksaydıklarım"), h("strong", {}, fmt(w.ignored))));
}

function books(list) {
  $("books").replaceChildren(...(list.length ? list.map((b) =>
    h("li", {},
      h("a", { href: `/reader.html?book=${b.id}` },
        h("div", { class: "book-row" },
          h("span", { class: "book-name" }, b.title),
          h("span", { class: "book-pct" }, b.progress >= 0.995 ? "Bitti" : percent(b.progress))),
        h("div", { class: "progress" }, h("div", { style: `width:${Math.round(b.progress * 100)}%` })),
        h("span", { class: "book-meta" },
          [`Sayfa ${b.last_page} / ${b.page_count}`, b.cards ? `${b.cards} kart` : null,
            b.last_opened_at ? timeAgo(b.last_opened_at) : "Henüz açılmadı"].filter(Boolean).join(" · ")))))
    : [h("li", { class: "empty" }, "Henüz kitap yok.")]));
}

async function load() {
  const main = $("stats");
  try {
    const data = await api.stats();
    tiles(data);
    history(data.days, data.accuracy_30);
    forecast(data.forecast);
    states(data.states);
    words(data.words);
    books(data.books);
  } catch (err) {
    toast(`İstatistikler yüklenemedi: ${err.message}`, { error: true });
  } finally {
    main.setAttribute("aria-busy", "false");
  }
}

load();
