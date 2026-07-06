/**
 * Runs before any module is loaded. Provides a real in-memory localStorage
 * so the Zustand persist middleware can initialise properly in jsdom.
 */
const _store: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string) => (_store[key] !== undefined ? _store[key] : null),
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key: (index: number) => Object.keys(_store)[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});
