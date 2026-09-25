import type { CSSProperties } from "react";
import { Button, Modal, SheetBody } from "../components";
import "./HelpModal.css";

const SEEN_KEY = "rivuon:help-seen";

// Some browsers (Safari in private mode) read storage fine but throw on write,
// which would reopen the rules on every load. Fall back to sessionStorage, which
// survives a refresh, and then to memory.
let seenInMemory = false;

/** Has the player already been shown the rules? (true when storage is unreadable.) */
export function helpSeen(): boolean {
  if (seenInMemory) return true;
  try { return localStorage.getItem(SEEN_KEY) === "1" || sessionStorage.getItem(SEEN_KEY) === "1"; }
  catch { return true; }
}

export function markHelpSeen() {
  seenInMemory = true;
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode etc. */ }
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* ditto */ }
}

/** Stagger: the nth block drifts in a beat after the one before it. */
const at = (i: number) => ({ "--i": i } as CSSProperties);

// A 3x3 board spelling שלום: sideways, one diagonal step, then down, so the
// demo shows a path doing what the rules say it may do.
const ROWS = [["ש", "ל", "ק"], ["ר", "ד", "ו"], ["ג", "י", "מ"]];
const PATH: [number, number][] = [[0, 0], [0, 1], [1, 2], [2, 2]];
const X = (col: number) => (2 - col) * 52 + 22;    // RTL: column 0 is the rightmost
const Y = (row: number) => row * 52 + 22;

function SwipeDemo() {
  const on = new Set(PATH.map(([r, c]) => r * 3 + c));
  return (
    <svg className="helpdemo" viewBox="-2 -2 152 152" role="img" aria-label="הדגמה: החלקה על האותיות ש־ל־ו־מ">
      <polyline pathLength={100} points={PATH.map(([r, c]) => `${X(c)},${Y(r)}`).join(" ")} />
      {ROWS.map((row, r) => row.map((letter, c) => (
        <g key={`${r}-${c}`} className={on.has(r * 3 + c) ? "on" : undefined}>
          <rect x={X(c) - 22} y={Y(r) - 22} width="44" height="44" rx="5" />
          <text x={X(c)} y={Y(r)} textAnchor="middle" dominantBaseline="central">{letter}</text>
        </g>
      )))}
    </svg>
  );
}

/** The rules of the game. Opens by itself the first time someone plays. */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="איך משחקים" sheetClassName="helpcard">
      <SheetBody className="helpbody">
        <p className="helplead" style={at(0)}>ריבועון חדש כל יום</p>

        <div className="helpsec" style={at(1)}>
          <SwipeDemo />
          <p className="helpcap">החלקה אחת, מילה אחת: <b>שלום</b></p>
        </div>

        <section className="helpsec" style={at(2)}>
          <h3>הכללים</h3>
          <ul>
            <li><b>החליקו</b> על אותיות שנוגעות זו בזו, בכל שמונה הכיוונים, כדי ליצור מילים</li>
            <li><b>אי אפשר לחזור</b> על אותה משבצת פעמיים</li>
            <li><b>מילים של ארבע אותיות ומעלה</b></li>
            <li><b>אותיות סופיות הן אותיות רגילות</b> - כשאות מגיעה בסוף המילה היא הופכת אוטומטית לאות הסופית</li>
            <li>אות מאפירה כשאין בה עוד צורך לאף מילה מרכזית שנותרה. אפשר עדיין להשתמש בה כדי ליצור מילות בונוס</li>
            <li><b>מספרים על האותיות</b> - ככל שמתקדמים נפתח רמז, והסימן על פס ההתקדמות מראה מתי: יופיע <b className="hintstarts">מספר אדום</b> למעלה - כמה מילים מרכזיות שמתחילות באות נותרו</li>
          </ul>
        </section>

        <section className="helpsec" style={at(3)}>
          <h3>סוגי מילים</h3>
          <ul>
            <li><b>מילים מרכזיות</b> - מילים נפוצות שנמצאות בלוח של היום</li>
            <li><b className="bonusword">מילות בונוס</b> - מילים עם צורות מיוחדות יותר - סמיכות, הטיה (ילדיו, ארונה), ומילות סלנג. הן שוות כפול נקודות אבל לא צריך אותן כדי לסיים את הלוח היומי</li>
            <li><b>לא כל הטיה נחשבת</b> - בעברית יש המון הטיות לכל מילה, ואם כולן היו נכנסות, רשימת מילות הבונוס הייתה עצומה. לכן הטיות נדירות מאוד לא נחשבות, גם אם הן תקינות. יכול לקרות שצורה אחת של מילה נחשבת ואחרת לא (ליבתו כן, ליבתכם לא)</li>
            <li><b>★ מילות נושא</b> - מילים המופיעות בימים עם משמעות מיוחדת כמו חגים או מועדים נוספים</li>
          </ul>
        </section>

        <section className="helpsec" style={at(4)}>
          <h3>כפתורים</h3>
          <ul>
            <li><b>לחיצה על מספר המילים</b> פותחת את רשימת המילים שמצאתם</li>
            <li><b>כפתור הסיבוב</b> מסובב את הלוח. עוזר אם צריכים רענון או זווית אחרת על האותיות</li>
            <li><b>לחיצה על מילה</b> תפתח את ההגדרה שלה במילוג</li>
            <li><b>ארכיון</b> פותח רשימה של ימי עבר</li>
          </ul>
        </section>

        <div className="helpactions" style={at(5)}>
          <Button variant="primary" onClick={onClose}>יאללה, מתחילים</Button>
        </div>
      </SheetBody>
    </Modal>
  );
}
