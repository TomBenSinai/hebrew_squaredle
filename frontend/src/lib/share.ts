import type { FoundWord } from "../api/types";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** What a player shares: how many words they found, a dare, and the link. No words, so no spoilers. */
export function shareText(found: FoundWord[]): string {
  const main = found.filter(f => f.cat === "main").length;
  const bonus = found.length - main;
  const words = count(main, "מילה אחת", "מילים");
  const extra = bonus ? ` ו${count(bonus, "מילת בונוס אחת", "מילות בונוס")}` : "";
  return `שיחקתי בריבועון ומצאתי ${words}${extra}. נראה אותך עוקף אותי! ${window.location.origin}`;
}

/**
 * Open the system share dialog. A browser without one (Firefox on a computer,
 * or any page that isn't https) gets the text on the clipboard instead.
 */
export async function share(text: string): Promise<void> {
  if (navigator.share && navigator.canShare?.({ text }) !== false) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;   // closed without picking
    }
  }
  await copyText(text);
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
