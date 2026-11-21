// Clean Island admin panel. Sign-in uses Supabase Auth; data access is protected by row-level security.
import { BACKEND, API_URL } from "./config.js";
import { DEFAULT_SETTINGS, formatDate, addDays, todayIn, isDateOpen, WINDOWS } from "./pricing-core.js";
import { usd, esc } from "./format.js";

const app = document.getElementById("app");
const KEY_STORE = "ci_admin_anon_key";
let sb, session, settings = DEFAULT_SETTINGS, tab = "bookings";
const $ = (s, r = document) => r.querySelector(s);
const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.role = "status"; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3200); };
const STATUS = { requested: "Needs review", pending_payment: "Awaiting deposit (hold)", approved: "Approved, awaiting deposit", confirmed: "Confirmed", completed: "Done, balance due", paid: "Paid in full", rejected: "Rejected", cancelled: "Cancelled", expired: "Hold expired", quoted: "Quoted" };
const pill = (s) => `<span class="pill ${s}">${STATUS[s] || s}</span>`;

async function fn(body) {
  const res = await fetch(`${API_URL}?action=admin_action`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

// ---------- sign in ----------
function setupScreen(msg = "") {
  if (!BACKEND.projectUrl) { app.innerHTML = `<div class="narrow" style="padding:4rem 0"><h1 style="font-size:var(--step-3)">Admin isn't connected yet</h1><p>Add your Supabase project URL to <code>assets/js/config.js</code> (see the setup guide), then reload this page.</p></div>`; return; }
  const hasKey = !!localStorage.getItem(KEY_STORE);
  app.innerHTML = `<div class="narrow" style="padding:4rem 0;max-width:460px"><img src="/assets/img/logo.svg" alt="Clean Island Power Washing" width="260" height="58" style="margin-bottom:2rem"><div class="card"><h1 style="font-size:var(--step-2)">Admin sign in</h1>${msg ? `<div class="notice notice--err"><p>${esc(msg)}</p></div>` : ""}
  <form id="login">${hasKey ? "" : `<div class="field"><label for="ak">Project anon key</label><input id="ak" required autocomplete="off"><span class="hint">One time only, on this device. Supabase &gt; Project Settings &gt; API &gt; "anon public".</span></div>`}
  <div class="field"><label for="ae">Email</label><input id="ae" type="email" autocomplete="username" required></div>
  <div class="field"><label for="ap">Password</label><input id="ap" type="password" autocomplete="current-password" required></div>
  <button class="btn btn--block" type="submit">Sign in</button></form>${hasKey ? `<p class="muted" style="margin-top:1rem"><a href="#" id="resetkey">Use a different project key</a></p>` : ""}</div></div>`;
  $("#resetkey")?.addEventListener("click", (e) => { e.preventDefault(); localStorage.removeItem(KEY_STORE); setupScreen(); });
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); btn.disabled = true;
    if (!hasKey) localStorage.setItem(KEY_STORE, $("#ak").value.trim());
    sb = createClient(BACKEND.projectUrl, localStorage.getItem(KEY_STORE));
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#ae").value.trim(), password: $("#ap").value });
    if (error) { if (/api key|apikey/i.test(error.message)) localStorage.removeItem(KEY_STORE); return setupScreen(error.message); }
    session = data.session; start();
  });
}
async function init() {
  const key = localStorage.getItem(KEY_STORE);
  if (!BACKEND.projectUrl || !key) return setupScreen();
  sb = createClient(BACKEND.projectUrl, key);
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (!session) return setupScreen();
  sb.auth.onAuthStateChange((_e, s) => { session = s; if (!s) setupScreen(); });
  start();
}

