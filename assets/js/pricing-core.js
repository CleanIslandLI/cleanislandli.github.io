// Clean Island Power Washing: shared pricing, service-area and season logic.
// This one file is used by the website (estimates), and copied into the backend
// (supabase/functions/api) so the server always recomputes the real price.
// Edit default prices here; once the backend is live, prices are managed in /admin.

export const DEFAULT_SETTINGS = {
  timezone: "America/New_York",
  season_start: "04-01",        // MM-DD, first bookable day of the season
  season_end: "10-31",          // MM-DD, last bookable day of the season
  working_days: [1, 2, 3, 4, 5, 6], // 0=Sun ... 6=Sat
  extra_open_dates: [],         // YYYY-MM-DD dates the owner opens outside the season
  offseason_open: false,        // true = allow bookings all year (owner must switch this on)
  crews: 2,                     // jobs that can run in the same time window
  min_lead_days: 2,             // earliest booking = today + this many days
  max_advance_days: 400,        // lets customers reserve next season now
  order_minimum: 150,
  deposit: 50,
  instant_max: 450,             // estimates at or below this can be booked instantly
  full_day_threshold: 350,      // estimates above this take a full day for one crew
  bundle_2_pct: 7,              // % off main services when 2 are booked together
  bundle_3_pct: 12,             // % off main services when 3+ are booked together
  zone2_fee: 25,
  cancel_hours: 48,
};

// kind: main = can be booked alone; addon = needs at least one main service.
// unit: sqft | lf (linear feet) | each | flat
export const DEFAULT_SERVICES = [
  { id: "house_wash", name: "House wash: vinyl or aluminum siding", category: "house-washing", kind: "main", unit: "sqft", rate: 0.15, min_price: 249, unit_label: "home sq ft", sort: 10 },
  { id: "brick_wash", name: "House wash: brick, stone or stucco", category: "house-washing", kind: "main", unit: "sqft", rate: 0.18, min_price: 279, unit_label: "home sq ft", sort: 20 },
  { id: "driveway", name: "Driveway: concrete", category: "driveway-cleaning", kind: "main", unit: "sqft", rate: 0.22, min_price: 0, unit_label: "sq ft", sort: 30 },
  { id: "pavers", name: "Driveway or patio: pavers", category: "driveway-cleaning", kind: "main", unit: "sqft", rate: 0.28, min_price: 0, unit_label: "sq ft", sort: 40 },
  { id: "patio_walk", name: "Patio or walkway: concrete or stone", category: "patio-walkway-cleaning", kind: "main", unit: "sqft", rate: 0.25, min_price: 0, unit_label: "sq ft", sort: 50 },
  { id: "pool_deck", name: "Pool deck", category: "patio-walkway-cleaning", kind: "main", unit: "sqft", rate: 0.25, min_price: 0, unit_label: "sq ft", sort: 60 },
  { id: "porch_steps", name: "Front porch, entry and steps", category: "patio-walkway-cleaning", kind: "main", unit: "flat", rate: 85, min_price: 0, unit_label: "entry", sort: 70 },
  { id: "deck", name: "Deck: wood or composite", category: "deck-fence-cleaning", kind: "main", unit: "sqft", rate: 0.40, min_price: 175, unit_label: "sq ft", sort: 80 },
  { id: "fence", name: "Fence: vinyl or wood, per side", category: "deck-fence-cleaning", kind: "main", unit: "lf", rate: 1.75, min_price: 0, unit_label: "linear ft", sort: 90 },
  { id: "windows", name: "Exterior window cleaning", category: "windows-gutters-doors", kind: "main", unit: "each", rate: 8, min_price: 80, unit_label: "window", sort: 100 },
  { id: "gutter_face", name: "Gutter and fascia exterior wash", category: "windows-gutters-doors", kind: "main", unit: "lf", rate: 1.0, min_price: 100, unit_label: "linear ft", sort: 110 },
  { id: "garage_door", name: "Garage door", category: "windows-gutters-doors", kind: "main", unit: "each", rate: 35, min_price: 0, unit_label: "door", sort: 120 },
  { id: "shed", name: "Shed exterior", category: "yard-extras", kind: "main", unit: "each", rate: 85, min_price: 0, unit_label: "shed", sort: 130 },
  { id: "play_set", name: "Play set or swing set", category: "yard-extras", kind: "main", unit: "each", rate: 95, min_price: 0, unit_label: "set", sort: 140 },
  { id: "furniture", name: "Outdoor furniture", category: "yard-extras", kind: "main", unit: "each", rate: 12, min_price: 40, unit_label: "piece", sort: 150 },
  { id: "trash_bins", name: "Trash and recycling bins", category: "yard-extras", kind: "addon", unit: "each", rate: 20, min_price: 0, unit_label: "bin", sort: 160 },
  { id: "mailbox", name: "Mailbox and post", category: "yard-extras", kind: "addon", unit: "each", rate: 15, min_price: 0, unit_label: "mailbox", sort: 170 },
  { id: "oil_stain", name: "Oil or rust spot pre-treatment", category: "driveway-cleaning", kind: "addon", unit: "each", rate: 30, min_price: 0, unit_label: "spot", sort: 180 },
];

