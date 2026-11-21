// Static site generator for Clean Island Power Washing. Run: node tools/build.mjs
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BUSINESS } from "../assets/js/config.js";
import { DEFAULT_SERVICES as S, DEFAULT_SETTINGS as ST, ZONE_1, ZONE_2 } from "../assets/js/pricing-core.js";
import { rateText, fromText, usd, esc } from "../assets/js/format.js";
import { CATEGORIES, FAQ, TOWN_NOTES } from "./content.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const svc = Object.fromEntries(S.map((s) => [s.id, s]));
const pages = [];
const V = Date.now().toString(36); // cache-busting version

const ICON = {
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  drop: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z"/><path d="M5 19 13 11"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

const NAV = [["/services/", "Services"], ["/pricing/", "Pricing"], ["/service-areas/", "Service areas"], ["/about/", "About"], ["/faq/", "FAQ"], ["/contact/", "Contact"]];

const businessLD = () => ({
  "@context": "https://schema.org", "@type": "LocalBusiness", "@id": SITE.url + "/#business",
  name: SITE.name, url: SITE.url + "/", logo: SITE.url + "/assets/img/logo.svg", image: SITE.url + "/assets/img/og-image.jpg",
  description: "Residential power washing, house washing, driveway, patio, deck and fence cleaning based in Islip, serving nearby Suffolk County towns on Long Island.",
  priceRange: "$$",
  areaServed: [...ZONE_1, ...ZONE_2].map((t) => ({ "@type": "Place", name: `${t}, NY` })),
  ...(BUSINESS.phone ? { telephone: "+1-" + BUSINESS.phone.replace(/\D/g, "").replace(/^1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") } : {}),
  ...(BUSINESS.email ? { email: BUSINESS.email } : {}),
  hasOfferCatalog: { "@type": "OfferCatalog", name: "Power washing services", itemListElement: CATEGORIES.map((c) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: c.title, url: `${SITE.url}/services/${c.slug}/` } })) },
});

function layout({ path, title, description, body, scripts = ["site.js"], noindex = false, ld = [], current = "", mcta = true, ribbon = true }) {
  const canonical = SITE.url + path;
  const nav = NAV.map(([h, l]) => `<li><a href="${h}"${current === h ? ' aria-current="page"' : ""}>${l}</a></li>`).join("");
  const year = new Date().getFullYear();
  const footServices = CATEGORIES.map((c) => `<li><a href="/services/${c.slug}/">${c.title}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co; connect-src 'self' https://*.supabase.co; base-uri 'self'; form-action 'self'; upgrade-insecure-requests">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#0E2A47">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.url}/assets/img/og-image.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..900&family=Public+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${V}">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${ribbon ? `<div class="ribbon" role="status"><div class="wrap"><span class="dot" aria-hidden="true"></span><span data-ribbon-text>Booking April through October. Reserve your date online.</span> <a href="/book/">Book online</a></div></div>` : ""}
<header class="site-header">
  <nav class="wrap nav" aria-label="Main">
    <a class="brand" href="/" aria-label="${SITE.name}, home"><img src="/assets/img/logo-mark.svg" alt="" width="36" height="40"><span><b>Clean Island</b><small>POWER WASHING</small></span></a>
    <ul class="nav-links" id="nav-links">${nav}</ul>
    <a class="btn nav-cta" href="/book/">Book online</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav-links"><span></span><span class="sr-only">Menu</span></button>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <img src="/assets/img/logo-white.svg" alt="${SITE.name}" width="230" height="51">
        <p style="margin-top:1rem">Residential power washing from Islip, serving nearby Suffolk County towns.</p>
        <p ${cWrap("phone")}>${cLink("phone")}</p>
        <p ${cWrap("email")}>${cLink("email")}</p>
      </div>
      <div><h2>Services</h2><ul>${footServices}</ul></div>
      <div><h2>Company</h2><ul><li><a href="/about/">About</a></li><li><a href="/service-areas/">Service areas</a></li><li><a href="/pricing/">Pricing</a></li><li><a href="/faq/">FAQ</a></li><li><a href="/contact/">Contact</a></li></ul></div>
      <div><h2>Book</h2><ul><li><a href="/book/">Book online</a></li><li><a href="/contact/">Request a quote</a></li><li><a href="/booking/">Check a booking</a></li><li><a href="/terms/">Booking terms</a></li><li><a href="/privacy/">Privacy</a></li></ul></div>
    </div>
    <div class="foot-base"><span>&copy; ${year} ${SITE.name}</span><span>Open <span data-season-range>April 1 to October 31</span></span></div>
  </div>
</footer>
${mcta ? `<div class="m-cta"><a class="btn" href="/book/">Book online</a>${BUSINESS.phone ? `<a class="btn btn--ghost" href="tel:+1${BUSINESS.phone.replace(/\D/g, "")}">Call</a>` : `<a class="btn btn--ghost" href="/pricing/">Prices</a>`}</div>` : ""}
${scripts.map((s) => `<script type="module" src="/assets/js/${s}?v=${V}"></script>`).join("\n")}
</body>
</html>
`;
}

const telHref = (p) => "tel:+1" + p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const cLink = (k) => BUSINESS[k] ? `<a data-contact="${k}" href="${k === "phone" ? telHref(BUSINESS[k]) : "mailto:" + BUSINESS[k]}">${esc(BUSINESS[k])}</a>` : `<a data-contact="${k}" href="#"></a>`;
const cWrap = (k) => BUSINESS[k] ? "data-contact-wrap" : "data-contact-wrap hidden";
const page = (path, opts) => pages.push({ path, html: layout({ path, ...opts }) });
const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${items.map(([h, l]) => h ? ` / <a href="${h}">${l}</a>` : ` / <span aria-current="page">${l}</span>`).join("")}</nav>`;
const crumbLD = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["/", "Home"], ...items].map(([h, l], i) => ({ "@type": "ListItem", position: i + 1, name: l, item: SITE.url + (h || "") })) });
const priceRow = (id, format = "from") => { const s = svc[id]; return `<li data-price-row><span class="name">${esc(s.name)}</span><span class="leader" aria-hidden="true"></span><span class="price" data-price="${id}"${format === "rate" ? ' data-format="rate"' : ""}>${format === "rate" ? rateText(s) : fromText(s)}</span></li>`; };
const ctaBand = (h = "Ready for a cleaner house?", p = "See your price, pick a date and hold it with a $50 deposit that goes toward your bill.") => `<section class="section cta-band"><div class="wrap"><div class="reveal"><h2>${h}</h2><p class="lede" style="color:#B9CBE2">${p}</p></div><div class="btn-row"><a class="btn btn--light" href="/book/">Book online</a><a class="btn btn--ghost" style="--fg:#fff;border-color:rgba(255,255,255,.35)" href="/contact/">Request a quote</a></div></div></section>`;
const faqHTML = (items) => `<div class="faq">${items.map((f) => `<details><summary>${esc(f.q)}</summary><div class="answer"><p>${esc(f.a)}</p></div></details>`).join("")}</div>`;
const faqLD = (items) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const seasonStrip = `<div class="season" aria-hidden="true">${months.map((m, i) => `<span class="${i >= 3 && i <= 9 ? "on" : ""}">${m}</span>`).join("")}</div>`;

// ---------------- HOME ----------------
page("/", {
  title: "Power Washing in Islip & Long Island, NY | Clean Island Power Washing",
  description: "House washing, driveway, patio, deck and fence cleaning for Islip and nearby Suffolk County towns. See prices online and book in minutes.",
  current: "/", ld: [businessLD(), { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url + "/" }],
  body: `
<section class="hero">
  <div class="hero__grime" aria-hidden="true"></div>
  <div class="hero__stripe" aria-hidden="true"></div>
  <div class="wrap hero__inner">
    <div>
      <h1>Long Island homes, washed clean.</h1>
      <p class="lede">House washing, driveways, patios, decks and more for Islip and nearby Suffolk towns. See your price now and book online in a few minutes.</p>
      <div class="btn-row"><a class="btn" href="/book/">Book online</a><a class="btn btn--ghost" style="background:#fff" href="/pricing/">See all prices</a></div>
      <p class="hero__note">A $50 deposit holds your date and comes off your bill.</p>
    </div>
    <form class="estimator" id="quick-estimate" aria-labelledby="qe-title">
      <h2 id="qe-title">Price it now</h2>
      <p>Pick a service and a size to see your estimate.</p>
      <div class="field"><label for="qe-service">Service</label>
        <select id="qe-service" name="service"><option value="house_wash">House wash</option><option value="driveway">Driveway (concrete)</option><option value="patio_walk">Patio or walkway</option><option value="deck">Deck</option></select></div>
      <div class="field"><label for="qe-size">Size</label><select id="qe-size" name="size"></select></div>
      <div class="estimator__total"><span>Estimated price</span><output for="qe-service qe-size" aria-live="polite">$0</output></div>
      <a class="btn btn--block" data-quick-book href="/book/">Book this service</a>
      <small data-quick-note>Estimate for most Suffolk towns near Islip. Final price is confirmed before work starts.</small>
    </form>
  </div>
</section>

<section class="section" id="services">
  <div class="wrap">
    <div class="section-head reveal"><h2>Services and starting prices</h2><p class="lede">Every price is shown up front. Sizes and add-ons are totaled for you when you book.</p></div>
    <div class="menu-board">
      ${CATEGORIES.map((c) => `<div class="menu-group"><h3><a href="/services/${c.slug}/">${c.title}</a></h3><p>${c.short}</p><ul class="price-list">${c.services.map((id) => priceRow(id)).join("")}</ul></div>`).join("")}
    </div>
    <a class="btn btn--ghost" href="/services/">Compare every service</a>
  </div>
</section>

<section class="section section--fog">
  <div class="wrap">
    <div class="section-head reveal"><h2>Why people book with us</h2></div>
    <div class="promises">
      <div class="promise">${icon("tag")}<h3>Prices you can see</h3><p>Rates for every service are published, and your estimate adds up while you book. No "call for pricing."</p></div>
      <div class="promise">${icon("drop")}<h3>Low pressure where it matters</h3><p>Siding, paint, wood and stucco get a detergent wash at low pressure. High pressure stays on concrete.</p></div>
      <div class="promise">${icon("leaf")}<h3>Plants protected</h3><p>We wet your shrubs and beds before we start and rinse them again when we finish.</p></div>
      <div class="promise">${icon("cal")}<h3>Booked in minutes</h3><p>Pick a real open date online. Most jobs are confirmed right away, and you'll know when we arrive.</p></div>
      <div class="promise">${icon("cam")}<h3>Before and after photos</h3><p>We photograph the work so you can see the difference, even if you weren't home.</p></div>
      <div class="promise">${icon("pin")}<h3>Based in Islip</h3><p>A local crew working close to home, so most nearby towns pay no travel fee.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head reveal"><h2>How it works</h2></div>
    <ol class="steps">
      <li><h3>Price it online</h3><p>Choose services and enter rough sizes. Your estimate updates as you go.</p></li>
      <li><h3>Pick your date</h3><p>Choose an open day and a morning or afternoon window.</p></li>
      <li><h3>Hold it with $50</h3><p>Pay a $50 deposit by card. It's taken off your final bill.</p></li>
      <li><h3>We wash, you pay the rest</h3><p>We confirm the price on site, do the work, and send a secure link for the balance.</p></li>
    </ol>
  </div>
</section>

<section class="section section--fog">
  <div class="wrap">
    <div class="section-head reveal"><h2>Pricing basics</h2><p class="lede">Simple rules, so there are no surprises on the day.</p></div>
    <div class="figure-row">
      <div class="figure"><b data-setting="order_minimum" data-money="1">${usd(ST.order_minimum)}</b><span>Minimum for any visit</span></div>
      <div class="figure"><b data-setting="deposit" data-money="1">${usd(ST.deposit)}</b><span>Deposit to book, taken off your bill</span></div>
      <div class="figure"><b>$0</b><span>Travel fee within about 15 miles of Islip</span></div>
      <div class="figure"><b>${ST.bundle_3_pct}%</b><span>Off when you book three or more services</span></div>
    </div>
    <p style="margin-top:1.5rem"><a href="/pricing/">See the full price list</a></p>
  </div>
</section>

<section class="section section--navy">
  <div class="wrap split">
    <div class="reveal">
      <h2>Open spring through fall</h2>
      <p>We wash from <span data-season-range>April 1 to October 31</span>, Monday through Saturday. Outdoor washing needs temperatures well above freezing, so winter dates are closed.</p>
      <p>Booking is open all year. Reserve a spring date now and you'll get first pick of the calendar.</p>
      <a class="btn btn--light" href="/book/">Reserve a date</a>
    </div>
    <div>${seasonStrip}<div class="season-legend"><span><i></i>Booking open</span><span><i class="off"></i>Closed for winter</span></div></div>
  </div>
</section>

<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <h2>Serving Islip and nearby Suffolk towns</h2>
      <p>We're based in Islip and work in towns within about 25 miles. There's no travel fee within about 15 miles, and a $25 fee for towns a little farther out.</p>
      <a class="btn btn--ghost" href="/service-areas/">See every town we serve</a>
    </div>
    <ul class="towns">${ZONE_1.slice(0, 24).map((t) => `<li>${t}</li>`).join("")}</ul>
  </div>
</section>

<section class="section section--fog">
  <div class="narrow">
    <div class="section-head reveal"><h2>Common questions</h2></div>
    ${faqHTML(FAQ.filter((_, i) => [0, 1, 5, 7, 10, 13].includes(i)))}
    <p style="margin-top:1.5rem"><a href="/faq/">Read all questions</a></p>
  </div>
</section>
${ctaBand()}`,
});

// ---------------- SERVICES ----------------
page("/services/", {
  title: "Power Washing Services in Islip, Long Island | Clean Island",
  description: "House washing, driveways, patios, pool decks, decks, fences, windows, gutters, sheds and bins. Residential exterior cleaning around Islip, NY.",
  current: "/services/", ld: [crumbLD([["/services/", "Services"]])],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Services"]])}<h1>Our services</h1><p class="lede">Residential exterior cleaning, done at the right pressure for each surface. Choose a service for what's included, what to expect and its limits.</p></div></section>
<section class="section"><div class="wrap"><div class="menu-board">${CATEGORIES.map((c) => `<div class="menu-group"><h3><a href="/services/${c.slug}/">${c.title}</a></h3><p>${c.short}</p><ul class="price-list">${c.services.map((id) => priceRow(id, "rate")).join("")}</ul><p style="margin-top:1rem"><a href="/services/${c.slug}/">${c.title} details</a></p></div>`).join("")}</div>
<div class="notice"><p><strong>What we don't do:</strong> roof cleaning, gutter clean-outs, asphalt driveways, sealing or staining, and any work that needs a tall ladder or roof access.</p></div></div></section>
${ctaBand()}`,
});

