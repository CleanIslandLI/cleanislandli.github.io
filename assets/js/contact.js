import { api, backendReady } from "./api.js";
import { pickPhotos, uploadPhotos } from "./photos.js";
import { esc } from "./format.js";
const form = document.getElementById("quote-form"), box = document.getElementById("quote-alert");
let photos = [];
const started = Date.now();
pickPhotos(document.getElementById("q-photos"), document.getElementById("q-thumbs"), (f, err) => { photos = f; box.innerHTML = err ? `<div class="notice notice--err"><p>${esc(err)}</p></div>` : ""; });
const say = (msg, kind = "err") => { box.innerHTML = `<div class="notice notice--${kind}"><p>${msg}</p></div>`; box.scrollIntoView({ behavior: "smooth", block: "center" }); };
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  form.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
  const bad = (el, m) => { el.setAttribute("aria-invalid", "true"); el.focus(); say(m); };
  if (form.customer_name.value.trim().length < 2) return bad(form.customer_name, "Enter your full name.");
  if (form.phone.value.replace(/\D/g, "").length < 10) return bad(form.phone, "Enter a 10-digit phone number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) return bad(form.email, "Enter a valid email address.");
  if (!form.town.value.trim()) return bad(form.town, "Enter your town.");
  if (!/^\d{5}$/.test(form.zip.value)) return bad(form.zip, "Enter a 5-digit ZIP code.");
  if (form.notes.value.trim().length < 10) return bad(form.notes, "Tell us a little about what you'd like cleaned.");
  if (!backendReady()) return say("Quote requests aren't connected yet. Please check back soon.", "warn");
  const btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
  btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span> Sending`;
  try {
    const r = await api("create_booking", { kind: "quote", items: [], customer_name: form.customer_name.value.trim(), phone: form.phone.value.trim(), email: form.email.value.trim(), address: form.address.value.trim(), town: form.town.value.trim(), zip: form.zip.value.trim(), notes: form.notes.value.trim(), photo_count: photos.length, company_website: form.company_website.value, elapsed_ms: Date.now() - started });
    if (photos.length && r.upload_urls) await uploadPhotos(r.upload_urls, photos).catch(() => {});
    form.reset(); document.getElementById("q-thumbs").innerHTML = ""; photos = [];
    say(`Thanks. Your quote request <strong>${esc(r.ref)}</strong> is in, and we'll reply within one business day.`, "ok");
  } catch (err) { say(esc(err.message)); }
  btn.disabled = false; btn.textContent = label;
});
