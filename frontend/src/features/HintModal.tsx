import { useRef, type ReactNode } from "react";
import { Button, Modal, SheetBody } from "../components";
import type { HintId } from "../lib/scoring";
import "./HintModal.css";

const SEEN_KEY = "rivuon:hints-seen";

// Storage can be readable but not writable (Safari in private mode), which
// would pop the same explanation on every load. Keep a copy in memory too.
const seenInMemory = new Set<HintId>();

function stored(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]; } catch { return []; }
}

/** Has this hint already been explained to the player? */
export function hintSeen(id: HintId): boolean {
  return seenInMemory.has(id) || stored().includes(id);
}

export function markHintSeen(id: HintId) {
  seenInMemory.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...stored(), id])])); }
  catch { /* private mode etc. */ }
}

/** A slot as the words list draws it, for the reveal hint's example. */
function SlotDemo({ pre, blanks, post }: { pre: string; blanks: number; post?: string }) {
  return (
    <span className="slot">
      <span className="on">{pre}</span>
      {Array.from({ length: blanks }, (_, i) => <span key={i} className="off">·</span>)}
      {post && <span className="on">{post}</span>}
    </span>
  );
}

const HELP: Record<HintId, { title: string; body: ReactNode }> = {
  sort: {
    title: "מיון לפי א-ב",
    body: (
      <>
        <p>ברשימת המילים נוסף כפתור <b>מיון לפי א-ב</b>.</p>
        <p>הוא מסדר כל קבוצה לפי סדר האלפבית במקום לפי סדר המציאה, כך שקל יותר לראות מה כבר יש לכם ואיפה בסדר הזה עוד חסר.</p>
      </>
    ),
  },
  reveal: {
    title: "אותיות נחשפות",
    body: (
      <>
        <p>ברשימת המילים מופיעה עכשיו שורה לכל מילה מרכזית שעוד לא מצאתם, עם חלק מהאותיות שלה גלויות.</p>
        <ul className="hintdemo">
          <li><SlotDemo pre="ש" blanks={3} /> <span>ארבע או חמש אותיות: האות הראשונה</span></li>
          <li><SlotDemo pre="ש" blanks={4} post="ם" /> <span>שש אותיות: הראשונה והאחרונה</span></li>
          <li><SlotDemo pre="שמ" blanks={4} post="ם" /> <span>שבע אותיות: שתי הראשונות והאחרונה</span></li>
        </ul>
        <p>ככל שהמילה ארוכה יותר, כך נחשפות עוד אותיות בקצוות. האמצע תמיד נשאר סגור.</p>
      </>
    ),
  },
  starts: {
    title: "מספרים על האותיות",
    body: (
      <>
        <p>על אותיות הלוח יופיע עכשיו <b className="hintstarts">מספר אדום קטן</b>: כמה מילים מרכזיות שעוד לא מצאתם <b>מתחילות</b> באות הזו.</p>
        <p>אות בלי מספר היא אות שאף מילה שנותרה לא מתחילה בה.</p>
      </>
    ),
  },
  uses: {
    title: "מספרים על האותיות",
    body: (
      <>
        <p>בפינה השנייה של כל אות יופיע עכשיו <b className="hintuses">מספר כחול</b>: כמה מילים מרכזיות שנותרו <b>עוברות</b> דרך האות, ולא רק מתחילות בה.</p>
      </>
    ),
  },
};

/** Explains a hint the first time the player gets it. */
export function HintModal({ hint, onClose }: { hint: HintId | null; onClose: () => void }) {
  // keep the last hint's text while the modal animates shut
  const last = useRef<HintId | null>(null);
  if (hint) last.current = hint;
  const shown = hint ?? last.current;
  const help = shown && HELP[shown];
  return (
    <Modal open={!!hint} onClose={onClose} title="נפתח רמז חדש" sheetClassName="hintcard" layer={30}>
      <SheetBody className="hintbody">
        <h3 className={shown ? `hinthead hint-${shown}` : "hinthead"}>{help?.title}</h3>
        {help?.body}
        <div className="hintactions">
          <Button variant="primary" onClick={onClose}>הבנתי</Button>
        </div>
      </SheetBody>
    </Modal>
  );
}
