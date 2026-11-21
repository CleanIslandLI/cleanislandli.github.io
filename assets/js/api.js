import { API_URL } from "./config.js";
export const backendReady = () => !!API_URL;
export class ApiError extends Error { constructor(msg, code, data) { super(msg); this.code = code; this.data = data; } }
export async function api(action, body = {}, { token, timeout = 20000 } = {}) {
  if (!API_URL) throw new ApiError("Online booking isn't connected yet.", "not_configured");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.error) throw new ApiError(data.error || `Request failed (${res.status}).`, data.code || res.status, data);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === "AbortError") throw new ApiError("The request timed out. Check your connection and try again.", "timeout");
    throw new ApiError("We couldn't reach the booking system. Check your connection and try again.", "network");
  } finally { clearTimeout(t); }
}
let catalogPromise;
export function loadCatalog() {
  if (!API_URL) return Promise.resolve(null);
  if (catalogPromise) return catalogPromise;
  try {
    const c = JSON.parse(sessionStorage.getItem("ci_catalog") || "null");
    if (c && Date.now() - c.t < 10 * 60 * 1000) return (catalogPromise = Promise.resolve(c.data));
  } catch {}
  catalogPromise = api("catalog", {}, { timeout: 8000 }).then((data) => {
    try { sessionStorage.setItem("ci_catalog", JSON.stringify({ t: Date.now(), data })); } catch {}
    return data;
  }).catch(() => null);
  return catalogPromise;
}
