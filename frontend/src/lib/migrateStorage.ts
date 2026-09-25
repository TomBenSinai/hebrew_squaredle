/**
 * The app used to be called rivuon, and its localStorage keys (the player id
 * above all, which saved progress hangs on) carried that prefix. Copy them to
 * the ribuon: names once, before anything reads them. Keys already under the
 * new name win, and the old ones stay behind in case of a rollback.
 */
const OLD = "rivuon:", NEW = "ribuon:";

for (const store of [() => localStorage, () => sessionStorage]) {
  try {
    const s = store();
    for (const k of Object.keys(s)) {
      if (!k.startsWith(OLD)) continue;
      const renamed = NEW + k.slice(OLD.length);
      if (s.getItem(renamed) === null) s.setItem(renamed, s.getItem(k)!);
    }
  } catch { /* private mode etc. */ }
}

export {};
