// Ensure localStorage is available in jsdom (newer jsdom requires an origin URL
// to enable it, and vitest's jsdom environment doesn't set one by default).
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = {}
  window.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length },
  }
}
