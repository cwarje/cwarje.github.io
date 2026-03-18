import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const storage = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return storage.size;
  },
  clear() {
    storage.clear();
  },
  getItem(key: string) {
    return storage.get(key) ?? null;
  },
  key(index: number) {
    return Array.from(storage.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storage.delete(key);
  },
  setItem(key: string, value: string) {
    storage.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorageMock.clear();
});
