// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * storage.ts — namespaced, quota-safe localStorage. Copied from
 * gh-game-factory/patterns/storage.ts. All persistence is local by design.
 */

export function createStore(namespace: string) {
  const key = (k: string) => `game:${namespace}:${k}`;

  function get<T>(k: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key(k));
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  function set<T>(k: string, value: T): void {
    try {
      localStorage.setItem(key(k), JSON.stringify(value));
    } catch {
      // quota exceeded / disabled — persistence is best-effort
    }
  }

  function remove(k: string): void {
    try {
      localStorage.removeItem(key(k));
    } catch {
      /* ignore */
    }
  }

  return { get, set, remove };
}
