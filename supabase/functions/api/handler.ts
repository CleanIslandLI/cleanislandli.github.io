import { DEFAULT_SERVICES, DEFAULT_SETTINGS, estimate, zoneForTown, isDateOpen, todayIn, addDays, formatDate, WINDOWS } from "../../../assets/js/pricing-core.js";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------- environment (set these in Supabase > Edge Functions > Secrets) ----------
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SB_URL = env("SUPABASE_URL"), SB_SERVICE = env("SUPABASE_SERVICE_ROLE_KEY"); // provided automatically
const STRIPE_KEY = env("STRIPE_SECRET_KEY");            // sk_live_... or sk_test_...
const STRIPE_WHSEC = env("STRIPE_WEBHOOK_SECRET");       // whsec_...
const SITE_URL = env("SITE_URL", "https://cleanislandli.github.io").replace(/\/$/, "");
const ORIGINS = env("ALLOWED_ORIGINS", `${SITE_URL},https://cleanislandli.com,https://www.cleanislandli.com,http://localhost:8080`).split(",").map((s) => s.trim());
const RESEND_KEY = env("RESEND_API_KEY"), NOTIFY_EMAIL = env("NOTIFY_EMAIL"), FROM_EMAIL = env("FROM_EMAIL", "Clean Island <onboarding@resend.dev>");
const IP_SALT = env("IP_SALT", "ci-salt");

const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

class HttpError extends Error { status: number; code: string; constructor(status: number, msg: string, code = "") { super(msg); this.status = status; this.code = code; } }
const fail = (status: number, msg: string, code = "") => { throw new HttpError(status, msg, code); };

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// ---------- small utilities ----------
const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const longStr = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
const rand = (n: number) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
const token = () => btoa(String.fromCharCode(...rand(24))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const makeRef = () => "CI-" + Array.from(rand(6), (x) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[x % 31]).join("");
async function sha256(s: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join(""); }
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const usd = (n: number) => "$" + Number(n).toFixed(2).replace(/\.00$/, "");

async function rateLimit(ipHash: string, action: string, max: number, minutes = 60) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const { count } = await db.from("rate_events").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("action", action).gte("created_at", since);
  if ((count || 0) >= max) fail(429, "Too many attempts. Please wait a while and try again.", "rate_limited");
  await db.from("rate_events").insert({ ip_hash: ipHash, action });
}

async function catalog() {
  const [{ data: svc }, { data: st }, { data: bo }] = await Promise.all([
    db.from("services").select("id,name,category,kind,unit,unit_label,rate,min_price,quote_only,active,sort").eq("active", true).order("sort"),
    db.from("settings").select("data").eq("id", 1).maybeSingle(),
    db.from("blackout_dates").select("day").gte("day", todayIn()),
  ]);
  const services = (svc && svc.length ? svc : DEFAULT_SERVICES).map((s: any) => ({ ...s, rate: Number(s.rate), min_price: Number(s.min_price) }));
  return { services, settings: { ...DEFAULT_SETTINGS, ...(st?.data || {}) }, blackouts: (bo || []).map((b: any) => b.day) };
}

async function findPromo(code: string) {
  if (!code) return null;
  const { data } = await db.from("discounts").select("*").eq("code", code.toUpperCase()).eq("active", true).maybeSingle();
  if (!data) return null;
  if (data.expires_on && data.expires_on < todayIn()) return null;
  if (data.max_uses != null && data.uses >= data.max_uses) return null;
  return { code: data.code, percent_off: data.percent_off ? Number(data.percent_off) : null, amount_off: data.amount_off ? Number(data.amount_off) : null, description: data.description };
}

