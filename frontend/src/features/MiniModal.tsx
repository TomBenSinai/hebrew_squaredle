import type { CSSProperties } from "react";
import { Button, LockIcon, Modal, SheetBody } from "../components";
import "./MiniModal.css";

// A ריבועוני spelling מילה: down, a diagonal step, then up, lit in amber.
const ROWS = [["ק", "מ", "ט"], ["ה", "י", "ר"], ["ל", "ב", "ע"]];
const PATH: [number, number][] = [[0, 1], [1, 1], [2, 0], [1, 0]];
const X = (col: number) => (2 - col) * 56 + 26;    // RTL: column 0 is the rightmost
const Y = (row: number) => row * 56 + 26;

function MiniDemo() {
  const order = new Map(PATH.map(([r, c], i) => [r * 3 + c, i]));
  return (
    <div className="minidemo">
      <svg viewBox="-4 -4 168 168" role="img" aria-label="ריבועוני: לוח של 3 על 3, ובו המילה מילה">
        <polyline pathLength={100} points={PATH.map(([r, c]) => `${X(c)},${Y(r)}`).join(" ")} />
        {ROWS.map((row, r) => row.map((letter, c) => {
          const lit = order.get(r * 3 + c);
          return (
            <g key={`${r}-${c}`} className={lit === undefined ? undefined : "on"}
              style={{ "--i": r * 3 + c, "--lit": lit ?? 0 } as CSSProperties}>
              <rect x={X(c) - 24} y={Y(r) - 24} width="48" height="48" rx="6" />
              <text x={X(c)} y={Y(r)} textAnchor="middle" dominantBaseline="central">{letter}</text>
            </g>
          );
        }))}
      </svg>
      <span className="minilock"><LockIcon /></span>
    </div>
  );
}

/** ריבועוני is for logged-in players: what a logged-out one gets from its switch. */
export function MiniModal({ open, onClose, onLogin }: { open: boolean; onClose: () => void; onLogin: () => void }) {
  return (
    <Modal open={open} onClose={onClose} sheetClassName="minicard"
      title={<span className="minititle">ריבועונ<span className="mini-yod">י</span></span>}>
      <SheetBody className="minibody">
        <MiniDemo />
        <p className="minilead">ריבועון קטן, 3 על 3</p>
        <p className="minitext">קליל וכיף לפתור עם הקפה של הבוקר או ממש לפני השינה.</p>
        <p className="minitext">הריבועוני זמין למשתמשים מחוברים.</p>
        <div className="miniactions">
          <Button variant="primary" onClick={onLogin}>התחברות</Button>
          <button type="button" className="linkish" onClick={onClose}>אולי אחר כך</button>
        </div>
      </SheetBody>
    </Modal>
  );
}
