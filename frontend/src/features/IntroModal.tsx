import { useRef, type ReactNode } from "react";
import { Button, Modal, SheetBody } from "../components";
import type { HintId } from "../lib/scoring";
import "./IntroModal.css";

/** Something the player meets for the first time and gets a card about, once. */
export type Intro =
  | { kind: "hint"; hint: HintId }
  | { kind: "bonus"; word: string }
  | { kind: "theme"; word: string; theme: string | null };

/** The name it is remembered by (lib/seen). */
export const introName = (i: Intro) => (i.kind === "hint" ? `hint:${i.hint}` : i.kind);

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

const HINT_CARDS: Record<HintId, { head: string; body: ReactNode }> = {
  sort: {
    head: "מיון לפי א-ב",
    body: (
      <>
        <p>ברשימת המילים נוסף כפתור <b>מיון לפי א-ב</b>.</p>
        <p>הוא מסדר כל קבוצה לפי סדר האלפבית במקום לפי סדר המציאה, כך שקל יותר לראות מה כבר יש לכם ואיפה בסדר הזה עוד חסר.</p>
      </>
    ),
  },
  reveal: {
    head: "אותיות נחשפות",
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
    head: "מספרים על האותיות",
    body: (
      <>
        <p>על אותיות הלוח יופיע עכשיו <b className="hintstarts">מספר אדום קטן</b>: כמה מילים מרכזיות שעוד לא מצאתם <b>מתחילות</b> באות הזו.</p>
        <p>אות בלי מספר היא אות שאף מילה שנותרה לא מתחילה בה.</p>
      </>
    ),
  },
  uses: {
    head: "מספרים על האותיות",
    body: (
      <>
        <p>בפינה השנייה של כל אות יופיע עכשיו <b className="hintuses">מספר כחול</b>: כמה מילים מרכזיות שנותרו <b>עוברות</b> דרך האות, ולא רק מתחילות בה.</p>
      </>
    ),
  },
};

function content(i: Intro): { title: string; head: string; className: string; body: ReactNode } {
  switch (i.kind) {
    case "hint":
      return { title: "נפתח רמז חדש", className: `hint-${i.hint}`, ...HINT_CARDS[i.hint] };
    case "bonus":
      return {
        title: "מילת בונוס", head: i.word, className: "hint-bonus",
        body: (
          <>
            <p>מילות בונוס הן צורות פחות נפוצות של מילים: סמיכות, הטיות וסלנג. למשל <b>גינה</b> היא מילה מרכזית, ו-<b className="bonusword">גינת</b> (כמו בגינת הילדים) היא מילת בונוס.</p>
            <p>הן נספרות בנפרד, ליד מספר המילים (<bdi dir="ltr">+1</bdi>), ולא צריך אותן כדי לסיים את הלוח.</p>
            <p>גם אותיות שהאפירו יכולות להיות חלק ממילת בונוס.</p>
          </>
        ),
      };
    case "theme":
      return {
        title: "מילת נושא", head: `★ ${i.word}`, className: "hint-theme",
        body: (
          <>
            <p>בימים מיוחדים, כמו חגים, הלוח מסתיר מילים שקשורות לנושא של היום{i.theme && <> (<b>{i.theme}</b>)</>}.</p>
            <p>מילות נושא הן מילים מרכזיות רגילות ונספרות במספר המילים. ברשימת המילים הן מופיעות ראשונות, בקבוצה משלהן עם ★, שמראה גם כמה מהן נותרו.</p>
          </>
        ),
      };
  }
}

/** Explains a hint, a bonus word or a theme word, the first time the player gets one. */
export function IntroModal({ intro, onClose }: { intro: Intro | null; onClose: () => void }) {
  // keep the last card's text while the modal animates shut
  const last = useRef<Intro | null>(null);
  if (intro) last.current = intro;
  const c = last.current && content(last.current);
  return (
    <Modal open={!!intro} onClose={onClose} title={c?.title ?? ""} sheetClassName="introcard" layer={30}>
      <SheetBody className="introbody">
        <h3 className={c ? `introhead ${c.className}` : "introhead"}>{c?.head}</h3>
        {c?.body}
        <div className="introactions">
          <Button variant="primary" onClick={onClose}>הבנתי</Button>
        </div>
      </SheetBody>
    </Modal>
  );
}