async function start() {
  const { data: adm } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adm) { await sb.auth.signOut(); return setupScreen("This account isn't an admin. Run the last line of schema.sql with your email."); }
  const { data: st } = await sb.from("settings").select("data").eq("id", 1).maybeSingle();
  settings = { ...DEFAULT_SETTINGS, ...(st?.data || {}) };
  const T = [["bookings", "Bookings"], ["calendar", "Calendar"], ["services", "Services & prices"], ["availability", "Season & availability"], ["discounts", "Discounts"], ["payments", "Payments"]];
  app.innerHTML = `<div class="a-top"><div class="wrap"><b>Clean Island admin</b><span class="muted" style="color:#B9CBE2">${esc(session.user.email)}</span><button id="out">Sign out</button></div></div>
  <div class="tabs" role="tablist"><div class="wrap" style="display:flex">${T.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div></div>
  <div class="wrap panel" id="panel"></div><dialog id="dlg"></dialog>`;
  $("#out").onclick = async () => { await sb.auth.signOut(); setupScreen(); };
  document.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b))); render(); });
  render();
}
function render() { ({ bookings, calendar, services, availability, discounts, payments })[tab](); }
const panel = () => $("#panel");

// ---------- bookings ----------
const FILTERS = { action: ["requested", "approved", "pending_payment", "completed"], upcoming: ["confirmed", "approved"], done: ["paid", "completed"], closed: ["rejected", "cancelled", "expired"], all: null };
let filter = "action", search = "", kindF = "";
async function bookings() {
  panel().innerHTML = `<div class="toolbar"><select id="flt"><option value="action">Needs action</option><option value="upcoming">Upcoming</option><option value="done">Done</option><option value="closed">Closed</option><option value="all">All bookings (history)</option></select>
  <select id="kind"><option value="">Bookings and quotes</option><option value="booking">Bookings only</option><option value="quote">Quote requests only</option></select>
  <input id="q" type="search" placeholder="Search name, ref, town, phone" value="${esc(search)}"><button class="btn sm btn--ghost" id="rf">Refresh</button></div><div id="list" class="card" style="padding:0;overflow-x:auto"><p style="padding:1rem">Loading&hellip;</p></div>`;
  $("#flt").value = filter; $("#kind").value = kindF;
  $("#flt").onchange = (e) => { filter = e.target.value; bookings(); };
  $("#kind").onchange = (e) => { kindF = e.target.value; bookings(); };
  $("#q").onchange = (e) => { search = e.target.value.trim(); bookings(); };
  $("#rf").onclick = bookings;
  let q = sb.from("bookings").select("id,ref,kind,status,customer_name,town,phone,service_date,time_window,estimate_total,final_total,amount_paid,created_at,refund_due").order("created_at", { ascending: false }).limit(300);
  if (FILTERS[filter]) q = q.in("status", FILTERS[filter]);
  if (kindF) q = q.eq("kind", kindF);
  if (search) q = q.or(["customer_name", "ref", "town", "phone", "email"].map((c) => `${c}.ilike.%${search.replace(/[%,()]/g, "")}%`).join(","));
  const { data, error } = await q;
  if (error) return ($("#list").innerHTML = `<p style="padding:1rem" class="error-text">${esc(error.message)}</p>`);
  if (!data.length) return ($("#list").innerHTML = `<p style="padding:1rem">Nothing here right now.</p>`);
  $("#list").innerHTML = `<table class="a"><thead><tr><th>Ref</th><th>Status</th><th>Date</th><th>Customer</th><th>Town</th><th>Total</th><th>Paid</th></tr></thead><tbody>${data.map((b) => `<tr class="click" data-id="${b.id}" tabindex="0"><td><b>${b.ref}</b>${b.kind === "quote" ? '<br><span class="muted">Quote</span>' : ""}</td><td>${pill(b.status)}${b.refund_due ? '<br><span class="error-text">Refund due</span>' : ""}</td><td>${b.service_date ? formatDate(b.service_date, { weekday: "short", month: "short", day: "numeric" }) + `<br><span class="muted">${b.time_window}</span>` : "-"}</td><td>${esc(b.customer_name)}<br><span class="muted">${esc(b.phone)}</span></td><td>${esc(b.town || "")}</td><td>${b.final_total ?? b.estimate_total ? usd(b.final_total ?? b.estimate_total) : "-"}</td><td>${usd(b.amount_paid)}</td></tr>`).join("")}</tbody></table>`;
  $("#list").querySelectorAll("[data-id]").forEach((r) => { r.onclick = () => openBooking(r.dataset.id); r.onkeydown = (e) => e.key === "Enter" && openBooking(r.dataset.id); });
}