for (const c of CATEGORIES) {
  const path = `/services/${c.slug}/`;
  page(path, {
    title: `${c.seoTitle} | Clean Island`, description: c.meta, current: "/services/",
    ld: [crumbLD([["/services/", "Services"], [path, c.title]]), { "@context": "https://schema.org", "@type": "Service", name: c.title, serviceType: c.title, description: c.short, provider: { "@id": SITE.url + "/#business" }, areaServed: [...ZONE_1, ...ZONE_2].map((t) => `${t}, NY`), url: SITE.url + path }],
    body: `<section class="page-head"><div class="wrap">${crumbs([["/services/", "Services"], [null, c.title]])}<h1>${c.title}</h1><p class="lede">${c.short}</p></div></section>
<section class="section"><div class="wrap detail">
  <div class="prose">
    ${c.intro.map((p) => `<p>${p}</p>`).join("")}
    <h2>What's included</h2><ul class="ticks">${c.includes.map((x) => `<li>${x}</li>`).join("")}</ul>
    <h2>Surfaces we clean</h2><ul class="ticks">${c.surfaces.map((x) => `<li>${x}</li>`).join("")}</ul>
    <h2>What to expect</h2><p>${c.results}</p>
    <h2>Limits</h2><ul class="ticks ticks--limits">${c.limits.map((x) => `<li>${x}</li>`).join("")}</ul>
  </div>
  <aside aria-label="Pricing for ${c.title}">
    <h2 style="font-size:var(--step-2)">Pricing</h2>
    <ul class="price-list">${c.services.map((id) => priceRow(id, "rate")).join("")}</ul>
    <p class="hint" style="color:var(--slate);font-size:.9rem;margin-top:1rem">${c.sizeTip}</p>
    <p style="color:var(--slate);font-size:.9rem">${usd(ST.order_minimum)} minimum per visit. Bundle 2 services for ${ST.bundle_2_pct}% off, 3 or more for ${ST.bundle_3_pct}% off.</p>
    <a class="btn btn--block" href="/book/?service=${c.services[0]}">Book ${c.title.toLowerCase()}</a>
    <a class="btn btn--ghost btn--block" style="margin-top:.6rem" href="/contact/">Ask for a custom quote</a>
  </aside>
</div></section>
<section class="section section--fog"><div class="wrap"><h2 style="font-size:var(--step-3)">Often booked together</h2><ul class="price-list" style="max-width:640px">${CATEGORIES.filter((x) => x.slug !== c.slug).slice(0, 4).map((x) => `<li><a class="name" href="/services/${x.slug}/">${x.title}</a><span class="leader" aria-hidden="true"></span><span class="price" data-price="${x.services[0]}">${fromText(svc[x.services[0]])}</span></li>`).join("")}</ul></div></section>
${ctaBand()}`,
  });
}

