// Safe wrapper over localStorage. Any failure (private mode, blocked storage, quota, bad JSON)
// degrades to in-memory state and is reported via onError so it is never silent.

const PREFIX = 'bank:v1:';

export function createStore(getStorage = () => (typeof window !== 'undefined' ? window : globalThis).localStorage, onError = () => {}) {
  const memory = new Map();
  let broken = false;

  function storage() {
    try {
      return getStorage();
    } catch (e) {
      fail(e);
      return null;
    }
  }
  function fail(e) {
    if (!broken) { broken = true; onError(e); }
  }

  return {
    get persistent() { return !broken; },
    get(key, fallback = null) {
      const k = PREFIX + key;
      try {
        const s = storage();
        if (s) {
          const raw = s.getItem(k);
          if (raw == null) return memory.has(k) ? memory.get(k) : fallback;
          return JSON.parse(raw);
        }
      } catch (e) { fail(e); }
      return memory.has(k) ? memory.get(k) : fallback;
    },
    set(key, value) {
      const k = PREFIX + key;
      memory.set(k, value);
      try {
        const s = storage();
        if (s) s.setItem(k, JSON.stringify(value));
      } catch (e) { fail(e); }
    },
    remove(key) {
      const k = PREFIX + key;
      memory.delete(k);
      try {
        const s = storage();
        if (s) s.removeItem(k);
      } catch (e) { fail(e); }
    },
  };
}