const winSel = (v) => `<select name="w">${Object.entries(WINDOWS).map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${l}</option>`).join("")}</select>`;
async function openBooking(id) {
  const dlg = $("#dlg");
  const [{ data: b }, { data: pays }] = await Promise.all([sb.from("bookings").select("*").eq("id", id).single(), sb.from("payments").select("*").eq("booking_id", id).order("created_at")]);
  const total = Number(b.final_total ?? b.estimate_total ?? 0), bal = Math.max(0, total - Number(b.amount_paid));
  const e = b.estimate || {};
  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${b.address || ""}, ${b.town || ""}, NY ${b.zip || ""}`)}`;
  dlg.innerHTML = `<div class="dlg-head"><div><b style="font:800 1.2rem var(--display)">${b.ref}</b> ${pill(b.status)}</div><button class="btn sm btn--ghost" id="x">Close</button></div>
  <div class="dlg-body">
    <div class="split" style="gap:1.5rem">
      <div><h4>Customer</h4><p><b>${esc(b.customer_name)}</b><br><a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a> &nbsp; <a href="sms:${esc(b.phone.replace(/[^\d+]/g, ""))}">Text</a><br><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>
      <p><a href="${maps}" target="_blank" rel="noopener">${esc(b.address || "")}, ${esc(b.town || "")} ${esc(b.zip || "")}</a><br><span class="muted">Zone ${b.zone || "outside"} &middot; ${esc(b.property_type || "")}, ${esc(b.stories || "?")} stories &middot; Water: ${b.water_access ? "yes" : "NO"}</span></p>
      ${b.access_notes ? `<p><b>Access:</b> ${esc(b.access_notes)}</p>` : ""}${b.notes ? `<p><b>Notes:</b> ${esc(b.notes)}</p>` : ""}</div>
      <div><h4>Job</h4><p>${b.service_date ? `<b>${formatDate(b.service_date)}</b><br>${WINDOWS[b.time_window] || ""}` : "No date yet"}</p>
      ${(b.items || []).length ? `<table class="a">${b.items.map((l) => `<tr><td>${esc(l.name)}${l.unit !== "flat" ? ` <span class="muted">${l.qty} ${esc(l.unit_label || "")}</span>` : ""}</td><td style="text-align:right">${usd(l.amount)}</td></tr>`).join("")}
      ${e.bundle_discount ? `<tr><td>Bundle ${e.bundle_pct}%</td><td style="text-align:right">-${usd(e.bundle_discount)}</td></tr>` : ""}${e.promo_discount ? `<tr><td>Promo ${esc(b.discount_code || "")}</td><td style="text-align:right">-${usd(e.promo_discount)}</td></tr>` : ""}${e.travel_fee ? `<tr><td>Travel</td><td style="text-align:right">${usd(e.travel_fee)}</td></tr>` : ""}</table>` : ""}
      <p style="margin-top:.75rem">Estimate <b>${b.estimate_total != null ? usd(b.estimate_total) : "-"}</b>${b.final_total != null ? ` &middot; Final <b>${usd(b.final_total)}</b>` : ""}<br>Paid <b>${usd(b.amount_paid)}</b> &middot; Balance <b>${usd(bal)}</b> &middot; Deposit ${usd(b.deposit_amount)}</p></div>
    </div>
    <div id="ph" class="card"><button class="btn sm btn--ghost" id="lp">Show photos (${b.photo_paths?.length || 0})</button></div>
    <div class="acts">
      ${["requested", "expired", "quoted"].includes(b.status) ? `<form class="card" data-op="approve"><h4>Approve</h4><div class="field"><label>Price</label><input name="estimate_total" type="number" step="1" value="${b.estimate_total ?? ""}"></div><div class="field"><label>Deposit</label><input name="deposit_amount" type="number" step="1" value="${b.deposit_amount || settings.deposit}"></div><div class="field"><label>Date</label><input name="d" type="date" value="${b.service_date || ""}"></div><div class="field"><label>Window</label>${winSel(b.time_window || "flex")}</div><label class="check muted"><input type="checkbox" name="force"> Override capacity</label><button class="btn sm btn--block" style="margin-top:.6rem">Approve and notify</button></form>
      <form class="card" data-op="reject"><h4>Reject</h4><div class="field"><label>Reason (optional, sent to customer)</label><input name="reason"></div><button class="btn sm btn--ghost btn--block">Reject</button></form>` : ""}
      ${["approved", "confirmed", "pending_payment"].includes(b.status) ? `<form class="card" data-op="reschedule"><h4>Change date</h4><div class="field"><input name="d" type="date" value="${b.service_date || ""}" required></div><div class="field">${winSel(b.time_window || "flex")}</div><label class="check muted"><input type="checkbox" name="force"> Override capacity</label><button class="btn sm btn--block" style="margin-top:.6rem">Save new date</button></form>` : ""}
      ${["confirmed", "approved", "completed"].includes(b.status) ? `<form class="card" data-op="complete"><h4>Mark job done</h4><div class="field"><label>Final price</label><input name="final_total" type="number" step="1" value="${b.final_total ?? b.estimate_total ?? ""}" required></div><button class="btn sm btn--block">Done, send balance link</button></form>` : ""}
      ${["completed", "confirmed"].includes(b.status) ? `<form class="card" data-op="mark_paid_offline"><h4>Record cash or check</h4><div class="field"><input name="amount" type="number" step="0.01" placeholder="Amount" required></div><div class="field"><input name="method" placeholder="Cash, check, Zelle"></div><button class="btn sm btn--ghost btn--block">Record payment</button></form>` : ""}
      ${["requested", "approved", "confirmed", "pending_payment"].includes(b.status) ? `<form class="card" data-op="cancel"><h4>Cancel booking</h4><label class="check muted"><input type="checkbox" name="refund" ${Number(b.amount_paid) > 0 ? "checked" : "disabled"}> Refund card payments</label><button class="btn sm btn--ghost btn--block" style="margin-top:.6rem">Cancel and notify</button></form>` : ""}
      ${Number(b.amount_paid) > 0 && (pays || []).some((p) => p.status === "paid") ? `<form class="card" data-op="refund"><h4>Refund</h4><p class="muted">Refunds all card payments for this booking.</p><button class="btn sm btn--ghost btn--block">Refund now</button></form>` : ""}
      <div class="card"><h4>Customer link</h4><p class="muted">Their page to pay, check status or cancel.</p><button class="btn sm btn--ghost btn--block" id="cp">Copy link</button></div>
    </div>
    <div class="card" style="margin-top:1rem"><h4>Private notes</h4><textarea id="an">${esc(b.admin_notes || "")}</textarea><button class="btn sm btn--ghost" id="san" style="margin-top:.5rem">Save notes</button></div>
    <div class="card"><h4>Payments</h4>${(pays || []).length ? `<table class="a">${pays.map((p) => `<tr><td>${p.kind}</td><td>${usd(p.amount)}</td><td>${p.status}</td><td class="muted">${new Date(p.created_at).toLocaleString()}</td><td class="muted">${p.stripe_payment_intent ? `<a href="https://dashboard.stripe.com/payments/${p.stripe_payment_intent}" target="_blank" rel="noopener">Stripe</a>` : ""}</td></tr>`).join("")}</table>` : '<p class="muted">No payments yet.</p>'}</div>
    <div class="card"><h4>History</h4>${(b.history || []).slice().reverse().map((h) => `<p class="muted" style="margin:.2rem 0">${new Date(h.at).toLocaleString()}: ${esc(h.event)}</p>`).join("")}</div>
  </div>`;
  if (!dlg.open) dlg.showModal();
  $("#x").onclick = () => dlg.close();
  $("#cp").onclick = async () => { const link = `${location.origin}/booking/?id=${b.id}&t=${b.access_token}`; try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { prompt("Copy this link", link); } };
  $("#san").onclick = async () => { const { error } = await sb.from("bookings").update({ admin_notes: $("#an").value }).eq("id", b.id); toast(error ? error.message : "Notes saved"); };
  $("#lp").onclick = async () => { try { const r = await fn({ op: "photos", id: b.id }); $("#ph").innerHTML = r.urls.length ? `<div class="photos">${r.urls.map((u) => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Customer photo"></a>`).join("")}</div>` : '<p class="muted">No photos were uploaded.</p>'; } catch (err) { toast(err.message); } };
  dlg.querySelectorAll("form[data-op]").forEach((f) => f.onsubmit = async (ev) => {
    ev.preventDefault();
    const op = f.dataset.op, fd = Object.fromEntries(new FormData(f));
    const body = { op, id: b.id, force: !!fd.force };
    if (op === "approve") Object.assign(body, { estimate_total: fd.estimate_total ? Number(fd.estimate_total) : undefined, deposit_amount: fd.deposit_amount !== "" ? Number(fd.deposit_amount) : undefined, service_date: fd.d || null, time_window: fd.w });
    if (op === "reschedule") Object.assign(body, { service_date: fd.d, time_window: fd.w });
    if (op === "complete") body.final_total = Number(fd.final_total);
    if (op === "mark_paid_offline") Object.assign(body, { amount: Number(fd.amount), method: fd.method });
    if (op === "reject") body.reason = fd.reason;
    if (op === "cancel") body.refund = !!fd.refund;
    if (["cancel", "refund", "reject"].includes(op) && !confirm(`${op[0].toUpperCase() + op.slice(1)} ${b.ref}?`)) return;
    const btn = f.querySelector("button"); btn.disabled = true;
    try { await fn(body); toast("Saved"); await openBooking(b.id); if (tab === "bookings") bookings(); }
    catch (err) { toast(err.message); btn.disabled = false; }
  });
}

// ---------- calendar ----------
async function calendar() {
  const today = todayIn(settings.timezone), end = addDays(today, 70);
  const { data } = await sb.from("bookings").select("id,ref,customer_name,town,time_window,status,service_date,estimate_total").gte("service_date", today).lte("service_date", end).in("status", ["pending_payment", "approved", "confirmed", "completed", "paid", "requested"]).order("service_date");
  const by = {}; (data || []).forEach((b) => (by[b.service_date] ||= []).push(b));
  const { data: bo } = await sb.from("blackout_dates").select("day"); const blk = (bo || []).map((x) => x.day);
  let html = "";
  for (let i = 0; i <= 70; i++) {
    const d = addDays(today, i), list = by[d] || [];
    const open = isDateOpen(d, { ...settings, min_lead_days: 0 }, blk, today);
    if (!open && !list.length) continue;
    html += `<div class="day${open ? "" : " closed"}"><div><b>${formatDate(d, { weekday: "short", month: "short", day: "numeric" })}</b><br><span class="muted">${open ? `${list.filter((b) => b.status !== "requested").length} booked` : "Closed"}</span></div><div>${list.map((b) => `<p style="margin:.2rem 0"><a href="#" data-id="${b.id}">${b.ref}</a> ${esc(b.customer_name)}, ${esc(b.town || "")} <span class="muted">${b.time_window} ${b.estimate_total ? usd(b.estimate_total) : ""}</span> ${pill(b.status)}</p>`).join("") || '<span class="muted">Open</span>'}</div></div>`;
  }
  panel().innerHTML = `<div class="card"><h2 style="font-size:var(--step-2)">Next 10 weeks</h2>${html || '<p class="muted">No open days in the next 10 weeks. The season opens ' + formatDate(`2000-${settings.season_start}`, { month: "long", day: "numeric" }) + ".</p>"}</div>`;
  panel().querySelectorAll("[data-id]").forEach((a) => a.onclick = (e) => { e.preventDefault(); openBooking(a.dataset.id); });
}

// ---------- services ----------
async function services() {
  const { data } = await sb.from("services").select("*").order("sort");
  const cats = ["house-washing", "driveway-cleaning", "patio-walkway-cleaning", "deck-fence-cleaning", "windows-gutters-doors", "yard-extras"];
  const row = (s) => `<tr data-id="${esc(s.id)}"><td><input name="name" value="${esc(s.name)}"><span class="muted">${esc(s.id)}</span></td><td><select name="category">${cats.map((c) => `<option${c === s.category ? " selected" : ""}>${c}</option>`).join("")}</select></td><td><select name="kind"><option${s.kind === "main" ? " selected" : ""}>main</option><option${s.kind === "addon" ? " selected" : ""}>addon</option></select></td><td><select name="unit">${["sqft", "lf", "each", "flat"].map((u) => `<option${u === s.unit ? " selected" : ""}>${u}</option>`).join("")}</select><input name="unit_label" value="${esc(s.unit_label)}" style="margin-top:.3rem"></td><td><input name="rate" type="number" step="0.01" min="0" value="${s.rate}"></td><td><input name="min_price" type="number" step="1" min="0" value="${s.min_price}"></td><td><input name="sort" type="number" value="${s.sort}" style="width:70px"></td><td><label class="check"><input type="checkbox" name="active"${s.active ? " checked" : ""}> On</label><label class="check muted"><input type="checkbox" name="quote_only"${s.quote_only ? " checked" : ""}> Quote only</label></td><td><button class="btn sm" data-save>Save</button> <button class="btn sm btn--ghost" data-del>Delete</button></td></tr>`;
  panel().innerHTML = `<div class="card"><h2 style="font-size:var(--step-2)">Services and prices</h2><p class="muted">Changes show on the website and booking form within a few minutes. "Quote only" services always go to you for review. Static page text updates next time the site is rebuilt.</p><div style="overflow-x:auto"><table class="a"><thead><tr><th>Name</th><th>Category</th><th>Type</th><th>Unit</th><th>Rate</th><th>Minimum</th><th>Order</th><th>Status</th><th></th></tr></thead><tbody>${(data || []).map(row).join("")}</tbody></table></div></div>
  <form class="card" id="add"><h3 style="font-size:var(--step-1)">Add a service</h3><div class="grid-2"><div class="field"><label>ID (lowercase, no spaces)</label><input name="id" pattern="[a-z0-9_]{3,40}" required></div><div class="field"><label>Name</label><input name="name" required></div></div><div class="grid-2"><div class="field"><label>Category</label><select name="category">${cats.map((c) => `<option>${c}</option>`).join("")}</select></div><div class="field"><label>Unit</label><select name="unit"><option>sqft</option><option>lf</option><option>each</option><option>flat</option></select></div></div><div class="grid-2"><div class="field"><label>Rate</label><input name="rate" type="number" step="0.01" min="0" required></div><div class="field"><label>Minimum</label><input name="min_price" type="number" value="0" min="0"></div></div><div class="grid-2"><div class="field"><label>Unit label</label><input name="unit_label" placeholder="sq ft, window, bin" required></div><div class="field"><label>Type</label><select name="kind"><option>main</option><option>addon</option></select></div></div><button class="btn">Add service</button></form>`;
  panel().querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.querySelector("[data-save]").onclick = async () => {
      const g = (n) => tr.querySelector(`[name="${n}"]`);
      const up = { name: g("name").value.trim(), category: g("category").value, kind: g("kind").value, unit: g("unit").value, unit_label: g("unit_label").value.trim(), rate: Number(g("rate").value), min_price: Number(g("min_price").value), sort: Number(g("sort").value), active: g("active").checked, quote_only: g("quote_only").checked };
      if (!up.name || !(up.rate >= 0)) return toast("Name and rate are required.");
      const { error } = await sb.from("services").update(up).eq("id", tr.dataset.id); toast(error ? error.message : "Saved");
    };
    tr.querySelector("[data-del]").onclick = async () => { if (!confirm("Delete this service? Turning it off keeps its history.")) return; const { error } = await sb.from("services").delete().eq("id", tr.dataset.id); toast(error ? error.message : "Deleted"); services(); };
  });
  $("#add").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const { error } = await sb.from("services").insert({ ...f, rate: Number(f.rate), min_price: Number(f.min_price), sort: 200 }); toast(error ? error.message : "Service added"); if (!error) services(); };
}

