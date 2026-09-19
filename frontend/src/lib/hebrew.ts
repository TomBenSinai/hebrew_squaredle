const TO_REGULAR: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const TO_FINAL: Record<string, string> = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

/** Hebrew letters only, final letters folded: the form all matching uses. */
export const norm = (w: string) =>
  [...w].filter(c => c >= "א" && c <= "ת").map(c => TO_REGULAR[c] ?? c).join("");

/** Spell the last letter in its final form, for showing a swipe in progress. */
export const withFinal = (s: string) =>
  s.length ? s.slice(0, -1) + (TO_FINAL[s.at(-1)!] ?? s.at(-1)) : s;

export const letterCount = (w: string) => norm(w).length;
