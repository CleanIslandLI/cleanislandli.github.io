import { api, backendReady, loadCatalog } from "./api.js";
import { DEFAULT_SERVICES, DEFAULT_SETTINGS, estimate, zoneForTown, isDateOpen, todayIn, addDays, formatDate, seasonStatus, WINDOWS } from "./pricing-core.js";
import { usd, rateText, esc } from "./format.js";
import { uploadPhotos, pickPhotos } from "./photos.js";

const form = document.getElementById("book-form");
const alertBox = document.getElementById("book-alert");
const CAT_NAMES = { "house-washing": "House washing", "driveway-cleaning": "Driveways", "patio-walkway-cleaning": "Patios, walkways and porches", "deck-fence-cleaning": "Decks and fences", "windows-gutters-doors": "Windows, gutters and doors", "yard-extras": "Yard extras and add-ons" };
const PRESETS = {
  house_wash: [["1,200", 1200], ["2,000", 2000], ["3,000", 3000]], brick_wash: [["1,500", 1500], ["2,500", 2500]],
  driveway: [["1-car", 300], ["2-car", 600], ["3-car", 900]], pavers: [["1-car", 300], ["2-car", 600]],
  patio_walk: [["Small", 200], ["Medium", 400], ["Large", 700]], pool_deck: [["Small", 400], ["Large", 800]],
  deck: [["Small", 200], ["Medium", 350], ["Large", 550]], fence: [["50 ft", 50], ["100 ft", 100], ["200 ft", 200]],
  windows: [["10", 10], ["20", 20]], gutter_face: [["120 ft", 120], ["180 ft", 180]],
};

let services = DEFAULT_SERVICES, settings = DEFAULT_SETTINGS, blackouts = [];
let step = 0, promo = null, availability = {}, viewMonth = null, selectedDate = "";
const selected = new Map();
let photos = [];
const today = () => todayIn(settings.timezone);

const showAlert = (msg, kind = "err", scroll = true) => { alertBox.innerHTML = msg ? `<div class="notice notice--${kind}"><p>${msg}</p></div>` : ""; if (msg && scroll) alertBox.scrollIntoView({ behavior: "smooth", block: "center" }); };

// ---------- step 1: services ----------
function renderServices() {
  const list = document.getElementById("svc-list");
  const groups = {};
  services.filter((s) => s.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach((s) => (groups[s.category] ||= []).push(s));
  list.innerHTML = Object.entries(groups).map(([cat, arr]) => `<h3 class="cat-title">${CAT_NAMES[cat] || cat}</h3>` + arr.map((s) => {
    const on = selected.has(s.id), q = selected.get(s.id) || "";
    const qty = s.unit === "flat" ? "" : `<div class="qty"><label class="sr-only" for="q-${s.id}">${esc(s.name)} ${s.unit_label}</label><input id="q-${s.id}" data-qty="${s.id}" type="number" inputmode="numeric" min="1" max="20000" value="${q}" placeholder="${s.unit_label}"><span class="hint">${s.unit_label}</span>${(PRESETS[s.id] || []).map(([l, v]) => `<button type="button" class="chip" data-preset="${s.id}" data-v="${v}">${l}</button>`).join("")}</div>`;
    return `<div class="svc-row${on ? " is-on" : ""}" data-row="${s.id}"><input type="checkbox" id="c-${s.id}" data-svc="${s.id}"${on ? " checked" : ""} style="width:22px;height:22px;min-height:0;accent-color:var(--bay)"><label for="c-${s.id}">${esc(s.name)}${s.kind === "addon" ? ' <span class="hint">(add-on)</span>' : ""}</label><span class="rate">${rateText(s)}</span>${qty}</div>`;
  }).join("")).join("");
}
document.getElementById("svc-list").addEventListener("change", (e) => {
  const id = e.target.dataset.svc;
  if (id) {
    const row = e.target.closest(".svc-row");
    if (e.target.checked) { selected.set(id, selected.get(id) || (services.find((s) => s.id === id).unit === "flat" ? 1 : "")); row.classList.add("is-on"); row.querySelector("[data-qty]")?.focus(); }
    else { selected.delete(id); row.classList.remove("is-on"); }
    update();
  }
});
document.getElementById("svc-list").addEventListener("input", (e) => { const id = e.target.dataset.qty; if (id) { selected.set(id, e.target.value); e.target.removeAttribute("aria-invalid"); update(); } });
document.getElementById("svc-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-preset]"); if (!b) return;
  const inp = document.getElementById("q-" + b.dataset.preset); inp.value = b.dataset.v; selected.set(b.dataset.preset, b.dataset.v); update();
});