// ---------- availability ----------
async function availability() {
  const { data: bo } = await sb.from("blackout_dates").select("*").order("day");
  const s = settings, days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const num = (k, l, h = "") => `<div class="field"><label for="s-${k}">${l}</label><input id="s-${k}" name="${k}" type="number" step="any" value="${s[k]}">${h ? `<span class="hint">${h}</span>` : ""}</div>`;
  panel().innerHTML = `<form class="card" id="sf"><h2 style="font-size:var(--step-2)">Season and booking rules</h2>
   <div class="grid-2"><div class="field"><label>Season opens (MM-DD)</label><input name="season_start" pattern="\\d{2}-\\d{2}" value="${s.season_start}"></div><div class="field"><label>Season closes (MM-DD)</label><input name="season_end" pattern="\\d{2}-\\d{2}" value="${s.season_end}"></div></div>
   <fieldset class="field"><legend>Working days</legend><div style="display:flex;gap:1rem;flex-wrap:wrap">${days.map((d, i) => `<label class="check"><input type="checkbox" name="wd" value="${i}"${s.working_days.includes(i) ? " checked" : ""}> ${d}</label>`).join("")}</div></fieldset>
   <label class="check" style="margin-bottom:1rem"><input type="checkbox" name="offseason_open"${s.offseason_open ? " checked" : ""}> Allow bookings outside the season (late fall and winter)</label>
   <div class="field"><label>Extra open dates outside the season</label><input name="extra_open_dates" value="${(s.extra_open_dates || []).join(", ")}" placeholder="2026-11-28, 2026-12-05"><span class="hint">Opens just these days, even when the season is closed.</span></div>
   <div class="grid-2">${num("crews", "Crews (jobs per time window)")}${num("min_lead_days", "Days of notice needed")}</div>
   <div class="grid-2">${num("max_advance_days", "How far ahead people can book (days)")}${num("instant_max", "Instant booking up to ($)", "Bigger estimates come to you for review.")}</div>
   <div class="grid-2">${num("full_day_threshold", "Full-day job above ($)")}${num("deposit", "Deposit ($)")}</div>
   <div class="grid-2">${num("order_minimum", "Visit minimum ($)")}${num("zone2_fee", "Travel fee, zone 2 ($)")}</div>
   <div class="grid-2">${num("bundle_2_pct", "Bundle discount, 2 services (%)")}${num("bundle_3_pct", "Bundle discount, 3+ services (%)")}</div>
   ${num("cancel_hours", "Free cancellation up to (hours before)")}
   <button class="btn">Save rules</button></form>
  <div class="card"><h2 style="font-size:var(--step-2)">Blocked dates</h2><p class="muted">Holidays, vacations or days you can't work.</p><form id="bf" class="toolbar"><input type="date" name="day" required><input name="reason" placeholder="Reason (private)"><button class="btn sm">Block date</button></form>
  <table class="a">${(bo || []).map((x) => `<tr><td>${formatDate(x.day)}</td><td class="muted">${esc(x.reason || "")}</td><td><button class="btn sm btn--ghost" data-un="${x.day}">Unblock</button></td></tr>`).join("") || '<tr><td class="muted">No blocked dates.</td></tr>'}</table></div>`;
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, n = (k) => Number(f[k].value);
    const extra = f.extra_open_dates.value.split(/[\s,]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
    const data = { ...settings, season_start: f.season_start.value, season_end: f.season_end.value, working_days: [...f.querySelectorAll('[name="wd"]:checked')].map((x) => +x.value), offseason_open: f.offseason_open.checked, extra_open_dates: extra };
    for (const k of ["crews", "min_lead_days", "max_advance_days", "instant_max", "full_day_threshold", "deposit", "order_minimum", "zone2_fee", "bundle_2_pct", "bundle_3_pct", "cancel_hours"]) data[k] = n(k);
    if (data.offseason_open && !confirm("Allow customers to book late-fall and winter dates?")) return;
    const { error } = await sb.from("settings").update({ data, updated_at: new Date().toISOString() }).eq("id", 1);
    if (!error) settings = data; toast(error ? error.message : "Rules saved");
  };
  $("#bf").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const { error } = await sb.from("blackout_dates").upsert(f); toast(error ? error.message : "Date blocked"); availability(); };
  panel().querySelectorAll("[data-un]").forEach((b) => b.onclick = async () => { await sb.from("blackout_dates").delete().eq("day", b.dataset.un); availability(); });
}

