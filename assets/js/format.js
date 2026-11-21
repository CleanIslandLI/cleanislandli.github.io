export const usd = (n, cents = false) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
export function rateText(s) {
  const r = Number(s.rate);
  const rate = r < 1 ? usd(r, true) : (Number.isInteger(r) ? usd(r) : usd(r, true));
  let t = s.unit === "flat" ? usd(r) : s.unit === "sqft" ? `${rate} per sq ft` : s.unit === "lf" ? `${rate} per linear ft` : `${rate} per ${s.unit_label || "item"}`;
  if (Number(s.min_price) > 0) t += `, ${usd(s.min_price)} minimum`;
  return t;
}
export function fromText(s) {
  if (s.unit === "flat") return usd(s.rate);
  if (Number(s.min_price) > 0) return `from ${usd(s.min_price)}`;
  return rateText(s);
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
