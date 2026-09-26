import type { Answer, Category } from "../api/types";

/**
 * Checks swipes against the board's hashed words (`Day.answers` in
 * backend/app/boards.py), so a find shows at once instead of after a round
 * trip. The server still re-checks every word it saves.
 */
export interface Hit {
  word: string;
  cat: Category;
  theme: boolean;
}

/** null: the answer for "not a word". */
export type Lookup = (key: string) => Promise<Hit | null>;

const enc = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");

async function open(salt: string, key: string, sealed: string): Promise<Hit> {
  const data = Uint8Array.from(atob(sealed), c => c.charCodeAt(0));
  const stream: number[] = [];
  for (let i = 0; stream.length < data.length; i++) stream.push(...await sha256(`${salt}:d${i}:${key}`));
  const text = new TextDecoder().decode(data.map((b, i) => b ^ stream[i]));
  return { cat: text[0] === "m" ? "main" : "bonus", theme: text[1] === "1", word: text.slice(2) };
}

/**
 * `key` is the swiped word, normalized. null when this client can't check
 * locally (no WebCrypto outside a secure context, e.g. a phone on the LAN over
 * plain http, or an API from before `answers`): ask the server then.
 */
export function answerLookup(salt: string | undefined, answers: Answer[] | undefined): Lookup | null {
  if (!salt || !answers || !globalThis.crypto?.subtle) return null;
  const byHash = new Map(answers.map(a => [a.h, a.d]));
  return async key => {
    const sealed = byHash.get(hex((await sha256(`${salt}:h:${key}`)).slice(0, 16)));
    return sealed === undefined ? null : open(salt, key, sealed);
  };
}