// ---------- estimate summary ----------
const items = () => [...selected].map(([id, qty]) => ({ id, qty: Number(qty) || 0 }));
function current() { return estimate({ services, settings, items: items(), town: form.town.value, promo }); }
function update() {
  const e = current();
  const body = document.getElementById("sum-body");
  if (!e.lines.length) { body.innerHTML = `<p class="empty">Choose a service to see your price.</p>`; return e; }
  const zone = form.town.value ? e.zone : null;
  body.innerHTML = `<ul>${e.lines.map((l) => `<li><span>${esc(l.name)}${l.unit !== "flat" ? `<br><span class="muted">${l.qty.toLocaleString()} ${esc(l.unit_label || "")}${l.minimum_applied ? ", minimum price" : ""}</span>` : ""}</span><span>${usd(l.amount)}</span></li>`).join("")}
    ${e.bundle_discount ? `<li><span>Bundle savings (${e.bundle_pct}%)</span><span>&minus;${usd(e.bundle_discount)}</span></li>` : ""}
    ${e.promo_discount ? `<li><span>Promo ${esc(promo.code)}</span><span>&minus;${usd(e.promo_discount)}</span></li>` : ""}
    ${e.travel_fee ? `<li><span>Travel fee</span><span>${usd(e.travel_fee)}</span></li>` : ""}
    ${e.minimum_applied ? `<li><span>Raised to the ${usd(e.order_minimum)} visit minimum</span><span></span></li>` : ""}</ul>
    <div class="total"><span>Estimated total</span><output>${usd(e.total)}</output></div>
    <p class="muted" style="margin-top:.75rem">${zone === null ? (e.total <= settings.instant_max ? `Most jobs like this can be booked right away with a ${usd(e.deposit)} deposit.` : `Jobs this size get a quick review first. No charge until we confirm.`) : zone === 0 ? "Your town is outside our usual area, so this will be sent as a request for us to review." : e.instant_eligible ? `Book now with a ${usd(e.deposit)} deposit. The rest is due after the job.` : `This job needs a quick review. Send the request now; we confirm within one business day, then you pay the ${usd(e.deposit)} deposit.`}</p>
    ${e.issues.length ? `<p class="muted" style="color:#FFD58A">${esc(e.issues.join(" "))}</p>` : ""}
    <p class="muted">Final price confirmed on site before work starts.</p>`;
  const fullOpt = form.querySelector('input[value="full"]');
  if (e.units === 2) { form.querySelectorAll('input[name="time_window"]').forEach((r) => { r.disabled = r.value !== "full"; }); fullOpt.checked = true; }
  else { form.querySelectorAll('input[name="time_window"]').forEach((r) => { r.disabled = r.value === "full"; }); if (fullOpt.checked) form.querySelector('input[value="flex"]').checked = true; }
  if (step === 2) paintWindows();
  return e;
}

// ---------- step 2: property ----------
form.town.addEventListener("input", () => {
  const z = zoneForTown(form.town.value), h = document.getElementById("zone-hint");
  h.textContent = !form.town.value ? "" : z === 1 ? "No travel fee for this town." : z === 2 ? `${usd(settings.zone2_fee)} travel fee for this town.` : "Outside our listed towns. You can still send a request.";
  update();
});
pickPhotos(document.getElementById("f-photos"), document.getElementById("thumbs"), (files, err) => { photos = files; showAlert(err || ""); });