// ---------------- PRICING ----------------
const table = (title, ids) => `<div class="table-scroll"><table class="ptable"><caption>${title}</caption><thead><tr><th scope="col">Service</th><th scope="col">Price</th></tr></thead><tbody>${ids.map((id) => `<tr data-price-row><th scope="row" style="font-weight:600">${esc(svc[id].name)}</th><td data-price="${id}" data-format="rate">${rateText(svc[id])}</td></tr>`).join("")}</tbody></table></div>`;
page("/pricing/", {
  title: "Power Washing Prices on Long Island | Clean Island Power Washing",
  description: "Transparent power washing prices for Islip and Suffolk County: house washing per square foot, driveway and patio rates, add-ons, bundles and travel fees.",
  current: "/pricing/", ld: [crumbLD([["/pricing/", "Pricing"]])],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Pricing"]])}<h1>Pricing</h1><p class="lede">Our real rates, published. Enter your sizes when you book and the total adds up for you. These are estimates until we confirm the price on site, before any work starts.</p></div></section>
<section class="section"><div class="wrap">
  <div class="figure-row" style="margin-bottom:3rem">
    <div class="figure"><b data-setting="order_minimum" data-money="1">${usd(ST.order_minimum)}</b><span>Minimum per visit</span></div>
    <div class="figure"><b data-setting="deposit" data-money="1">${usd(ST.deposit)}</b><span>Deposit, taken off your bill</span></div>
    <div class="figure"><b>${ST.bundle_2_pct}% / ${ST.bundle_3_pct}%</b><span>Off 2 or 3+ main services</span></div>
    <div class="figure"><b>${usd(ST.zone2_fee)}</b><span>Travel fee, about 15 to 25 miles out</span></div>
  </div>
  <div class="split">
    <div>
      ${table("House washing", ["house_wash", "brick_wash"])}
      ${table("Driveways and flat surfaces", ["driveway", "pavers", "patio_walk", "pool_deck", "porch_steps"])}
      ${table("Decks and fences", ["deck", "fence"])}
    </div>
    <div>
      ${table("Windows, gutters and doors", ["windows", "gutter_face", "garage_door"])}
      ${table("Yard extras", ["shed", "play_set", "furniture"])}
      ${table("Add-ons (with any service)", ["trash_bins", "mailbox", "oil_stain"])}
    </div>
  </div>
  <div class="narrow prose" style="margin-inline:0">
    <h2>Example jobs</h2>
    <p>For a town with no travel fee, before any bundle discount:</p>
    <ul>
      <li>House wash, 2,000 sq ft vinyl colonial: ${usd(2000 * svc.house_wash.rate)}</li>
      <li>2-car concrete driveway, about 600 sq ft: ${usd(600 * svc.driveway.rate)}, so the ${usd(ST.order_minimum)} visit minimum applies on its own</li>
      <li>House wash (2,000 sq ft) plus that driveway: ${usd(Math.round((2000 * svc.house_wash.rate + 600 * svc.driveway.rate) * (1 - ST.bundle_2_pct / 100)))} with the ${ST.bundle_2_pct}% bundle discount</li>
    </ul>
    <h2>How estimates become final prices</h2>
    <p>Your online total is an estimate based on the sizes you enter. When we arrive we check the sizes and the condition and confirm the price with you before we start. If it would be higher than your estimate, you can decline and your deposit is refunded.</p>
    <p>Very large homes, heavy staining, unusual surfaces or properties outside our usual area go through a <a href="/contact/">quote request</a> instead.</p>
    <h2>Travel</h2>
    <p>No travel fee for towns within about 15 miles of Islip. A ${usd(ST.zone2_fee)} fee applies to towns about 15 to 25 miles away. <a href="/service-areas/">See which towns are in each zone.</a></p>
  </div>
</div></section>
${ctaBand("See your exact estimate", "Enter your sizes and the booking form adds everything up, bundle savings included.")}`,
});

// ---------------- BOOK ----------------
page("/book/", {
  title: "Book Power Washing Online | Clean Island Power Washing",
  description: "Book house washing, driveway, patio and deck cleaning online in Islip and nearby Suffolk County towns. See your estimate and pick a date.",
  current: "/book/", scripts: ["site.js", "book.js"], mcta: false,
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Book online"]])}<h1>Book online</h1><p class="lede">Choose your services, pick a date and hold it with a $50 deposit. It takes about three minutes.</p></div></section>
<section class="section"><div class="wrap book-layout">
  <form id="book-form" novalidate>
    <div id="book-alert" role="alert" aria-live="assertive"></div>
    <ol class="progress" aria-label="Booking steps"><li class="is-current"><span>Services</span></li><li><span>Property</span></li><li><span>Date</span></li><li><span>Details</span></li></ol>

    <fieldset class="step-panel is-active" data-step="0">
      <legend><h2 style="font-size:var(--step-3)">What should we clean?</h2></legend>
      <p class="hint" style="color:var(--slate)">Pick everything you'd like done in one visit. Enter rough sizes; we confirm them on site.</p>
      <div id="svc-list" class="svc-pick"></div>
    </fieldset>

    <fieldset class="step-panel" data-step="1">
      <legend><h2 style="font-size:var(--step-3)">About the property</h2></legend>
      <div class="field"><label for="f-address">Street address</label><input id="f-address" name="address" autocomplete="street-address" required maxlength="160"></div>
      <div class="grid-2">
        <div class="field"><label for="f-town">Town</label><input id="f-town" name="town" list="town-list" autocomplete="address-level2" required maxlength="60"><datalist id="town-list">${[...ZONE_1, ...ZONE_2].sort().map((t) => `<option value="${t}">`).join("")}</datalist><span class="hint" id="zone-hint"></span></div>
        <div class="field"><label for="f-zip">ZIP code</label><input id="f-zip" name="zip" inputmode="numeric" pattern="\\d{5}" maxlength="5" autocomplete="postal-code" required></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="f-ptype">Property type</label><select id="f-ptype" name="property_type"><option>Single-family house</option><option>Townhouse</option><option>Two-family house</option><option>Other</option></select></div>
        <div class="field"><label for="f-stories">Stories</label><select id="f-stories" name="stories"><option value="1">1 story</option><option value="2" selected>2 stories</option><option value="3">3 stories</option></select></div>
      </div>
      <div class="field"><label class="check"><input type="checkbox" name="water_access" id="f-water" checked> There's a working outdoor water spigot we can use</label></div>
      <div class="field"><label for="f-access">Access notes <span class="hint">(optional)</span></label><textarea id="f-access" name="access_notes" maxlength="800" placeholder="Gate codes, dogs, where the spigot is, parking"></textarea></div>
      <div class="field"><span style="font-weight:650">Photos of the areas to clean <span class="hint">(optional, up to 5)</span></span>
        <div class="dropzone"><label class="btn btn--ghost" for="f-photos" style="background:#fff">Add photos</label><input id="f-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple class="sr-only"><p class="hint" style="margin:.6rem auto 0">Photos help us confirm your price faster. JPG, PNG or HEIC, up to 10 MB each.</p><div class="thumbs" id="thumbs"></div></div>
      </div>
    </fieldset>

    <fieldset class="step-panel" data-step="2">
      <legend><h2 style="font-size:var(--step-3)">Choose a date</h2></legend>
      <div id="season-note" class="notice" hidden></div>
      <div class="cal" id="calendar" aria-label="Choose a service date"></div>
      <div class="windows" role="radiogroup" aria-label="Arrival window" id="windows">
        <label><input type="radio" name="time_window" value="am"> Morning, 8 to 12</label>
        <label><input type="radio" name="time_window" value="pm"> Afternoon, 12 to 4</label>
        <label><input type="radio" name="time_window" value="flex" checked> Any time that day</label>
        <label><input type="radio" name="time_window" value="full" disabled> Full day (large jobs)</label>
      </div>
      <p class="hint" id="date-hint" style="color:var(--slate);margin-top:.75rem"></p>
    </fieldset>

    <fieldset class="step-panel" data-step="3">
      <legend><h2 style="font-size:var(--step-3)">Your details</h2></legend>
      <div class="field"><label for="f-name">Full name</label><input id="f-name" name="customer_name" autocomplete="name" required maxlength="100"></div>
      <div class="grid-2">
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required maxlength="160"></div>
        <div class="field"><label for="f-phone">Mobile phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" required maxlength="20"></div>
      </div>
      <div class="field"><label for="f-notes">Anything else we should know? <span class="hint">(optional)</span></label><textarea id="f-notes" name="notes" maxlength="1500"></textarea></div>
      <div class="grid-2"><div class="field"><label for="f-promo">Promo code <span class="hint">(optional)</span></label><div style="display:flex;gap:.5rem"><input id="f-promo" name="promo" maxlength="30" autocapitalize="characters"><button class="btn btn--ghost" type="button" id="promo-apply">Apply</button></div><span class="hint" id="promo-hint" aria-live="polite"></span></div></div>
      <div class="hp" aria-hidden="true"><label for="f-company">Company website</label><input id="f-company" name="company_website" tabindex="-1" autocomplete="off"></div>
      <div class="field"><label class="check"><input type="checkbox" id="f-terms" required> I agree to the <a href="/terms/" target="_blank" rel="noopener">booking terms</a>, including the 48-hour cancellation policy.</label></div>
    </fieldset>

    <div class="form-nav"><button class="btn btn--ghost" type="button" id="prev-btn" hidden>Back</button><span></span><button class="btn" type="button" id="next-btn">Continue</button></div>
  </form>

  <aside class="summary" aria-live="polite">
    <h2>Your estimate</h2>
    <div id="sum-body"><p class="empty">Choose a service to see your price.</p></div>
  </aside>
</div></section>`,
});

