import type { FoundWord } from "../api/types";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** What a player shares: how many words they found, a dare, and the link. No words, so no spoilers.
 * `done`: every main word is found, so it says the board is finished and counts only the bonus words. */
export function shareText(found: FoundWord[], done = false): string {
  const main = found.filter(f => f.cat === "main").length;
  const bonus = found.length - main;
  const link = window.location.origin;
  if (done) {
    const extra = bonus ? ` עם ${count(bonus, "מילת בונוס אחת", "מילות בונוס")}` : "";
    return `תראו, סיימתי את הריבועון${extra}! נראה אותך מצליח גם🤩 ${link}`;
  }
  const words = count(main, "מילה אחת", "מילים");
  const extra = bonus ? ` ו${count(bonus, "מילת בונוס אחת", "מילות בונוס")}` : "";
  return `שיחקתי בריבועון ומצאתי ${words}${extra}. נראה אותך עוקף אותי! ${link}`;
}

/**
 * Open the system share dialog. A browser without one (Firefox on a computer,
 * or any page that isn't https) gets the text on the clipboard instead; the
 * caller says so, since nothing else on screen does.
 */
export async function share(text: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share && navigator.canShare?.({ text }) !== false) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      // closed without picking, or a second tap while the dialog is still open
      if (e instanceof DOMException && (e.name === "AbortError" || e.name === "InvalidStateError")) return "shared";
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

/** Copy to the clipboard; the old way where the clipboard API isn't there (not https). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;inset:0";
    document.body.append(area);
    area.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); }
  }
}