// ---------- step 3: calendar ----------
const pad = (n) => String(n).padStart(2, "0");
function monthKey(ymd) { return ymd.slice(0, 7); }
async function fetchAvail(month) {
  if (!backendReady() || availability[month]) return;
  try {
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`, to = `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
    const r = await api("availability", { from, to }, { timeout: 10000 });
    availability[month] = r.days || {};
    blackouts = [...new Set([...blackouts, ...(r.blackouts || [])])];
  } catch { availability[month] = null; }
}
const need = () => current().units;
function dayState(ymd) {
  if (!isDateOpen(ymd, settings, blackouts, today())) return "closed";
  const m = availability[monthKey(ymd)];
  if (!m) return "open";
  const d = m[ymd]; if (!d) return "open";
  if (need() === 2) return d.am > 0 && d.pm > 0 ? (d.am + d.pm <= 2 ? "limited" : "open") : "full";
  return d.am + d.pm <= 0 ? "full" : d.am + d.pm <= 1 ? "limited" : "open";
}
async function renderCal() {
  const cal = document.getElementById("calendar");
  const st = seasonStatus(settings, today());
  if (!viewMonth) viewMonth = monthKey(selectedDate || st.next_open || addDays(today(), settings.min_lead_days));
  const note = document.getElementById("season-note");
  if (!st.open && st.next_open) { note.hidden = false; note.innerHTML = `<p>We're closed for the winter. The calendar opens on <strong>${formatDate(st.next_open)}</strong>. Reserve now to get your pick of dates.</p>`; } else note.hidden = true;
  cal.innerHTML = `<p class="hint">Loading open dates&hellip;</p>`;
  await fetchAvail(viewMonth);
  const [y, m] = viewMonth.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const minMonth = monthKey(addDays(today(), settings.min_lead_days)), maxMonth = monthKey(addDays(today(), settings.max_advance_days));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`, next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  let cells = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span class="dow" aria-hidden="true">${d}</span>`).join("");
  cells += "<span></span>".repeat(first.getUTCDay());
  for (let d = 1; d <= days; d++) {
    const ymd = `${viewMonth}-${pad(d)}`, s = dayState(ymd);
    const label = formatDate(ymd) + (s === "closed" ? ", unavailable" : s === "full" ? ", fully booked" : s === "limited" ? ", few spots left" : ", available");
    cells += `<button type="button" data-date="${ymd}" aria-label="${label}" aria-pressed="${ymd === selectedDate}"${s === "closed" || s === "full" ? " disabled" : ""} class="${s === "limited" ? "limited" : ""}">${d}</button>`;
  }
  cal.innerHTML = `<div class="cal-head"><button type="button" data-nav="${prev}" aria-label="Previous month"${prev < minMonth ? " disabled" : ""}>&lsaquo;</button><b>${first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><button type="button" data-nav="${next}" aria-label="Next month"${next > maxMonth ? " disabled" : ""}>&rsaquo;</button></div><div class="cal-grid">${cells}</div>`;
  if (availability[viewMonth] === null) cal.insertAdjacentHTML("beforeend", `<p class="hint" style="margin-top:.5rem">We couldn't load live availability. Pick a date and we'll confirm it.</p>`);
  paintWindows();
}
document.getElementById("calendar").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]"); if (nav && !nav.disabled) { viewMonth = nav.dataset.nav; renderCal(); return; }
  const b = e.target.closest("[data-date]"); if (!b || b.disabled) return;
  selectedDate = b.dataset.date;
  document.querySelectorAll("[data-date]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.date === selectedDate)));
  paintWindows();
});
function paintWindows() {
  const hint = document.getElementById("date-hint");
  const d = selectedDate && availability[monthKey(selectedDate)]?.[selectedDate];
  const big = need() === 2;
  form.querySelectorAll('input[name="time_window"]').forEach((r) => {
    if (big) r.disabled = r.value !== "full";
    else if (r.value === "full") r.disabled = true;
    else r.disabled = !!(d && ((r.value === "am" && d.am <= 0) || (r.value === "pm" && d.pm <= 0)));
  });
  const checked = form.querySelector('input[name="time_window"]:checked');
  if (!checked || checked.disabled) (form.querySelector('input[name="time_window"]:not(:disabled)') || {}).checked = true;
  hint.textContent = selectedDate ? `${formatDate(selectedDate)}. ${big ? "This job takes most of the day, so we start in the morning." : "Choose an arrival window."}` : "Choose an open day. Crossed-out days are closed or fully booked.";
}

// ---------- step 4: promo ----------
document.getElementById("promo-apply").addEventListener("click", async () => {
  const code = form.promo.value.trim().toUpperCase(), hint = document.getElementById("promo-hint");
  if (!code) { promo = null; hint.textContent = ""; update(); return; }
  if (!backendReady()) { hint.textContent = "Promo codes are checked when online booking is connected."; return; }
  hint.textContent = "Checking code…";
  try {
    const r = await api("quote", { items: items(), town: form.town.value, promo: code });
    if (r.promo) { promo = { code, ...r.promo }; hint.textContent = `Code applied: ${r.promo.description || code}.`; }
    else { promo = null; hint.textContent = "That code isn't valid or has expired."; }
  } catch (err) { hint.textContent = err.message; }
  update();
});

