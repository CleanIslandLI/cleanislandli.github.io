import test from "node:test";
import assert from "node:assert/strict";
import { estimate, zoneForTown, isDateOpen, seasonStatus, addDays, inSeason } from "../assets/js/pricing-core.js";

test("house wash 2000 sq ft = $300, instant", () => {
  const e = estimate({ items: [{ id: "house_wash", qty: 2000 }], town: "Islip" });
  assert.equal(e.total, 300); assert.equal(e.instant_eligible, true); assert.equal(e.deposit, 50); assert.equal(e.units, 1);
});
test("small driveway raised to $150 minimum", () => {
  const e = estimate({ items: [{ id: "driveway", qty: 600 }], town: "Bay Shore" });
  assert.equal(e.total, 150); assert.equal(e.minimum_applied, true);
});
test("service minimum applies (house wash 1000 sq ft -> $249)", () => {
  assert.equal(estimate({ items: [{ id: "house_wash", qty: 1000 }], town: "Islip" }).total, 249);
});
test("bundle 2 services = 7% off mains, addons not discounted", () => {
  const e = estimate({ items: [{ id: "house_wash", qty: 2000 }, { id: "driveway", qty: 600 }, { id: "trash_bins", qty: 2 }], town: "Islip" });
  assert.equal(e.bundle_pct, 7); assert.equal(e.total, Math.round((300 + 132) * 0.93 + 40));
});
test("3+ mains = 12%", () => {
  const e = estimate({ items: [{ id: "house_wash", qty: 2000 }, { id: "driveway", qty: 600 }, { id: "deck", qty: 300 }], town: "Islip" });
  assert.equal(e.bundle_pct, 12);
});
test("zone 2 travel fee $25, outside area = not instant", () => {
  assert.equal(estimate({ items: [{ id: "house_wash", qty: 2000 }], town: "Huntington" }).total, 325);
  const o = estimate({ items: [{ id: "house_wash", qty: 2000 }], town: "Montauk" });
  assert.equal(o.zone, 0); assert.equal(o.instant_eligible, false);
});
test("big job needs review and full day", () => {
  const e = estimate({ items: [{ id: "house_wash", qty: 3500 }], town: "Islip" });
  assert.equal(e.total, 525); assert.equal(e.instant_eligible, false); assert.equal(e.units, 2);
});
test("add-on alone is rejected", () => {
  assert.ok(estimate({ items: [{ id: "trash_bins", qty: 2 }], town: "Islip" }).issues.length);
});
test("trash bins $20 each", () => {
  const e = estimate({ items: [{ id: "house_wash", qty: 2000 }, { id: "trash_bins", qty: 3 }], town: "Islip" });
  assert.equal(e.lines.find((l) => l.id === "trash_bins").amount, 60);
});
test("promo percent and fixed, minimum still enforced", () => {
  assert.equal(estimate({ items: [{ id: "house_wash", qty: 2000 }], town: "Islip", promo: { percent_off: 10 } }).total, 270);
  assert.equal(estimate({ items: [{ id: "driveway", qty: 600 }], town: "Islip", promo: { amount_off: 100 } }).total, 150);
});
test("negative / garbage quantities ignored", () => {
  assert.equal(estimate({ items: [{ id: "deck", qty: -50 }, { id: "nope", qty: 5 }], town: "Islip" }).lines.length, 0);
});
test("towns normalize", () => { assert.equal(zoneForTown(" saint james "), 1); assert.equal(zoneForTown("bay shore"), 1); });
test("season: winter closed, spring open, Sundays closed", () => {
  const today = "2026-11-21";
  assert.equal(isDateOpen("2026-12-15", undefined, [], today), false);
  assert.equal(isDateOpen("2027-04-01", undefined, [], today), true); // Thursday
  assert.equal(isDateOpen("2027-04-04", undefined, [], today), false); // Sunday
  assert.equal(isDateOpen("2027-04-01", undefined, ["2027-04-01"], today), false); // blackout
  assert.equal(isDateOpen("2026-11-22", undefined, [], today), false); // lead time
  assert.equal(seasonStatus(undefined, today).next_open, "2027-04-01");
  assert.equal(isDateOpen("2026-12-15", { offseason_open: true }, [], today), true); // explicit owner switch
  assert.equal(isDateOpen("2026-12-05", { extra_open_dates: ["2026-12-05"] }, [], today), true);
  assert.equal(inSeason("2027-10-31"), true); assert.equal(inSeason("2027-11-01"), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