// Suffolk County towns by approximate driving distance from Islip.
// Zone 1: about 15 miles or less (no travel fee). Zone 2: about 15 to 25 miles.
export const ZONE_1 = [
  "Babylon", "Bay Shore", "Bayport", "Blue Point", "Bohemia", "Brentwood", "Brightwaters",
  "Centereach", "Central Islip", "Commack", "Deer Park", "Dix Hills", "East Islip",
  "East Patchogue", "Farmingville", "Great River", "Hauppauge", "Holbrook", "Holtsville",
  "Islandia", "Islip", "Islip Terrace", "Kings Park", "Lake Grove", "Lake Ronkonkoma",
  "Lindenhurst", "Medford", "Nesconset", "North Babylon", "North Bay Shore", "North Patchogue",
  "Oakdale", "Patchogue", "Ronkonkoma", "Sayville", "Selden", "Smithtown", "St. James",
  "West Babylon", "West Bay Shore", "West Islip", "West Sayville", "Wyandanch",
];
export const ZONE_2 = [
  "Amityville", "Bellport", "Brookhaven", "Centerport", "Copiague", "Coram", "East Farmingdale",
  "East Northport", "East Setauket", "Elwood", "Fort Salonga", "Greenlawn", "Head of the Harbor",
  "Huntington", "Huntington Station", "Mastic", "Mastic Beach", "Melville", "Middle Island",
  "Miller Place", "Mount Sinai", "Nissequogue", "North Amityville", "Northport", "Port Jefferson",
  "Port Jefferson Station", "Ridge", "Rocky Point", "Setauket", "Shirley", "Shoreham",
  "Sound Beach", "South Huntington", "Stony Brook", "Terryville", "Yaphank",
];

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^saint /, "st. ").replace(/^st /, "st. ");
export function zoneForTown(town) {
  const t = norm(town);
  if (!t) return 0;
  if (ZONE_1.some((z) => norm(z) === t)) return 1;
  if (ZONE_2.some((z) => norm(z) === t)) return 2;
  return 0; // outside the listed area: quote request only
}

const money = (n) => Math.round(n * 100) / 100;