async function bookingByToken(id: string, tok: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !tok) fail(404, "Booking not found.", "not_found");
  const { data } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  if (!data || !safeEq(String(data.access_token), String(tok))) fail(404, "Booking not found.", "not_found");
  if (data.status === "pending_payment" && data.hold_expires_at && new Date(data.hold_expires_at) < new Date()) {
    const { data: upd } = await db.from("bookings").update({ status: "expired", history: [...data.history, { at: new Date().toISOString(), event: "hold expired", status: "expired" }] }).eq("id", id).eq("status", "pending_payment").select().maybeSingle();
    return upd || { ...data, status: "expired" };
  }
  return data;
}
const statusLink = (b: any) => `${SITE_URL}/booking/?id=${b.id}&t=${b.access_token}`;
const pushHistory = (b: any, event: string, extra: Record<string, unknown> = {}) => [...(b.history || []), { at: new Date().toISOString(), event, ...extra }];

// ---------- email (optional: only sends when RESEND_API_KEY is set) ----------
async function sendEmail(to: string, subject: string, text: string) {
  if (!RESEND_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text }) });
  } catch (e) { console.error("email failed", e); }
}
const when = (b: any) => b.service_date ? `${formatDate(b.service_date)}, ${WINDOWS[b.time_window as keyof typeof WINDOWS] || ""}` : "Date to be confirmed";

// ---------- Stripe (official REST API, no card data touches this server) ----------
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, body: Record<string, unknown>, idem?: string) {
  if (!STRIPE_KEY) fail(503, "Online payments aren't set up yet. We'll contact you to arrange payment.", "stripe_not_configured");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) }, body: form(body) });
  const data = await res.json();
  if (!res.ok) { console.error("stripe error", data); fail(502, "The payment system had a problem. Please try again in a minute.", "stripe_error"); }
  return data;
}
async function createCheckout(b: any, kind: "deposit" | "balance") {
  const total = Number(b.final_total ?? b.estimate_total ?? 0), paid = Number(b.amount_paid || 0);
  const amount = kind === "deposit" ? Number(b.deposit_amount) : Math.round((total - paid) * 100) / 100;
  if (!(amount > 0)) fail(400, "There's nothing to pay right now.", "nothing_due");
  const { data: pay, error } = await db.from("payments").insert({ booking_id: b.id, kind, amount }).select().single();
  if (error) throw error;
  const expires = Math.floor(Date.now() / 1000) + 31 * 60;
  const session = await stripe("checkout/sessions", {
    mode: "payment", customer_email: b.email, client_reference_id: b.ref, expires_at: expires,
    line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(amount * 100), product_data: { name: kind === "deposit" ? `Booking deposit, ${b.ref}` : `Balance due, ${b.ref}`, description: kind === "deposit" ? `Applied to your bill. ${when(b)}` : "Clean Island Power Washing" } } } },
    metadata: { booking_id: b.id, payment_id: pay.id, kind, ref: b.ref },
    payment_intent_data: { metadata: { booking_id: b.id, payment_id: pay.id, kind, ref: b.ref }, description: `${b.ref} ${kind}` },
    success_url: `${statusLink(b)}&paid=1`, cancel_url: `${statusLink(b)}&cancelled=1`,
  }, `checkout-${pay.id}`);
  await db.from("payments").update({ stripe_session_id: session.id }).eq("id", pay.id);
  return { url: session.url as string, expires };
}
async function refundBooking(b: any, reason: string) {
  const { data: pays } = await db.from("payments").select("*").eq("booking_id", b.id).eq("status", "paid");
  let refunded = 0;
  for (const p of pays || []) {
    if (!p.stripe_payment_intent) continue;
    await stripe("refunds", { payment_intent: p.stripe_payment_intent, metadata: { booking_id: b.id, reason } }, `refund-${p.id}`);
    await db.from("payments").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", p.id);
    refunded += Number(p.amount);
  }
  return refunded;
}
async function verifyStripe(raw: string, header: string) {
  if (!STRIPE_WHSEC) fail(500, "Webhook secret not set.");
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2)).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.length) fail(400, "Bad signature.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(STRIPE_WHSEC), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  if (!sigs.some((s) => safeEq(s, hex))) fail(400, "Bad signature.");
}

