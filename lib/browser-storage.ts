export function readBrowserStorage(key: string, fallback: string | null = null) {
  try { return typeof window === "undefined" ? fallback : window.localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

export function writeBrowserStorage(key: string, value: string) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); return true; }
  catch { return false; }
}

export function removeBrowserStorage(key: string) {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); return true; }
  catch { return false; }
}
