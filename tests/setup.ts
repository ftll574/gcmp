/**
 * Vitest setup — runs once per test file before the tests.
 *
 * Why this exists: Node 26 added a global `localStorage` own-property
 * placeholder (undefined unless `--localstorage-file` is provided). Vitest
 * 4's jsdom environment only overrides keys on its KEYS whitelist, and
 * `localStorage` is not on it, so jsdom's real Storage never gets injected
 * and `window.localStorage` stays undefined — breaking every test whose
 * afterEach calls `window.localStorage.clear()`.
 *
 * Fix: re-bind a working in-memory Storage on `window`/`globalThis`.
 * Implemented here (not via jsdom internals) so the behavior is explicit
 * and does not depend on jsdom version internals.
 */

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(String(key), String(value));
    },
  } as Storage;
}

if (typeof window !== 'undefined') {
  const storage = createMemoryStorage();
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}
