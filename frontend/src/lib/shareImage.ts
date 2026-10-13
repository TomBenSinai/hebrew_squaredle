import type { Layout } from "./layout";

/** What the picture shows. No words, so no spoilers: only the board and the counts. */
export interface ShareCard {
  layout: Layout;
  /** ריבועון, or ריבועוני for the small board */
  game: string;
  /** the board's number; null for ריבועוני, which has none */
  number: number | null;
  /** the line under the name, e.g. "יום שני 12.10" */
  when: string;
  main: number;
  mainTotal: number;
  bonus: number;
  /** shown at the foot, e.g. "ribuon.com" */
  host: string;
}

// a story (9:16), drawn inside its middle 4:5 (y 285 to 1635), so a feed post,
// which crops to that, loses nothing
const W = 1080, H = 1920;
const INK = "#111111", PAPER = "#FFFFFF", GOLD = "#F0B94D", EDGE = "#9A6A10", MUTED = "#9A9A96";
const DISPLAY = `"Rubik", "Segoe UI", "Arial Hebrew", Arial, sans-serif`;

/** Draw the result as a PNG, in the game's own colors and letters. */
export async function shareImage(card: ShareCard): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const done = card.main >= card.mainTotal;

  // ink, with a soft gold glow behind the board
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 830, 40, W / 2, 830, 720);
  glow.addColorStop(0, "rgba(240, 185, 77, .20)");
  glow.addColorStop(1, "rgba(240, 185, 77, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // the name, and which board
  ctx.fillStyle = PAPER;
  ctx.font = `800 128px ${DISPLAY}`;
  ctx.fillText(card.game, W / 2, 372);
  ctx.fillStyle = MUTED;
  ctx.font = `600 44px ${DISPLAY}`;
  ctx.fillText(card.number === null ? card.when : `לוח ${card.number} · ${card.when}`, W / 2, 470);

  drawBoard(ctx, card.layout, done, { x: W / 2, y: 830, w: 720, h: 560 });

  // the count, big: a finished board says so instead
  if (done) {
    ctx.fillStyle = GOLD;
    ctx.font = `800 150px ${DISPLAY}`;
    ctx.fillText("סיימתי!", W / 2, 1230);
    ctx.fillStyle = PAPER;
    ctx.font = `600 52px ${DISPLAY}`;
    ctx.fillText(`כל ${card.mainTotal} המילים`, W / 2, 1330);
  } else {
    ctx.direction = "ltr";
    const big = `${card.main}`, small = ` / ${card.mainTotal}`;
    ctx.font = `800 190px ${DISPLAY}`;
    const bw = ctx.measureText(big).width;
    ctx.font = `700 90px ${DISPLAY}`;
    const sw = ctx.measureText(small).width;
    const left = (W - bw - sw) / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = GOLD;
    ctx.font = `800 190px ${DISPLAY}`;
    ctx.fillText(big, left, 1300);
    ctx.fillStyle = MUTED;
    ctx.font = `700 90px ${DISPLAY}`;
    ctx.fillText(small, left + bw, 1300);
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = PAPER;
    ctx.font = `600 52px ${DISPLAY}`;
    ctx.fillText("מילים", W / 2, 1358);
  }
  if (card.bonus) {
    ctx.fillStyle = GOLD;
    ctx.font = `700 46px ${DISPLAY}`;
    // a left-to-right mark, or the plus lands after the number
    ctx.fillText(`‎+${card.bonus} בונוס`, W / 2, 1420);
  }

  // the dare, and where to take it up
  ctx.fillStyle = PAPER;
  ctx.font = `700 56px ${DISPLAY}`;
  ctx.fillText(done ? "נראה אתכם מצליחים גם" : "נראה אתכם עוקפים אותי", W / 2, 1500);
  ctx.font = `700 46px ${DISPLAY}`;
  ctx.direction = "ltr";
  const hostW = ctx.measureText(card.host).width + 80;
  roundRect(ctx, (W - hostW) / 2, 1548, hostW, 80, 40);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(card.host, W / 2, 1590);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

/** The board's own shape and letters, as tiles: gold once it's solved. */
function drawBoard(ctx: CanvasRenderingContext2D, layout: Layout, done: boolean,
  box: { x: number; y: number; w: number; h: number }) {
  const gap = 0.12;
  const cell = Math.min(box.w / (layout.cols + gap * (layout.cols - 1)),
    box.h / (layout.rows + gap * (layout.rows - 1)), 190);
  const step = cell * (1 + gap);
  const width = cell + step * (layout.cols - 1), height = cell + step * (layout.rows - 1);
  const x0 = box.x - width / 2, y0 = box.y - height / 2;
  ctx.font = `600 ${Math.round(cell * 0.5)}px ${DISPLAY}`;
  layout.cells.forEach(([r, c], i) => {
    // the board reads right to left, so its first column is on the right
    const x = x0 + (layout.cols - 1 - c) * step, y = y0 + r * step;
    const radius = cell * 0.12;
    roundRect(ctx, x, y + cell * 0.05, cell, cell, radius);
    ctx.fillStyle = done ? EDGE : "#5A5A57";
    ctx.fill();
    roundRect(ctx, x, y, cell, cell, radius);
    ctx.fillStyle = done ? GOLD : PAPER;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(layout.letters[i], x + cell / 2, y + cell / 2 + cell * 0.03);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A canvas doesn't ask for web fonts: load Rubik's Hebrew first, or it draws in Arial. */
async function loadFonts() {
  if (!document.fonts) return;
  const sample = "ריבועון אבגדהוזחטיכלמנסעפצקרשת 0123456789";
  const wait = Promise.all(["600", "700", "800"].map(w => document.fonts.load(`${w} 40px Rubik`, sample)));
  await Promise.race([wait, new Promise(r => setTimeout(r, 2500))]).catch(() => {});
}
