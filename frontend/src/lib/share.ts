import type { FoundWord } from "../api/types";
import { letterCount } from "./hebrew";
import type { Layout } from "./layout";
import { groupOf, groupTitle } from "./scoring";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
/** a right-to-left mark: a line that starts with squares still reads from the right */
const RLM = "\u200F";

/** Where a share starts: the counts the player sees, the board as they see it, and its name. */
export interface ShareResult {
  main: number;
  bonus: number;
  mainTotal: number;
  layout: Layout;
  found: FoundWord[];
  /** the day's main words by length, as the word list groups them */
  groups: { length: number; total: number }[];
  /** ריבועון, or ריבועוני for the small one */
  game: string;
  /** the board's number; null for ריבועוני, which has none */
  number: number | null;
}

/**
 * What a player shares: their count, a bar for each word length (how far into
 * the 4-letter words, the 5-letter ones...), their longest word's length, their
 * bonus words, a dare and the link. No words, so no spoilers.
 */
export function shareText({ main, bonus, mainTotal, found, groups, game, number }: ShareResult): string {
  const name = number === null ? game : `${game} ${number}`;
  // the name on a line of its own: name and count together wrap on a small phone
  const head = main >= mainTotal ? `🏆 ${name}\nסיימתי! כל ${mainTotal} המילים`
    : main === 0 ? `🧩 ${name}\nרק התחלתי`
    : `🧩 ${name}\nמצאתי ${main === 1 ? `מילה אחת מתוך ${mainTotal}` : `${main} מתוך ${mainTotal} מילים`}`;
  const mainWords = found.filter(f => f.cat === "main");
  const bars = groups.map(({ length, total }) =>
    bar(mainWords.filter(f => groupOf(f.w) === length).length, total, length));
  const longest = Math.max(0, ...found.map(f => letterCount(f.w)));
  const facts = [
    longest && `📏 המילה הכי ארוכה שלי: ${longest} אותיות`,
    bonus && `⭐ ${count(bonus, "מילת בונוס אחת", "מילות בונוס")}`,
  ].filter(Boolean);
  const dare = main >= mainTotal ? "נראה אתכם מצליחים גם 🤩" : "נראה אתכם עוקפים אותי! 🔥";
  return [head, "", ...bars, ...(facts.length ? ["", ...facts] : []), "", dare, window.location.origin].join("\n");
}

/** Squares in a bar: short enough that a bar and its line fit a small phone's chat bubble. */
const BAR = 6;

/**
 * One length's words as a short bar: gold for the share found, green once all
 * are, then the length and the count. A start shows at least one gold square,
 * an unfinished group at least one white.
 */
function bar(got: number, total: number, length: number): string {
  let gold = Math.round(BAR * got / total);
  if (got > 0) gold = Math.max(gold, 1);
  if (got < total) gold = Math.min(gold, BAR - 1);
  const squares = got >= total ? "🟩".repeat(BAR) : "🟨".repeat(gold) + "⬜".repeat(BAR - gold);
  return `${RLM}${squares} ${groupTitle(length)} ${got}/${total}`;
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

/** The phone's share menu takes pictures here: that's the way into Instagram, WhatsApp and the rest. */
export function canShareFile(file: File): boolean {
  return !!navigator.share && !!navigator.canShare?.({ files: [file] });
}

/**
 * Hand the picture to the share menu. Called straight from the tap, with the
 * file made beforehand: Safari opens the menu only inside the tap itself.
 * Just the file, no text: with text beside it iOS leaves Instagram out.
 */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (e) {
    return e instanceof DOMException && (e.name === "AbortError" || e.name === "InvalidStateError");
  }
}

/** Save the picture as a download (a computer, where there's no share menu for files). */
export function saveFile(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