// ---------------- BOOKING STATUS ----------------
page("/booking/", {
  title: "Your Booking | Clean Island Power Washing", description: "Check the status of your Clean Island booking, pay a deposit or balance, or cancel.",
  noindex: true, scripts: ["site.js", "booking-status.js"], mcta: false,
  body: `<section class="page-head"><div class="wrap"><h1>Your booking</h1></div></section>
<section class="section"><div class="narrow" id="status-root"><div class="status-card"><p>Loading your booking&hellip;</p></div></div></section>`,
});

// ---------------- ABOUT ----------------
page("/about/", {
  title: "About Clean Island Power Washing | Islip, Long Island",
  description: "Clean Island Power Washing is a locally owned residential exterior cleaning company based in Islip, serving nearby Suffolk County towns.",
  current: "/about/", ld: [crumbLD([["/about/", "About"]]), businessLD()],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "About"]])}<h1>About Clean Island</h1><p class="lede">A new, locally owned power-washing company based in Islip.</p></div></section>
<section class="section"><div class="wrap split">
  <div class="prose">
    <p>Clean Island Power Washing is run by two partners and a small crew from Islip. We started it to give Long Island homeowners a simple way to get their homes cleaned: clear prices you can see before you book, a real calendar, and careful work.</p>
    <p>We're a new business, and we'd rather tell you that than invent a history. What we can promise is how we work.</p>
    <h2>How we work</h2>
    <ul class="ticks">
      <li>The right pressure for each surface. Detergent and low pressure on siding, wood and paint, and higher pressure only on concrete.</li>
      <li>Prices published online and confirmed with you on site, before any work begins.</li>
      <li>Plants and landscaping wet down before we start and rinsed after.</li>
      <li>Before and after photos of every job.</li>
      <li>We point out loose paint, damaged boards or anything else we notice before we start.</li>
    </ul>
    <h2>What we don't do</h2>
    <p>We don't clean roofs, work at heights that need tall ladders, or offer restoration work like sealing and staining. If a job isn't something we can do well, we'll say so.</p>
  </div>
  <figure style="margin:0">
    <div class="photo"><img src="https://images.unsplash.com/photo-1677956787377-a0f32c0974af?auto=format&fit=crop&w=1100&q=70" alt="A worker in a yellow jacket using a pressure washer" loading="lazy" width="1100" height="825"></div>
    <figcaption style="font-size:.82rem;color:var(--slate);margin-top:.5rem">Stock photo from <a href="https://unsplash.com/photos/a-man-in-a-yellow-jacket-is-using-a-pressure-washer-e2k842P9a2I">Unsplash</a>. Our own job photos are coming soon.</figcaption>
  </figure>