// ---------- discounts ----------
async function discounts() {
  const { data } = await sb.from("discounts").select("*").order("created_at", { ascending: false });
  panel().innerHTML = `<div class="card"><h2 style="font-size:var(--step-2)">Discount codes</h2><table class="a"><thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>${(data || []).map((d) => `<tr><td><b>${esc(d.code)}</b><br><span class="muted">${esc(d.description || "")}</span></td><td>${d.percent_off ? `${Number(d.percent_off)}%` : usd(d.amount_off)}</td><td>${d.uses}${d.max_uses != null ? ` / ${d.max_uses}` : ""}</td><td>${d.expires_on || "Never"}</td><td>${d.active ? "Active" : "Off"}</td><td><button class="btn sm btn--ghost" data-tg="${esc(d.code)}" data-on="${d.active}">${d.active ? "Turn off" : "Turn on"}</button> <button class="btn sm btn--ghost" data-rm="${esc(d.code)}">Delete</button></td></tr>`).join("") || '<tr><td class="muted">No codes yet.</td></tr>'}</tbody></table></div>
  <form class="card" id="df"><h3 style="font-size:var(--step-1)">New code</h3><div class="grid-2"><div class="field"><label>Code</label><input name="code" required pattern="[A-Za-z0-9]{3,30}" placeholder="SPRING10"></div><div class="field"><label>Description (shown to customer)</label><input name="description" placeholder="10% off spring bookings"></div></div>
  <div class="grid-2"><div class="field"><label>Type</label><select name="type"><option value="percent">Percent off</option><option value="amount">Dollars off</option></select></div><div class="field"><label>Amount</label><input name="value" type="number" min="1" step="1" required></div></div>
  <div class="grid-2"><div class="field"><label>Expires (optional)</label><input name="expires_on" type="date"></div><div class="field"><label>Max uses (optional)</label><input name="max_uses" type="number" min="1"></div></div>
  <p class="muted">Codes apply after bundle discounts, and the visit minimum still applies, which protects your margin. Percent codes are capped at 50%.</p><button class="btn">Create code</button></form>`;
  $("#df").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const row = { code: f.code.toUpperCase(), description: f.description || null, expires_on: f.expires_on || null, max_uses: f.max_uses ? Number(f.max_uses) : null, percent_off: f.type === "percent" ? Number(f.value) : null, amount_off: f.type === "amount" ? Number(f.value) : null }; const { error } = await sb.from("discounts").insert(row); toast(error ? error.message : "Code created"); if (!error) discounts(); };
  panel().querySelectorAll("[data-tg]").forEach((b) => b.onclick = async () => { await sb.from("discounts").update({ active: b.dataset.on !== "true" }).eq("code", b.dataset.tg); discounts(); });
  panel().querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (!confirm("Delete this code?")) return; await sb.from("discounts").delete().eq("code", b.dataset.rm); discounts(); });
}

