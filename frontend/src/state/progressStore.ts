import { api } from "../api/client";
import type { DayProgress, FoundWord } from "../api/types";

/**
 * Where a player's progress lives. The game only talks to this interface:
 * today it's localStorage mirrored to the backend under an anonymous player
 * id; with login, swap the id for the user's (or add a store that uses the
 * session) without touching the game.
 */
export interface ProgressStore {
  load(date: string): DayProgress;
  save(date: string, progress: DayProgress): void;
  all(): Record<string, DayProgress>;
  /** Pull what the server has and merge it in; resolves once local state is up to date. */
  sync(): Promise<void>;
}

const EMPTY: DayProgress = { found: [], rot: 0 };
const KEY_PREFIX = "otiot:";               // same keys as the single-file page

const storage = {
  get<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  },
  keys(): string[] {
    try { return Object.keys(localStorage); } catch { return []; }
  },
};

/** Union by word, keeping the order each was first found in. */
export function mergeFound(a: FoundWord[], b: FoundWord[]): FoundWord[] {
  const seen = new Set(a.map(f => f.w));
  return [...a, ...b.filter(f => !seen.has(f.w))];
}

export class LocalProgressStore implements ProgressStore {
  load(date: string): DayProgress {
    const p = storage.get<Partial<DayProgress>>(KEY_PREFIX + date);
    return { found: p?.found ?? [], rot: p?.rot ?? 0 };
  }
  save(date: string, progress: DayProgress) {
    storage.set(KEY_PREFIX + date, progress);
  }
  all(): Record<string, DayProgress> {
    const out: Record<string, DayProgress> = {};
    for (const k of storage.keys()) if (k.startsWith(KEY_PREFIX)) out[k.slice(KEY_PREFIX.length)] = this.load(k.slice(KEY_PREFIX.length));
    return out;
  }
  async sync() {}
}

/** localStorage first (instant, works offline), the server in the background. */
export class SyncedProgressStore implements ProgressStore {
  private local = new LocalProgressStore();
  // days whose last save didn't reach the server
  private unsent = new Set<string>();

  constructor(private player: string) {
    // back online, or back to the tab (the "online" event can miss a flaky
    // network): send what's waiting. A closed tab is caught by sync() at start.
    window.addEventListener("online", () => this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.flush();
    });
  }

  load(date: string) { return this.local.load(date); }
  all() { return this.local.all(); }

  save(date: string, progress: DayProgress) {
    this.local.save(date, progress);
    this.push(date, progress);
  }

  private push(date: string, progress: DayProgress) {
    api.progress.put(this.player, date, progress.found, progress.rot)
      .then(() => this.unsent.delete(date))
      .catch(() => this.unsent.add(date));   // offline or no backend: flush() retries
  }

  /** Resend the days that didn't go up, as they stand now. */
  private flush() {
    for (const date of this.unsent) this.push(date, this.local.load(date));
  }

  async sync() {
    let remote: Record<string, DayProgress>;
    try { remote = await api.progress.all(this.player); } catch { return; }
    const local = this.local.all();
    for (const date of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const l = local[date] ?? EMPTY, r = remote[date] ?? EMPTY;
      const found = mergeFound(l.found, r.found);
      const merged = { found, rot: local[date] ? l.rot : r.rot };
      this.local.save(date, merged);
      if (found.length > r.found.length) {
        api.progress.put(this.player, date, found, merged.rot).catch(() => {});
      }
    }
  }
}

export function playerId(): string {
  const key = "ribuon:player";
  let id = storage.get<string>(key);
  if (!id) {
    // randomUUID needs a secure context; a phone on the LAN over plain http has none
    id = crypto.randomUUID?.() ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
    storage.set(key, id);
  }
  return id;
}

export const progressStore: ProgressStore = new SyncedProgressStore(playerId());