</div></section>
${ctaBand()}`,
});

// ---------------- SERVICE AREAS ----------------
page("/service-areas/", {
  title: "Power Washing Service Areas: Islip, Bay Shore, Smithtown & Suffolk County",
  description: "Clean Island serves Islip, Bay Shore, Sayville, Ronkonkoma, Smithtown, Patchogue, Babylon and nearby Suffolk County towns. See travel fees by town.",
  current: "/service-areas/", ld: [crumbLD([["/service-areas/", "Service areas"]])],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Service areas"]])}<h1>Where we work</h1><p class="lede">We're based in Islip and serve Suffolk County towns within about 25 miles. Most nearby towns have no travel fee.</p></div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2 style="font-size:var(--step-3)">No travel fee <span class="zone-tag">About 15 miles or less</span></h2></div>
  ${Object.entries(TOWN_NOTES).map(([area, towns]) => `<h3 style="margin-top:2rem">${area}</h3><ul class="towns">${towns.map((t) => `<li>${t}</li>`).join("")}</ul>`).join("")}
  <div class="section-head" style="margin-top:4rem"><h2 style="font-size:var(--step-3)">${usd(ST.zone2_fee)} travel fee <span class="zone-tag">About 15 to 25 miles</span></h2></div>
  <ul class="towns">${ZONE_2.map((t) => `<li>${t}</li>`).join("")}</ul>
  <div class="prose" style="margin-top:3rem">
    <h2>Homes in our area</h2>
    <p>On the South Shore, from Babylon to Patchogue, salt air and bayside humidity grow mildew fast on north-facing siding and shaded patios. Many homes from West Islip to Sayville benefit from a yearly house wash in spring. Farther north, in Smithtown, Commack and Hauppauge, heavy tree cover means more pollen, sap and algae on decks, fences and walkways.</p>
    <p>Don't see your town? <a href="/contact/">Send a quote request</a> and we'll tell you if we can get to you.</p>
  </div>
</div></section>
${ctaBand()}`,
});