// ---------- payments ----------
async function payments() {
  const { data } = await sb.from("payments").select("*, bookings(ref, customer_name)").order("created_at", { ascending: false }).limit(200);
  const paid = (data || []).filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount), 0);
  panel().innerHTML = `<div class="card"><h2 style="font-size:var(--step-2)">Payments</h2><p>Collected (last 200 records): <b>${usd(paid, true)}</b>. Payouts and fees are in your <a href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener">Stripe dashboard</a>.</p><div style="overflow-x:auto"><table class="a"><thead><tr><th>Date</th><th>Booking</th><th>Type</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>${(data || []).map((p) => `<tr><td>${new Date(p.created_at).toLocaleString()}</td><td>${esc(p.bookings?.ref || "")}<br><span class="muted">${esc(p.bookings?.customer_name || "")}</span></td><td>${p.kind}</td><td>${usd(p.amount, true)}</td><td>${p.status}</td><td class="muted" style="word-break:break-all">${esc(p.stripe_payment_intent || p.stripe_session_id || "")}</td></tr>`).join("") || '<tr><td class="muted">No payments yet.</td></tr>'}</tbody></table></div></div>`;
}

let createClient;
import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
  .then((m) => { createClient = m.createClient; init(); })
  .catch(() => { app.innerHTML = `<div class="narrow" style="padding:4rem 0"><h1 style="font-size:var(--step-3)">Couldn't load the admin tools</h1><p>Check your internet connection and reload the page.</p></div>`; });