// ---------- actions ----------
async function createBooking(req: Request, p: any) {
  if (p.company_website) return { id: crypto.randomUUID(), token: "x", ref: "CI-THANKS", status: "requested" }; // honeypot: pretend success
  if (Number(p.elapsed_ms) < 4000) fail(400, "Please take a moment to review the form, then submit again.", "too_fast");
  const ipHash = await sha256(IP_SALT + ipOf(req));
  await rateLimit(ipHash, "create_booking", 8);

  const kind = p.kind === "quote" ? "quote" : "booking";
  const b = {
    customer_name: str(p.customer_name, 100), email: str(p.email, 160).toLowerCase(), phone: str(p.phone, 20),
    address: str(p.address, 160), town: str(p.town, 60), zip: str(p.zip, 5), property_type: str(p.property_type, 40), stories: str(p.stories, 2),
    water_access: p.water_access !== false, access_notes: longStr(p.access_notes, 800), notes: longStr(p.notes, 2000),
  };
  if (b.customer_name.length < 2) fail(400, "Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email)) fail(400, "Please enter a valid email address.");
  if (b.phone.replace(/\D/g, "").length < 10) fail(400, "Please enter a 10-digit phone number.");
  if (!/^\d{5}$/.test(b.zip)) fail(400, "Please enter a 5-digit ZIP code.");
  if (!b.town) fail(400, "Please enter your town.");

  const { services, settings, blackouts } = await catalog();
  const today = todayIn(settings.timezone);
  let est: any = null, status = "requested", date: string | null = null, win: string | null = null, promoCode = "";
  if (kind === "booking") {
    if (b.address.length < 5) fail(400, "Please enter the street address.");
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, 30).map((i: any) => ({ id: str(i.id, 40), qty: Number(i.qty) || 0 }));
    const promo = await findPromo(str(p.promo, 30));
    promoCode = promo?.code || "";
    est = estimate({ services, settings, items, town: b.town, promo });
    if (!est.lines.length) fail(400, "Please choose at least one service.");
    if (est.issues.length) fail(400, est.issues.join(" "));
    if (p.client_total != null && Math.abs(Number(p.client_total) - est.total) >= 1) fail(409, "Prices were updated. Please review your estimate.", "price_changed");
    date = str(p.service_date, 10);
    win = ["am", "pm", "full", "flex"].includes(p.time_window) ? p.time_window : "flex";
    if (est.units === 2) win = "full"; else if (win === "full") win = "flex";
    if (!isDateOpen(date, settings, blackouts, today)) fail(400, "That date isn't available. Please choose another.", "date_closed");
    status = est.instant_eligible && STRIPE_KEY ? "pending_payment" : "requested";
  }
  const id = crypto.randomUUID();
  const count = Math.max(0, Math.min(5, Math.floor(Number(p.photo_count) || 0)));
  const paths = Array.from({ length: count }, (_, i) => `${id}/${i + 1}-${token().slice(0, 8)}.img`);
  const row = {
    ref: makeRef(), access_token: token(), kind, status, ...b, zone: zoneForTown(b.town),
    items: est?.lines || [], estimate: est, estimate_total: est?.total ?? null, discount_code: promoCode,
    service_date: date, time_window: win, deposit_amount: est?.deposit || 0, photo_paths: paths,
    hold_expires_at: status === "pending_payment" ? new Date(Date.now() + 31 * 60000).toISOString() : null, ip_hash: ipHash,
  };
  const { data: saved, error } = await db.rpc("reserve_booking", { p: row });
  if (error) { if (String(error.message).includes("date_full")) fail(409, "That time was just booked. Please choose another date or window.", "date_full"); throw error; }
  const bk: any = saved;
  // fix id for photo paths (DB generated its own id)
  const finalPaths = paths.map((x) => x.replace(id, bk.id));
  if (finalPaths.length) await db.from("bookings").update({ photo_paths: finalPaths }).eq("id", bk.id);

  const upload_urls = [];
  for (const path of finalPaths) {
    const { data } = await db.storage.from("booking-photos").createSignedUploadUrl(path);
    if (data) upload_urls.push({ path, signedUrl: data.signedUrl });
  }
  let checkout_url: string | undefined;
  if (status === "pending_payment") {
    try { checkout_url = (await createCheckout(bk, "deposit")).url; }
    catch { await db.from("bookings").update({ status: "requested", hold_expires_at: null, history: pushHistory(bk, "checkout failed, moved to request", { status: "requested" }) }).eq("id", bk.id); }
  }
  const summary = kind === "quote" ? b.notes : (est.lines.map((l: any) => `- ${l.name}${l.unit !== "flat" ? ` (${l.qty} ${l.unit_label})` : ""}: ${usd(l.amount)}`).join("\n") + `\nEstimate: ${usd(est.total)}`);
  sendEmail(NOTIFY_EMAIL, `New ${kind === "quote" ? "quote request" : status === "pending_payment" ? "booking (awaiting deposit)" : "booking request"} ${bk.ref}`, `${b.customer_name}\n${b.phone} / ${b.email}\n${b.address}, ${b.town} ${b.zip}\n${when(bk)}\n\n${summary}\n\nOpen the admin panel: ${SITE_URL}/admin/`);
  if (!checkout_url) sendEmail(b.email, `We received your ${kind === "quote" ? "quote request" : "booking request"} (${bk.ref})`, `Hi ${b.customer_name.split(" ")[0]},\n\nThanks for choosing Clean Island Power Washing. We'll review your ${kind === "quote" ? "request" : "booking"} and reply within one business day.\n\nCheck its status anytime: ${statusLink(bk)}\n\nClean Island Power Washing`);
  return { id: bk.id, token: bk.access_token, ref: bk.ref, status: checkout_url ? "pending_payment" : "requested", checkout_url, upload_urls };
}