// ---------------- FAQ ----------------
const groups = [...new Set(FAQ.map((f) => f.group))];
page("/faq/", {
  title: "Power Washing FAQ: Pricing, Scheduling, Weather | Clean Island",
  description: "Answers about pricing, scheduling, weather, preparation, water use, cleaning methods, surface safety, payment, cancellations and seasonal availability.",
  current: "/faq/", ld: [crumbLD([["/faq/", "FAQ"]]), faqLD(FAQ)],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "FAQ"]])}<h1>Questions and answers</h1><p class="lede">Everything about pricing, scheduling, prep and payment.</p></div></section>
<section class="section"><div class="narrow">${groups.map((g) => `<h2 style="font-size:var(--step-2);margin-top:2.5rem">${g}</h2>${faqHTML(FAQ.filter((f) => f.group === g))}`).join("")}</div></section>
${ctaBand("Still have a question?", "Send us a message or a quote request and we'll get back to you.")}`,
});

// ---------------- CONTACT ----------------
page("/contact/", {
  title: "Contact and Free Quotes | Clean Island Power Washing, Islip NY",
  description: "Request a free power washing quote in Islip and nearby Suffolk towns. Send photos and details, and get a price back.",
  current: "/contact/", scripts: ["site.js", "contact.js"], ld: [crumbLD([["/contact/", "Contact"]])],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Contact"]])}<h1>Request a quote</h1><p class="lede">For large homes, unusual jobs, towns outside our list, or questions. Add photos and we'll send a price back.</p></div></section>
<section class="section"><div class="wrap split">
  <form id="quote-form" novalidate>
    <div id="quote-alert" role="alert" aria-live="assertive"></div>
    <div class="grid-2"><div class="field"><label for="q-name">Full name</label><input id="q-name" name="customer_name" autocomplete="name" required maxlength="100"></div>
    <div class="field"><label for="q-phone">Mobile phone</label><input id="q-phone" name="phone" type="tel" autocomplete="tel" required maxlength="20"></div></div>
    <div class="field"><label for="q-email">Email</label><input id="q-email" name="email" type="email" autocomplete="email" required maxlength="160"></div>
    <div class="grid-2"><div class="field"><label for="q-address">Street address</label><input id="q-address" name="address" autocomplete="street-address" maxlength="160"></div>
    <div class="field"><label for="q-town">Town</label><input id="q-town" name="town" list="q-towns" required maxlength="60"><datalist id="q-towns">${[...ZONE_1, ...ZONE_2].sort().map((t) => `<option value="${t}">`).join("")}</datalist></div></div>
    <div class="field"><label for="q-zip">ZIP code</label><input id="q-zip" name="zip" inputmode="numeric" maxlength="5" required style="max-width:160px"></div>
    <div class="field"><label for="q-msg">What would you like cleaned?</label><textarea id="q-msg" name="notes" required maxlength="2000" placeholder="For example: two-story vinyl house, about 2,800 sq ft, plus a paver patio"></textarea></div>
    <div class="field"><span style="font-weight:650">Photos <span class="hint">(optional, up to 5)</span></span><div class="dropzone"><label class="btn btn--ghost" for="q-photos" style="background:#fff">Add photos</label><input id="q-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple class="sr-only"><div class="thumbs" id="q-thumbs"></div></div></div>
    <div class="hp" aria-hidden="true"><label for="q-company">Company website</label><input id="q-company" name="company_website" tabindex="-1" autocomplete="off"></div>
    <button class="btn" type="submit">Send quote request</button>
  </form>
  <div>
    <h2 style="font-size:var(--step-3)">Other ways to reach us</h2>
    <p ${cWrap("phone")}>Call or text: ${cLink("phone")}</p>
    <p ${cWrap("email")}>Email: ${cLink("email")}</p>
    <p>Hours: <span data-contact="hours">${esc(BUSINESS.hours)}</span></p>
    <p>Ready to book now? <a href="/book/">Book online</a> and see your price instantly.</p>
  </div>
</div></section>`,
});

