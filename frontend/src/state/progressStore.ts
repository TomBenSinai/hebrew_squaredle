import { api } from "../api/client";
import type { DayProgress, FoundWord } from "../api/types";

/**
 * Where a player's progress lives. The game only talks to this interface:
 * localStorage mirrored to the backend, under the logged-in account when there
 * is a session cookie (the server decides) and the anonymous player id when not.
 */
export interface ProgressStore {
  load(date: string): DayProgress;
  save(date: string, progress: DayProgress): void;
  all(): Record<string, DayProgress>;
  /** Pull what the server has and merge it in, and push what it lacks; resolves once both are done. */
  sync(): Promise<void>;
  /** false while some save hasn't reached the server */
  readonly allSent: boolean;
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
  get allSent() { return false; }
}

/** localStorage first (instant, works offline), the server in the background. */
export class SyncedProgressStore implements ProgressStore {
  private local = new LocalProgressStore();
  // days whose last save didn't reach the server
  private unsent = new Set<string>();
  // how many saves each day has sent, to tell the newest one's answer apart
  private sent = new Map<string, number>();
  // the last sync() reached the server
  private synced = false;

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
    // each save holds the whole day, so only the newest one's outcome counts:
    // a slow older save must not clear or set the mark for a newer one
    const n = (this.sent.get(date) ?? 0) + 1;
    this.sent.set(date, n);
    const latest = () => this.sent.get(date) === n;
    api.progress.put(this.player, date, progress.found, progress.rot)
      .then(() => { if (latest()) this.unsent.delete(date); })
      .catch(() => { if (latest()) this.unsent.add(date); });   // offline or no backend: flush() retries
  }

  /** Resend the days that didn't go up, as they stand now. */
  private flush() {
    for (const date of this.unsent) this.push(date, this.local.load(date));
  }

  async sync() {
    let remote: Record<string, DayProgress>;
    try { remote = await api.progress.all(this.player); } catch { this.synced = false; return; }
    this.synced = true;
    const local = this.local.all();
    const puts: Promise<unknown>[] = [];
    for (const date of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const l = local[date] ?? EMPTY, r = remote[date] ?? EMPTY;
      const found = mergeFound(l.found, r.found);
      const merged = { found, rot: local[date] ? l.rot : r.rot };
      this.local.save(date, merged);
      if (found.length > r.found.length) {
        puts.push(api.progress.put(this.player, date, found, merged.rot).catch(() => this.unsent.add(date)));
      }
    }
    await Promise.all(puts);
  }

  /** Everything on this device is on the server, as far as this tab knows. */
  get allSent() { return this.synced && this.unsent.size === 0; }
}

const PLAYER_KEY = "ribuon:player";

export function playerId(): string {
  const key = PLAYER_KEY;
  let id = storage.get<string>(key);
  if (!id) {
    // randomUUID needs a secure context; a phone on the LAN over plain http has none
    id = crypto.randomUUID?.() ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
    storage.set(key, id);
  }
  return id;
}

/**
 * After logging out: drop this device's progress and anonymous id, so whoever
 * uses it next starts fresh (the progress stays in the account). Reload after.
 */
export function forgetDevice() {
  // the pre-rename id too, or migrateStorage would copy it back on the next load
  for (const k of storage.keys()) {
    if (k.startsWith(KEY_PREFIX) || k === PLAYER_KEY || k === "rivuon:player") {
      try { localStorage.removeItem(k); } catch { /* private mode etc. */ }
    }
  }
}

export const progressStore: ProgressStore = new SyncedProgressStore(playerId());