async function stripeWebhook(req: Request) {
  const raw = await req.text();
  await verifyStripe(raw, req.headers.get("stripe-signature") || "");
  const evt = JSON.parse(raw);
  const s = evt.data?.object || {};
  if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") {
    if (s.payment_status !== "paid") return { received: true };
    const { data: pay } = await db.from("payments").select("*").eq("stripe_session_id", s.id).maybeSingle();
    if (!pay || pay.status === "paid") return { received: true };
    if (Math.round(Number(pay.amount) * 100) !== Number(s.amount_total)) { console.error("amount mismatch", pay.id, s.amount_total); await db.from("payments").update({ status: "failed" }).eq("id", pay.id); return { received: true }; }
    await db.from("payments").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent: s.payment_intent }).eq("id", pay.id);
    const { data: b } = await db.from("bookings").select("*").eq("id", pay.booking_id).single();
    const paid = Number(b.amount_paid) + Number(pay.amount);
    const total = Number(b.final_total ?? b.estimate_total ?? 0);
    let status = b.status;
    if (pay.kind === "deposit" && ["pending_payment", "approved", "expired", "requested"].includes(b.status)) status = "confirmed";
    if (pay.kind === "balance" && paid >= total - 0.005) status = "paid";
    await db.from("bookings").update({ amount_paid: paid, status, hold_expires_at: null, history: pushHistory(b, `${pay.kind} paid ${usd(pay.amount)}`, { status }) }).eq("id", b.id);
    if (pay.kind === "deposit" && b.discount_code) { const { data: d } = await db.from("discounts").select("uses").eq("code", b.discount_code).maybeSingle(); if (d) await db.from("discounts").update({ uses: d.uses + 1 }).eq("code", b.discount_code); }
    if (pay.kind === "deposit") {
      sendEmail(b.email, `You're booked: ${b.ref}`, `Hi ${b.customer_name.split(" ")[0]},\n\nYour deposit of ${usd(pay.amount)} was received and your booking is confirmed.\n\n${when(b)}\n${b.address}, ${b.town}\n\nBefore we arrive: close windows and doors, move cars out of the driveway, and bring pets inside.\n\nBooking details: ${statusLink(b)}\n\nClean Island Power Washing`);
      sendEmail(NOTIFY_EMAIL, `Deposit paid: ${b.ref}`, `${b.customer_name} paid the ${usd(pay.amount)} deposit for ${when(b)}.\n${SITE_URL}/admin/`);
    } else sendEmail(NOTIFY_EMAIL, `Balance paid: ${b.ref}`, `${b.customer_name} paid ${usd(pay.amount)}. Status: ${status}.`);
  } else if (evt.type === "checkout.session.expired" || evt.type === "checkout.session.async_payment_failed") {
    const { data: pay } = await db.from("payments").select("*").eq("stripe_session_id", s.id).maybeSingle();
    if (pay && pay.status === "pending") {
      await db.from("payments").update({ status: evt.type.endsWith("expired") ? "expired" : "failed" }).eq("id", pay.id);
      const { data: b } = await db.from("bookings").select("*").eq("id", pay.booking_id).single();
      if (b.status === "pending_payment" && pay.kind === "deposit" && (!b.hold_expires_at || new Date(b.hold_expires_at) <= new Date(Date.now() + 60000)))
        await db.from("bookings").update({ status: "expired", history: pushHistory(b, "deposit not completed", { status: "expired" }) }).eq("id", b.id);
    }
  }
  return { received: true };
}

