/**
 * One-time explanations (the tutorial, each hint, bonus and theme words) the
 * player has already had, by name.
 *
 * Some browsers (Safari in private mode) read storage fine but throw on write.
 * Then sessionStorage, which survives a refresh, and memory keep the flag, so
 * the same explanation doesn't greet the player on every load. Storage that
 * can't even be read counts as seen, for the same reason.
 */
const memory = new Set<string>();
const key = (name: string) => `rivuon:seen:${name}`;

export function hasSeen(name: string): boolean {
  if (memory.has(name)) return true;
  try {
    return localStorage.getItem(key(name)) === "1" || sessionStorage.getItem(key(name)) === "1" || legacy(name);
  } catch { return true; }
}

export function markSeen(name: string) {
  memory.add(name);
  try { localStorage.setItem(key(name), "1"); } catch { /* private mode etc. */ }
  try { sessionStorage.setItem(key(name), "1"); } catch { /* ditto */ }
}

/** The keys older versions wrote: the rules modal, and a list of explained hints. */
function legacy(name: string): boolean {
  if (name === "tutorial") {
    // the old flag also fell back to sessionStorage
    return localStorage.getItem("rivuon:help-seen") === "1" || sessionStorage.getItem("rivuon:help-seen") === "1";
  }
  if (name.startsWith("hint:")) {
    const ids = JSON.parse(localStorage.getItem("rivuon:hints-seen") ?? "[]") as string[];
    return ids.includes(name.slice("hint:".length));
  }
  return false;
}
