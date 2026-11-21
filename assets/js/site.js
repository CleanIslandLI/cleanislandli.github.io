import { BUSINESS } from "./config.js";
import { loadCatalog } from "./api.js";
import { DEFAULT_SERVICES, DEFAULT_SETTINGS, estimate, seasonStatus, formatDate, todayIn } from "./pricing-core.js";
import { usd, rateText, fromText } from "./format.js";

document.documentElement.classList.add("js");

// Header shadow + mobile menu
const header = document.querySelector(".site-header");
const onScroll = () => header && header.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true }); onScroll();
const menuBtn = document.querySelector(".menu-btn");
const links = document.getElementById("nav-links");
if (menuBtn && links) {
  const set = (open) => { menuBtn.setAttribute("aria-expanded", String(open)); links.classList.toggle("is-open", open); };
  menuBtn.addEventListener("click", () => set(menuBtn.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}

// Contact details: shown only when filled in config.js
document.querySelectorAll("[data-contact]").forEach((el) => {
  const key = el.dataset.contact, val = BUSINESS[key];
  const wrap = el.closest("[data-contact-wrap]");
  if (!val) { if (wrap) wrap.hidden = true; return; }
  if (wrap) wrap.hidden = false;
  el.textContent = val;
  if (el.tagName === "A") el.href = key === "phone" ? "tel:" + val.replace(/[^\d+]/g, "") : key === "email" ? "mailto:" + val : el.href;
});

// Section-head reveals: one quiet pattern
const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" }) : null;
document.querySelectorAll(".reveal").forEach((el) => io ? io.observe(el) : el.classList.add("is-in"));

// Mobile sticky booking bar appears after the hero
const mcta = document.querySelector(".m-cta");
if (mcta) {
  document.body.classList.add("has-mcta");
  const hero = document.querySelector(".hero, .page-head");
  const show = () => mcta.classList.toggle("is-visible", !hero || hero.getBoundingClientRect().bottom < 0);
  addEventListener("scroll", show, { passive: true }); show();
}

// Live data (prices/season) with static fallback
let services = DEFAULT_SERVICES, settings = DEFAULT_SETTINGS;
function applySeason() {
  const r = document.querySelector(".ribbon");
  const st = seasonStatus(settings, todayIn(settings.timezone));
  const startLabel = formatDate(`2000-${settings.season_start}`, { month: "long", day: "numeric" });
  const endLabel = formatDate(`2000-${settings.season_end}`, { month: "long", day: "numeric" });
  document.querySelectorAll("[data-season-range]").forEach((el) => el.textContent = `${startLabel} to ${endLabel}`);
  if (!r) return;
  const msg = r.querySelector("[data-ribbon-text]");
  if (st.open) { r.classList.remove("is-closed"); msg.textContent = st.next_open ? `Now booking. The next open day is ${formatDate(st.next_open, { weekday: "long", month: "short", day: "numeric" })}.` : "Now booking this season."; }
  else { r.classList.add("is-closed"); msg.textContent = st.next_open ? `We're closed for the winter. Reserve your spring date now: openings start ${formatDate(st.next_open, { month: "long", day: "numeric", year: "numeric" })}.` : "We're closed for the season."; }
  const now = new Date().getMonth();
  document.querySelectorAll(".season").forEach((strip) => {
    const a = +settings.season_start.slice(0, 2) - 1, b = +settings.season_end.slice(0, 2) - 1;
    strip.querySelectorAll("span").forEach((sp, i) => { sp.classList.toggle("on", a <= b ? i >= a && i <= b : i >= a || i <= b); sp.classList.toggle("now", i === now); });
  });
}
function applyPrices() {
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));
  document.querySelectorAll("[data-price]").forEach((el) => {
    const s = byId[el.dataset.price];
    if (!s || s.active === false) { const row = el.closest("[data-price-row]"); if (row) row.hidden = true; return; }
    el.textContent = el.dataset.format === "rate" ? rateText(s) : fromText(s);
  });
  document.querySelectorAll("[data-setting]").forEach((el) => { const v = settings[el.dataset.setting]; if (v != null) el.textContent = el.dataset.money ? usd(v) : v; });
}
applySeason(); applyPrices();
loadCatalog().then((c) => {
  if (!c) return;
  if (Array.isArray(c.services) && c.services.length) services = c.services;
  if (c.settings) settings = { ...DEFAULT_SETTINGS, ...c.settings };
  applySeason(); applyPrices(); updateQuick();
  document.dispatchEvent(new CustomEvent("ci:catalog", { detail: { services, settings } }));
});

// Homepage quick estimate
const quick = document.getElementById("quick-estimate");
function updateQuick() {
  if (!quick) return;
  const id = quick.service.value, size = quick.size.value;
  const e = estimate({ services, settings, items: [{ id, qty: size }], town: "Islip" });
  quick.querySelector("output").textContent = e.lines.length ? usd(e.total) : "$0";
  const note = quick.querySelector("[data-quick-note]");
  note.textContent = e.minimum_applied ? `Includes our ${usd(settings.order_minimum)} job minimum. Add a second service to get more for it.` : e.lines[0]?.minimum_applied ? "This service's minimum price applies at this size." : "Estimate for most Suffolk towns near Islip. Final price is confirmed before work starts.";
  const book = quick.querySelector("[data-quick-book]");
  book.href = `/book/?service=${encodeURIComponent(id)}&qty=${encodeURIComponent(size)}`;
}
if (quick) {
  const presets = { house_wash: [["1,200 sq ft ranch", 1200], ["2,000 sq ft colonial", 2000], ["3,000 sq ft home", 3000]], driveway: [["1-car (about 300 sq ft)", 300], ["2-car (about 600 sq ft)", 600], ["Long or 3-car (about 1,000 sq ft)", 1000]], patio_walk: [["Small patio (200 sq ft)", 200], ["Medium patio (400 sq ft)", 400], ["Large patio (700 sq ft)", 700]], deck: [["Small deck (200 sq ft)", 200], ["Medium deck (350 sq ft)", 350], ["Large deck (550 sq ft)", 550]] };
  const fill = () => {
    const p = presets[quick.service.value];
    quick.size.innerHTML = p.map(([l, v], i) => `<option value="${v}"${i === 1 ? " selected" : ""}>${l}</option>`).join("");
    updateQuick();
  };
  quick.service.addEventListener("change", fill);
  quick.size.addEventListener("change", updateQuick);
  quick.addEventListener("submit", (e) => e.preventDefault());
  fill();
}