// ---------------- TERMS / PRIVACY ----------------
page("/terms/", {
  title: "Booking Terms | Clean Island Power Washing", description: "Booking, deposit, payment, weather and cancellation terms for Clean Island Power Washing.",
  ld: [crumbLD([["/terms/", "Booking terms"]])],
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Booking terms"]])}<h1>Booking terms</h1></div></section>
<section class="section"><div class="narrow prose">
<h2>Estimates and final prices</h2><p>Online prices are estimates based on the sizes you enter. We confirm the final price with you on site before work starts. If the confirmed price is higher than your estimate, you may decline and your deposit will be refunded in full.</p>
<h2>Deposits</h2><p>A ${usd(ST.deposit)} deposit is required to confirm a booking. It is applied to your final bill. Requests that need our review are not charged until we approve them and you pay the deposit.</p>
<h2>Payment</h2><p>Payments are processed by Stripe. The remaining balance is due when the work is finished, through a secure payment link. We never see or store your full card number.</p>
<h2>Cancellations and rescheduling</h2><p>You can cancel or reschedule up to ${ST.cancel_hours} hours before your appointment for a full deposit refund or transfer. With less than ${ST.cancel_hours} hours' notice, the deposit is non-refundable. If we cancel or reschedule for weather or any other reason, your deposit is refunded or moved to the new date, as you prefer.</p>
<h2>Weather</h2><p>We may reschedule for storms, high winds, or temperatures too low to wash safely. We'll contact you as early as possible.</p>
<h2>Your property</h2><p>Please provide access to the areas booked and a working outdoor water spigot, close windows and doors, and move vehicles and fragile items. We'll point out existing damage such as loose paint, failing caulk or rotted wood before starting. Washing can reveal or loosen these existing conditions.</p>
<h2>Results</h2><p>Some stains, such as deep oil, rust, oxidation and sun fading, may lighten but not disappear. Service pages list each service's limits.</p>
<h2>Off-season</h2><p>We operate ${"April 1"} through ${"October 31"}. Bookings outside these dates are available only when we open them.</p>
</div></section>`,
});
page("/privacy/", {
  title: "Privacy Policy | Clean Island Power Washing", description: "How Clean Island Power Washing collects, uses and protects your information.",
  body: `<section class="page-head"><div class="wrap">${crumbs([[null, "Privacy"]])}<h1>Privacy policy</h1></div></section>
<section class="section"><div class="narrow prose">
<p>We collect only what we need to price, schedule and complete your job: your name, email, phone, the service address, details about the property, any photos you upload, and your booking and payment status.</p>
<h2>How we use it</h2><p>To give you an estimate, schedule and confirm your appointment, contact you about the job, and keep basic business records. We don't sell your information or share it for marketing.</p>
<h2>Payments</h2><p>Card payments are handled by Stripe, which receives your card details directly. We see only the payment amount, status and a reference number.</p>
<h2>Storage and security</h2><p>Booking records and photos are stored privately with our database provider, Supabase, and are visible only to the business owners. Information is sent over encrypted connections.</p>
<h2>Your choices</h2><p>Contact us to see, correct or delete your information. We keep payment records as long as tax law requires.</p>
<h2>Cookies</h2><p>This site doesn't use advertising or tracking cookies. Fonts are loaded from Google Fonts.</p>
</div></section>`,
});

// ---------------- ADMIN ----------------
pages.push({ path: "/admin/", html: readFileSync(join(ROOT, "tools/admin.html"), "utf8").replaceAll("{{V}}", V) });

// ---------------- 404 ----------------
page("/404.html", {
  title: "Page Not Found | Clean Island Power Washing", description: "This page doesn't exist.", noindex: true,
  body: `<section class="section"><div class="narrow"><h1>That page isn't here.</h1><p class="lede">The link may be old or mistyped.</p><div class="btn-row"><a class="btn" href="/">Go to the homepage</a><a class="btn btn--ghost" href="/book/">Book online</a></div></div></section>`,
});