async function requireAdmin(req: Request) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!jwt) fail(401, "Please sign in.");
  const { data } = await db.auth.getUser(jwt);
  if (!data?.user) fail(401, "Your session expired. Sign in again.");
  const { data: a } = await db.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!a) fail(403, "This account isn't an admin.");
  return data.user;
}

async function adminAction(req: Request, p: any) {
  const user = await requireAdmin(req);
  const { data: b } = await db.from("bookings").select("*").eq("id", str(p.id, 36)).maybeSingle();
  if (!b) fail(404, "Booking not found.");
  const op = String(p.op);
  const who = user.email || "admin";
  const up = async (fields: Record<string, unknown>, event: string) => { const { data, error } = await db.from("bookings").update({ ...fields, history: pushHistory(b, `${event} by ${who}`, { status: fields.status ?? b.status }) }).eq("id", b.id).select().single(); if (error) throw error; return data; };
  const move = async (d: string | null, w: string | null, st: string | null, note: string) => {
    const { data, error } = await db.rpc("move_booking", { b_id: b.id, d, w, new_status: st, note: `${note} by ${who}` });
    if (error) { if (String(error.message).includes("date_full") && !p.force) fail(409, "That day and window are already full. Tick 'Override capacity' to book it anyway.", "date_full"); if (!String(error.message).includes("date_full")) throw error; return await up({ service_date: d, time_window: w, ...(st ? { status: st } : {}) }, `${note} (capacity overridden)`); }
    return data;
  };
  let out: any;
  if (op === "approve") {
    const fields: Record<string, unknown> = {};
    if (p.estimate_total != null) { const t = Number(p.estimate_total); if (!(t > 0)) fail(400, "Enter a valid price."); fields.estimate_total = t; }
    if (p.deposit_amount != null) fields.deposit_amount = Math.max(0, Number(p.deposit_amount));
    if (Object.keys(fields).length) await db.from("bookings").update(fields).eq("id", b.id);
    const d = p.service_date ?? b.service_date, w = p.time_window ?? b.time_window ?? "flex";
    out = d ? await move(d, w, "approved", "approved") : await up({ status: "approved" }, "approved");
    if (Number(out.deposit_amount) <= 0) out = await up({ status: "confirmed" }, "confirmed without deposit");
    sendEmail(b.email, `Your booking is approved (${b.ref})`, `Hi ${b.customer_name.split(" ")[0]},\n\nGood news: we can do your job${out.service_date ? ` on ${when(out)}` : ""}. Price: ${usd(Number(out.estimate_total || 0))}.\n\n${Number(out.deposit_amount) > 0 ? `Pay the ${usd(Number(out.deposit_amount))} deposit to lock in your date: ${statusLink(out)}` : `You're confirmed. Details: ${statusLink(out)}`}\n\nClean Island Power Washing`);
  } else if (op === "reject") {
    out = await up({ status: "rejected" }, "rejected");
    if (p.notify !== false) sendEmail(b.email, `About your request ${b.ref}`, `Hi ${b.customer_name.split(" ")[0]},\n\nThanks for reaching out. Unfortunately we aren't able to take this job${p.reason ? `: ${str(p.reason, 300)}` : "."} You haven't been charged.\n\nClean Island Power Washing`);
  } else if (op === "reschedule") {
    const d = str(p.service_date, 10), w = ["am", "pm", "full", "flex"].includes(p.time_window) ? p.time_window : "flex";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail(400, "Choose a valid date.");
    out = await move(d, w, null, `rescheduled to ${d} ${w}`);
    if (p.notify !== false) sendEmail(b.email, `New date for ${b.ref}`, `Hi ${b.customer_name.split(" ")[0]},\n\nYour appointment is now ${when(out)}.\n\nDetails: ${statusLink(out)}\n\nClean Island Power Washing`);
  } else if (op === "complete") {
    const total = Number(p.final_total);
    if (!(total > 0)) fail(400, "Enter the final price.");
    const paid = Number(b.amount_paid);
    out = await up({ final_total: total, status: paid >= total ? "paid" : "completed" }, `completed at ${usd(total)}`);
    if (paid < total) sendEmail(b.email, `Your balance for ${b.ref}`, `Hi ${b.customer_name.split(" ")[0]},\n\nThanks for choosing Clean Island. Your job is done.\nFinal price: ${usd(total)}\nPaid so far: ${usd(paid)}\nBalance: ${usd(total - paid)}\n\nPay securely here: ${statusLink(out)}\n\nClean Island Power Washing`);
  } else if (op === "mark_paid_offline") {
    const amt = Number(p.amount); if (!(amt > 0)) fail(400, "Enter the amount received.");
    const paid = Number(b.amount_paid) + amt, total = Number(b.final_total ?? b.estimate_total ?? 0);
    out = await up({ amount_paid: paid, status: b.status === "completed" && paid >= total ? "paid" : b.status }, `recorded ${usd(amt)} paid by ${str(p.method, 30) || "cash/check"}`);
  } else if (op === "cancel") {
    let refunded = 0;
    if (p.refund) refunded = await refundBooking(b, "cancelled by business");
    out = await up({ status: "cancelled", refund_due: false }, `cancelled${refunded ? `, refunded ${usd(refunded)}` : ""}`);
    if (p.notify !== false) sendEmail(b.email, `Booking ${b.ref} cancelled`, `Hi ${b.customer_name.split(" ")[0]},\n\nYour booking has been cancelled.${refunded ? ` A refund of ${usd(refunded)} is on its way to your card (5 to 10 business days).` : ""}\n\nClean Island Power Washing`);
  } else if (op === "refund") {
    const refunded = await refundBooking(b, "refund by business");
    out = await up({ refund_due: false }, `refunded ${usd(refunded)}`);
  } else if (op === "photos") {
    const { data: files } = await db.storage.from("booking-photos").list(b.id);
    const urls = [];
    for (const f of files || []) { const { data } = await db.storage.from("booking-photos").createSignedUrl(`${b.id}/${f.name}`, 600); if (data) urls.push(data.signedUrl); }
    return { urls };
  } else if (op === "link") {
    return { link: statusLink(b) };
  } else fail(400, "Unknown action.");
  return { booking: out, link: statusLink(out) };
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const action = new URL(req.url).searchParams.get("action") || "";
  try {
    if (action === "stripe_webhook") return json(req, await stripeWebhook(req));
    if (req.method !== "POST") fail(405, "Method not allowed.");
    const p = await req.json().catch(() => ({}));
    switch (action) {
      case "catalog": return json(req, await catalog());
      case "quote": {
        const { services, settings } = await catalog();
        const promo = await findPromo(str(p.promo, 30));
        return json(req, { estimate: estimate({ services, settings, items: (p.items || []).slice(0, 30), town: str(p.town, 60), promo }), promo });
      }
      case "availability": {
        const { settings, blackouts } = await catalog();
        const from = str(p.from, 10), to = str(p.to, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail(400, "Bad date range.");
        const { data, error } = await db.rpc("get_availability", { from_day: from, to_day: to });
        if (error) throw error;
        const today = todayIn(settings.timezone);
        const days: Record<string, { am: number; pm: number }> = {};
        for (const r of data || []) if (isDateOpen(r.day, settings, blackouts, today)) days[r.day] = { am: Math.max(0, r.am), pm: Math.max(0, r.pm) };
        return json(req, { days, blackouts });
      }
      case "create_booking": return json(req, await createBooking(req, p));
      case "booking_status": {
        const b = await bookingByToken(str(p.id, 36), str(p.token, 64));
        const hours = b.service_date ? (new Date(b.service_date + "T08:00:00-04:00").getTime() - Date.now()) / 3600000 : null;
        return json(req, { booking: { ref: b.ref, kind: b.kind, status: b.status, service_date: b.service_date, time_window: b.time_window, address_short: [b.address, b.town].filter(Boolean).join(", "), items: (b.items || []).map((l: any) => ({ name: l.name })), estimate_total: b.estimate_total != null ? Number(b.estimate_total) : null, final_total: b.final_total != null ? Number(b.final_total) : null, deposit_amount: Number(b.deposit_amount), amount_paid: Number(b.amount_paid), hours_until: hours } });
      }
      case "find_booking": {
        await rateLimit(await sha256(IP_SALT + ipOf(req)), "find_booking", 10);
        const { data } = await db.from("bookings").select("id,access_token,email").eq("ref", str(p.ref, 12).toUpperCase()).maybeSingle();
        if (!data || data.email !== str(p.email, 160).toLowerCase()) fail(404, "We couldn't find a booking with that number and email.", "not_found");
        return json(req, { id: data.id, token: data.access_token });
      }
      case "pay": {
        const b = await bookingByToken(str(p.id, 36), str(p.token, 64));
        const kind = p.kind === "balance" ? "balance" : "deposit";
        if (kind === "deposit" && !["approved", "pending_payment"].includes(b.status)) fail(400, b.status === "expired" ? "This hold expired. Please book again." : "A deposit isn't due for this booking.", "not_due");
        if (kind === "balance" && b.status !== "completed") fail(400, "The balance isn't due yet.", "not_due");
        const r = await createCheckout(b, kind);
        if (b.status === "pending_payment") await db.from("bookings").update({ hold_expires_at: new Date(r.expires * 1000).toISOString() }).eq("id", b.id);
        return json(req, { checkout_url: r.url });
      }
      case "cancel": {
        const b = await bookingByToken(str(p.id, 36), str(p.token, 64));
        if (!["requested", "approved", "pending_payment", "confirmed"].includes(b.status)) fail(400, "This booking can't be cancelled online.");
        const { settings } = await catalog();
        const hours = b.service_date ? (new Date(b.service_date + "T08:00:00-04:00").getTime() - Date.now()) / 3600000 : Infinity;
        let refunded = 0;
        if (Number(b.amount_paid) > 0 && hours >= settings.cancel_hours) { try { refunded = await refundBooking(b, "customer cancelled in time"); } catch { await db.from("bookings").update({ refund_due: true }).eq("id", b.id); } }
        await db.from("bookings").update({ status: "cancelled", history: pushHistory(b, `cancelled by customer${refunded ? `, refunded ${usd(refunded)}` : ""}`, { status: "cancelled" }) }).eq("id", b.id);
        sendEmail(NOTIFY_EMAIL, `Cancelled by customer: ${b.ref}`, `${b.customer_name} cancelled ${when(b)}.${refunded ? ` Refunded ${usd(refunded)}.` : Number(b.amount_paid) > 0 ? " Deposit kept (late cancellation) or refund needs review." : ""}`);
        return json(req, { ok: true, refunded });
      }
      case "admin_action": return json(req, await adminAction(req, p));
      default: fail(404, "Unknown action.");
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code || e.status }, e.status);
    console.error(e);
    return json(req, { error: "Something went wrong on our end. Please try again." }, 500);
  }
});
