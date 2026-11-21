import { api, backendReady } from "./api.js";
import { formatDate, WINDOWS } from "./pricing-core.js";
import { usd, esc } from "./format.js";

const root = document.getElementById("status-root");
const q = new URLSearchParams(location.search);
let id = q.get("id"), token = q.get("t");

const LABEL = {
  requested: ["Request received", "", "We're reviewing your request and will confirm within one business day. You'll be able to pay the deposit here once it's approved."],
  pending_payment: ["Waiting for deposit", "warn", "Your date is held for 30 minutes while you pay the deposit."],
  approved: ["Approved: deposit needed", "warn", "Good news, we can do this job. Pay the deposit to lock in your date."],
  confirmed: ["Confirmed", "ok", "You're booked. We'll see you on the day. Please close windows, move cars and bring in pets before we arrive."],
  completed: ["Job complete: balance due", "warn", "Thanks for choosing Clean Island. Your remaining balance is ready to pay below."],
  paid: ["Paid in full", "ok", "Thank you. Your job is complete and fully paid."],
  rejected: ["Not available", "err", "We aren't able to take this job. You haven't been charged."],
  cancelled: ["Cancelled", "err", "This booking was cancelled."],
  expired: ["Hold expired", "err", "The deposit wasn't completed in time, so the date was released. You can book again anytime."],
  quoted: ["Quote sent", "", "We've sent you a quote. Reply to it to book."],
};

function lookupForm(msg = "") {
  root.innerHTML = `<div class="status-card"><h2 style="font-size:var(--step-2)">Find your booking</h2><p>Enter your booking number and the email you used.</p>${msg ? `<div class="notice notice--err"><p>${esc(msg)}</p></div>` : ""}
  <form id="lookup" novalidate><div class="grid-2"><div class="field"><label for="l-ref">Booking number</label><input id="l-ref" name="ref" placeholder="CI-ABC123" required maxlength="12" autocapitalize="characters"></div><div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" required maxlength="160"></div></div><button class="btn" type="submit">Find booking</button></form></div>`;
  document.getElementById("lookup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    btn.disabled = true;
    try { const r = await api("find_booking", { ref: f.ref.value.trim().toUpperCase(), email: f.email.value.trim() }); id = r.id; token = r.token; history.replaceState(null, "", `?id=${id}&t=${token}`); load(); }
    catch (err) { lookupForm(err.message); }
  });
}

async function load(poll = 0) {
  if (!backendReady()) { root.innerHTML = `<div class="status-card"><p>Online booking isn't connected yet.</p></div>`; return; }
  if (!id || !token) return lookupForm();
  let b;
  try { b = (await api("booking_status", { id, token })).booking; }
  catch (err) { return lookupForm(err.code === 404 || err.code === "not_found" ? "We couldn't find that booking. Check the link or look it up below." : err.message); }
  if (q.get("paid") && b.status === "pending_payment" && poll < 10) { root.innerHTML = `<div class="status-card"><p><span class="spin" style="display:inline-block;width:1em;height:1em;border:2px solid var(--bay);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px"></span> Confirming your payment&hellip;</p></div>`; return setTimeout(() => load(poll + 1), 2000); }
  const [title, tone, text] = LABEL[b.status] || [b.status, "", ""];
  const total = b.final_total ?? b.estimate_total;
  const balance = Math.max(0, (total || 0) - (b.amount_paid || 0));
  const canPayDeposit = ["approved", "pending_payment"].includes(b.status);
  const canPayBalance = b.status === "completed" && balance > 0;
  const canCancel = ["requested", "approved", "pending_payment", "confirmed"].includes(b.status);
  root.innerHTML = `<div class="status-card">
    ${q.get("new") ? `<div class="notice notice--ok"><p>Your ${b.kind === "quote" ? "quote request" : "booking request"} was sent. Save this page's link to check on it anytime.</p></div>` : ""}
    ${q.get("cancelled") ? `<div class="notice notice--warn"><p>Checkout was cancelled, so you haven't been charged. You can pay below when you're ready.</p></div>` : ""}
    <span class="status-pill ${tone}">${esc(title)}</span>
    <h2 style="font-size:var(--step-3);margin-top:1rem">Booking ${esc(b.ref)}</h2>
    <p>${esc(text)}</p>
    <dl class="kv">
      ${b.service_date ? `<dt>Date</dt><dd>${formatDate(b.service_date)}</dd><dt>Arrival</dt><dd>${esc(WINDOWS[b.time_window] || "To be confirmed")}</dd>` : ""}
      <dt>Address</dt><dd>${esc(b.address_short)}</dd>
      ${(b.items || []).length ? `<dt>Services</dt><dd>${b.items.map((l) => esc(l.name)).join("<br>")}</dd>` : ""}
      ${total ? `<dt>${b.final_total != null ? "Final price" : "Estimate"}</dt><dd>${usd(total)}</dd>` : ""}
      <dt>Paid</dt><dd>${usd(b.amount_paid || 0)}</dd>
      ${total ? `<dt>Balance</dt><dd>${usd(balance)}</dd>` : ""}
    </dl>
    <div class="btn-row">
      ${canPayDeposit ? `<button class="btn" data-pay="deposit">Pay ${usd(b.deposit_amount)} deposit</button>` : ""}
      ${canPayBalance ? `<button class="btn" data-pay="balance">Pay ${usd(balance)} balance</button>` : ""}
      ${canCancel ? `<button class="btn btn--ghost" data-cancel>Cancel booking</button>` : ""}
    </div>
    <div id="act-msg" role="status" style="margin-top:1rem"></div>
  </div>`;
  root.querySelectorAll("[data-pay]").forEach((btn) => btn.addEventListener("click", async () => {
    btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span> Opening checkout`;
    try { const r = await api("pay", { id, token, kind: btn.dataset.pay }); location.href = r.checkout_url; }
    catch (err) { document.getElementById("act-msg").innerHTML = `<div class="notice notice--err"><p>${esc(err.message)}</p></div>`; btn.disabled = false; btn.textContent = "Try again"; }
  }));
  root.querySelector("[data-cancel]")?.addEventListener("click", async (e) => {
    const late = b.service_date && b.hours_until != null && b.hours_until < 48 && b.amount_paid > 0;
    if (!confirm(late ? "Your appointment is less than 48 hours away, so the deposit isn't refundable. Cancel anyway?" : "Cancel this booking?")) return;
    e.target.disabled = true;
    try { await api("cancel", { id, token }); load(); }
    catch (err) { document.getElementById("act-msg").innerHTML = `<div class="notice notice--err"><p>${esc(err.message)}</p></div>`; e.target.disabled = false; }
  });
}
load();
