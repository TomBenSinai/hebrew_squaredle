import type { CSSProperties } from "react";
import { Button, Modal, SheetBody } from "../components";
import "./HelpModal.css";

const SEEN_KEY = "rivuon:help-seen";

/** Has the player already been shown the rules? (true when storage is unavailable.) */
export function helpSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}

export function markHelpSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode etc. */ }
}

/** Stagger: the nth block drifts in a beat after the one before it. */
const at = (i: number) => ({ "--i": i } as CSSProperties);

// A 3x3 board spelling שלום, to show what a swipe looks like.
const ROWS = [["ש", "ל", "ד"], ["ר", "ו", "מ"], ["ג", "י", "ת"]];
const PATH: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 2]];
const X = (col: number) => (2 - col) * 52 + 22;    // RTL: column 0 is the rightmost
const Y = (row: number) => row * 52 + 22;

function SwipeDemo() {
  const on = new Set(PATH.map(([r, c]) => r * 3 + c));
  return (
    <svg className="helpdemo" viewBox="0 0 148 148" role="img" aria-label="הדגמה: החלקה על האותיות ש־ל־ו־מ">
      <polyline points={PATH.map(([r, c]) => `${X(c)},${Y(r)}`).join(" ")} />
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
        <p className="helplead" style={at(0)}>ריבועון חדש בכל יום, ואותו הלוח לכולם.</p>

        <div className="helpsec" style={at(1)}>
          <SwipeDemo />
          <p className="helpcap">החלקה אחת, מילה אחת: <b>שלום</b></p>
        </div>

        <section className="helpsec" style={at(2)}>
          <h3>הכללים</h3>
          <ul>
            <li><b>החליקו</b> על אותיות שנוגעות זו בזו — בכל שמונה הכיוונים, והמסלול יכול להתפתל כרצונכם.</li>
            <li><b>כל משבצת פעם אחת</b> בכל מילה. חור בלוח, בימים עם צורה מיוחדת, חוסם את המעבר.</li>
            <li><b>ארבע אותיות ומעלה.</b></li>
            <li><b>אותיות סופיות</b> (ך ם ן ף ץ) הן אותן משבצות כמו כ מ נ פ צ — מחליקים על מ בשביל ם, והמשחק מציג את הכתיב הנכון.</li>
          </ul>
        </section>

        <section className="helpsec" style={at(3)}>
          <h3>סוגי מילים</h3>
          <ul>
            <li><b>מילים ראשיות</b> הן המילים הנפוצות של היום. מציאת כולן מסיימת את הלוח.</li>
            <li><b className="bonusword">מילות בונוס</b> הן צורות נדירות יותר, נסמך וקניין (גינת, ספריו) וסלנג. הן שוות כפול, אבל אין צורך בהן כדי לסיים.</li>
            <li><b>★ מילות נושא</b> מופיעות בימים נושאיים, שייכות לנושא היום ומקובצות בנפרד.</li>
          </ul>
        </section>

        <section className="helpsec" style={at(4)}>
          <h3>על המסך</h3>
          <ul>
            <li><b>המונה הגדול</b> סופר מילים ראשיות. הפס שמתחתיו מתמלא לפי אותיות, כך שמילים ארוכות מקדמות יותר.</li>
            <li>אות שאף מילה ראשית שנותרה לא משתמשת בה מאפירה.</li>
            <li><b>סיבוב</b> מסובב את הלוח ברבע סיבוב — אותו לוח, מבט חדש.</li>
            <li><b>המילים</b> מראה את מה שמצאתם. מילים שטרם נמצאו לעולם לא נחשפות, רק נספרות.</li>
            <li><b>ארכיון</b> פותח כל יום שכבר היה, עם ההתקדמות שלכם בו.</li>
            <li>לחיצה על מילה שמצאתם פותחת את ההגדרה שלה.</li>
          </ul>
        </section>

        <p className="helpnote" style={at(5)}>ההתקדמות נשמרת מעצמה — אפשר לעצור ולחזור בכל רגע.</p>
        <div className="helpactions" style={at(5)}>
          <Button variant="primary" onClick={onClose}>יאללה, מתחילים</Button>
        </div>
      </SheetBody>
    </Modal>
  );
}