// ---------- navigation & validation ----------
function invalid(el, msg) { el.setAttribute("aria-invalid", "true"); el.focus(); showAlert(msg); return false; }
function validate(s) {
  showAlert("");
  if (s === 0) {
    if (!selected.size) return showAlert("Choose at least one service.") || false;
    for (const [id, q] of selected) { const svc = services.find((x) => x.id === id); if (svc.unit !== "flat" && !(Number(q) >= 1)) return invalid(document.getElementById("q-" + id), `Enter a size for ${svc.name}.`); }
    const e = current(); if (e.issues.length) return showAlert(e.issues.join(" ")) || false;
  }
  if (s === 1) {
    if (form.address.value.trim().length < 5) return invalid(form.address, "Enter the street address.");
    if (!form.town.value.trim()) return invalid(form.town, "Enter the town.");
    if (!/^\d{5}$/.test(form.zip.value)) return invalid(form.zip, "Enter a 5-digit ZIP code.");
  }
  if (s === 2 && !selectedDate) return showAlert("Choose a date on the calendar.") || false;
  if (s === 3) {
    if (form.customer_name.value.trim().length < 2) return invalid(form.customer_name, "Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) return invalid(form.email, "Enter a valid email address.");
    if (form.phone.value.replace(/\D/g, "").length < 10) return invalid(form.phone, "Enter a 10-digit phone number.");
    if (!document.getElementById("f-terms").checked) return invalid(document.getElementById("f-terms"), "Please agree to the booking terms.");
  }
  return true;
}
const nextBtn = document.getElementById("next-btn"), prevBtn = document.getElementById("prev-btn");
function go(n) {
  step = n;
  form.querySelectorAll(".step-panel").forEach((p, i) => p.classList.toggle("is-active", i === n));
  form.querySelectorAll(".progress li").forEach((li, i) => { li.classList.toggle("is-current", i === n); li.classList.toggle("is-done", i < n); });
  prevBtn.hidden = n === 0;
  const e = current();
  nextBtn.textContent = n < 3 ? "Continue" : e.instant_eligible ? `Pay ${usd(e.deposit)} deposit and book` : "Send booking request";
  if (n === 2) renderCal();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector(".step-panel.is-active h2")?.setAttribute("tabindex", "-1");
  form.querySelector(".step-panel.is-active h2")?.focus({ preventScroll: true });
}
prevBtn.addEventListener("click", () => go(step - 1));
nextBtn.addEventListener("click", () => { if (!validate(step)) return; step < 3 ? go(step + 1) : submit(); });
form.addEventListener("submit", (e) => e.preventDefault());

const startedAt = Date.now();
async function submit() {
  if (!backendReady()) return showAlert("Online booking isn't connected yet. Please check back soon.", "warn");
  nextBtn.setAttribute("aria-busy", "true"); nextBtn.disabled = true;
  const label = nextBtn.textContent; nextBtn.innerHTML = `<span class="spin" aria-hidden="true"></span> Saving your booking`;
  try {
    const payload = {
      kind: "booking", items: items(), promo: promo?.code || "",
      customer_name: form.customer_name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      address: form.address.value.trim(), town: form.town.value.trim(), zip: form.zip.value.trim(),
      property_type: form.property_type.value, stories: form.stories.value, water_access: form.water_access.checked,
      access_notes: form.access_notes.value.trim(), notes: form.notes.value.trim(),
      service_date: selectedDate, time_window: form.querySelector('input[name="time_window"]:checked')?.value || "flex",
      photo_count: photos.length, company_website: form.company_website.value, elapsed_ms: Date.now() - startedAt,
      client_total: current().total,
    };
    const r = await api("create_booking", payload, { timeout: 25000 });
    if (photos.length && r.upload_urls) { nextBtn.innerHTML = `<span class="spin" aria-hidden="true"></span> Uploading photos`; await uploadPhotos(r.upload_urls, photos).catch(() => {}); }
    if (r.checkout_url) { nextBtn.innerHTML = `<span class="spin" aria-hidden="true"></span> Opening secure checkout`; location.href = r.checkout_url; return; }
    location.href = `/booking/?id=${encodeURIComponent(r.id)}&t=${encodeURIComponent(r.token)}&new=1`;
  } catch (err) {
    if (err.code === "date_full") { availability = {}; showAlert("That time was just taken. Please choose another date or window."); go(2); }
    else if (err.code === "price_changed") { showAlert("Our prices were just updated. Please review your new estimate."); await refreshCatalog(); go(0); }
    else showAlert(esc(err.message));
    nextBtn.removeAttribute("aria-busy"); nextBtn.disabled = false; nextBtn.textContent = label;
  }
}

// ---------- init ----------
async function refreshCatalog() {
  const c = await loadCatalog();
  if (c?.services?.length) services = c.services;
  if (c?.settings) settings = { ...DEFAULT_SETTINGS, ...c.settings };
  if (c?.blackouts) blackouts = c.blackouts;
  renderServices(); update();
}
const params = new URLSearchParams(location.search);
const pre = params.get("service");
if (pre && DEFAULT_SERVICES.some((s) => s.id === pre)) selected.set(pre, params.get("qty") || (DEFAULT_SERVICES.find((s) => s.id === pre).unit === "flat" ? 1 : ""));
renderServices(); update();
refreshCatalog();
if (!backendReady()) showAlert("You can price your job here now. Online booking and payment will be switched on shortly.", "warn", false);
