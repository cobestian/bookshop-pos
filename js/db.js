function shopScopedKey(key) {
  try {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
    const shopId = currentUser?.shopId || "default";
    return `shop_${shopId}_${key}`;
  } catch {
    return `shop_default_${key}`;
  }
}

export function get(key, fallback) {
  try {
    const raw = localStorage.getItem(shopScopedKey(key));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  localStorage.setItem(shopScopedKey(key), JSON.stringify(value));
}

export function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function nowISO() {
  return new Date().toISOString();
}

export function ghc(n) {
  return `GH₵ ${Number(n || 0).toFixed(2)}`;
}

export function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}