// ---------------- write ----------------
for (const p of pages) {
  const file = p.path.endsWith(".html") ? join(ROOT, p.path) : join(ROOT, p.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, p.html);
}
const indexable = pages.filter((p) => !/admin|booking|404/.test(p.path));
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `  <url><loc>${SITE.url}${p.path}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /booking/\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
writeFileSync(join(ROOT, "site.webmanifest"), JSON.stringify({ name: SITE.name, short_name: "Clean Island", start_url: "/", display: "standalone", background_color: "#FFFFFF", theme_color: "#0E2A47", icons: [{ src: "/assets/img/favicon.svg", sizes: "any", type: "image/svg+xml" }, { src: "/assets/img/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] }, null, 2));
writeFileSync(join(ROOT, ".nojekyll"), "");

// Copy the shared pricing logic into the backend function (single source of truth)
const core = readFileSync(join(ROOT, "assets/js/pricing-core.js"), "utf8");
const fnTpl = readFileSync(join(ROOT, "supabase/functions/api/handler.ts"), "utf8");
writeFileSync(join(ROOT, "supabase/functions/api/index.ts"), `// @ts-nocheck\n// GENERATED by tools/build.mjs from handler.ts + assets/js/pricing-core.js. Edit those, not this file.\n// Paste this whole file into the Supabase dashboard function editor.\n\nimport { createClient } from "npm:@supabase/supabase-js@2";\n\n// ---- pricing-core.js ----\n${core.replace(/^export /gm, "")}\n// ---- handler ----\n${fnTpl.replace(/^import \{[^}]+\} from "\.\.\/\.\.\/\.\.\/assets\/js\/pricing-core\.js";\n/m, "").replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";\n/m, "")}`);
console.log(`Built ${pages.length} pages.`);