// Returns the full estimate breakdown. Throws nothing; problems come back in `issues`.
export function estimate({ services = DEFAULT_SERVICES, settings = DEFAULT_SETTINGS, items = [], town = "", promo = null }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const byId = Object.fromEntries(services.filter((x) => x.active !== false).map((x) => [x.id, x]));
  const issues = [];
  const lines = [];
  for (const it of items) {
    const svc = byId[it.id];
    const qty = Math.max(0, Math.min(100000, Math.floor(Number(it.qty) || 0)));
    if (!svc) { issues.push(`Unknown service: ${it.id}`); continue; }
    if (svc.unit === "flat") {
      lines.push({ id: svc.id, name: svc.name, kind: svc.kind, qty: 1, unit: svc.unit, amount: money(Number(svc.rate)) , minimum_applied: false});
      continue;
    }
    if (qty <= 0) continue;
    const raw = qty * Number(svc.rate);
    const min = Number(svc.min_price) || 0;
    lines.push({ id: svc.id, name: svc.name, kind: svc.kind, qty, unit: svc.unit, unit_label: svc.unit_label, amount: money(Math.max(raw, min)), minimum_applied: raw < min, quote_only: !!svc.quote_only });
  }
  const mains = lines.filter((l) => l.kind === "main");
  if (lines.length && !mains.length) issues.push("Add-ons need at least one main service.");

  const mainSubtotal = mains.reduce((a, l) => a + l.amount, 0);
  const addonSubtotal = lines.filter((l) => l.kind === "addon").reduce((a, l) => a + l.amount, 0);
  const bundlePct = mains.length >= 3 ? s.bundle_3_pct : mains.length === 2 ? s.bundle_2_pct : 0;
  const bundleDiscount = money(mainSubtotal * bundlePct / 100);

  let promoDiscount = 0;
  const afterBundle = mainSubtotal + addonSubtotal - bundleDiscount;
  if (promo && afterBundle > 0) {
    if (promo.percent_off) promoDiscount = money(afterBundle * Number(promo.percent_off) / 100);
    else if (promo.amount_off) promoDiscount = Math.min(afterBundle, Number(promo.amount_off));
  }
  const zone = zoneForTown(town);
  const travel = zone === 2 ? Number(s.zone2_fee) : 0;
  let total = afterBundle - promoDiscount + travel;
  const minimumApplied = lines.length > 0 && total < s.order_minimum;
  if (minimumApplied) total = s.order_minimum;
  total = Math.round(total);

  const quoteOnly = lines.some((l) => l.quote_only);
  const instant = lines.length > 0 && mains.length > 0 && zone > 0 && !quoteOnly && total <= s.instant_max;
  return {
    lines, main_subtotal: money(mainSubtotal), addon_subtotal: money(addonSubtotal),
    bundle_pct: bundlePct, bundle_discount: bundleDiscount, promo_discount: money(promoDiscount),
    zone, travel_fee: travel, order_minimum: s.order_minimum, minimum_applied: minimumApplied,
    total, deposit: lines.length ? Math.min(s.deposit, total) : 0,
    units: total > s.full_day_threshold ? 2 : 1,
    instant_eligible: instant, issues,
  };
}

// ---------- dates & season ----------
export function todayIn(tz = DEFAULT_SETTINGS.timezone, now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export function addDays(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = (ymd) => new Date(ymd + "T12:00:00Z").getUTCDay();
export function inSeason(ymd, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const md = ymd.slice(5);
  return s.season_start <= s.season_end ? md >= s.season_start && md <= s.season_end : md >= s.season_start || md <= s.season_end;
}
// Is a calendar day bookable at all (ignores capacity)?
export function isDateOpen(ymd, settings = DEFAULT_SETTINGS, blackouts = [], today = todayIn()) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  if (ymd < addDays(today, s.min_lead_days) || ymd > addDays(today, s.max_advance_days)) return false;
  if (blackouts.includes(ymd)) return false;
  if ((s.extra_open_dates || []).includes(ymd)) return true;
  return (s.offseason_open || inSeason(ymd, s)) && s.working_days.includes(weekday(ymd));
}
export function seasonStatus(settings = DEFAULT_SETTINGS, today = todayIn()) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const open = s.offseason_open || inSeason(today, s);
  let next = null;
  for (let i = s.min_lead_days; i <= s.max_advance_days; i++) {
    const d = addDays(today, i);
    if (isDateOpen(d, s, [], today)) { next = d; break; }
  }
  return { open, next_open: next, season_start: s.season_start, season_end: s.season_end };
}
export function formatDate(ymd, opts = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
export const WINDOWS = { am: "Morning, 8 am to 12 pm", pm: "Afternoon, 12 to 4 pm", full: "Full day, starting 8 am", flex: "Any time that day" };
