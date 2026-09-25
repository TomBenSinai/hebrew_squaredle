import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, SheetBody } from "../components";
import { useSwipe } from "../hooks/useSwipe";
import { norm, withFinal } from "../lib/hebrew";
import { findPath, makeLayout } from "../lib/layout";
import { MIN_LEN, type Toast } from "../state/useGame";
import { Board, boardVars } from "./Board";
import { Readout } from "./Readout";
import "./Tutorial.css";

// A practice board with gaps, holding שלום and מוצר and no other word (main,
// bonus or blocked; checked with wordgame.solve). The two share ו and מ, so
// finding שלום greys ש and ל while ו and מ stay lit for מוצר.
const MASK = ["XX.", "..X", "XXX"];
const LETTERS = "שלורצמ";
const WORDS = ["שלום", "מוצר"];

const STEPS = [
  <>החליקו את האצבע על <b>ש</b>, <b>ל</b>, <b>ו</b>, <b>ם</b> בלי להרים אותה, כדי ליצור את המילה <b>שלום</b>. אפשר לזוז לכל כיוון, גם באלכסון.</>,
  <><b>ש</b> ו-<b>ל</b> האפירו: אף מילה שנותרה לא צריכה אותן. <b>ו</b> ו-<b>מ</b> נשארו, כי עוד מילה עוברת בהן. מצאו אותה.</>,
  <>כל האותיות אפורות, כלומר מצאתם את כל המילים והלוח פתור. בלוח היומי מחכות לכם עשרות מילים של ארבע אותיות ומעלה.</>,
];

/** A first visit starts here: a tiny board to learn the swipe and the grey letters. */
export function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const layout = useMemo(() => makeLayout(MASK, LETTERS, 0), []);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flash, setFlash] = useState<number[] | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const next = WORDS[found.length];
  const submit = (path: number[]) => {
    const key = path.map(i => layout.letters[i]).join("");
    const word = WORDS.find(w => norm(w) === key);
    if (key.length < MIN_LEN) {
      if (key.length > 1) setToast({ kind: "info", text: "צריך לפחות 4 אותיות" });
    } else if (!word) {
      setToast({ kind: "bad", text: `${withFinal(key)} לא ברשימה` });
    } else if (found.includes(word)) {
      setToast({ kind: "info", text: `${word} כבר נמצאה` });
    } else if (word !== next) {
      setToast({ kind: "info", text: `נכון! אבל קודם ${next}` });
    } else {
      setFound([...found, word]);
      setToast({ kind: "main", text: word });
      clearTimeout(flashTimer.current);
      setFlash(path);
      flashTimer.current = setTimeout(() => setFlash(null), 1600);
    }
  };
  const tap = () => setToast({ kind: "info", text: "מחליקים את האצבע, לא מקישים" });
  const { path, handlers } = useSwipe(layout, tileRefs, submit, !next, tap);

  // letters no word still to find passes through
  const live = useMemo(() => new Set(
    WORDS.filter(w => !found.includes(w)).flatMap(w => findPath(layout, w) ?? []),
  ), [layout, found]);

  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const done = !next;
  return (
    <Modal open={open} onClose={onClose} title="איך משחקים" sheetClassName="tutcard">
      <SheetBody className="tutbody">
        <p key={found.length} className="tutstep" aria-live="polite">{STEPS[found.length]}</p>
        <div className="boardwrap tutboard" style={boardVars(layout)}>
          <Readout current={swiping} toast={toast} onWord={() => {}} />
          <Board layout={layout} path={path} live={live} hints={null}
            flash={flash && { cells: flash, bonus: false }} spin="idle"
            tileRefs={tileRefs} handlers={handlers} />
        </div>
        <div className="tutactions">
          {done
            ? <Button variant="primary" onClick={onClose}>יאללה, מתחילים</Button>
            : <button type="button" className="tutskip" onClick={onClose}>דלגו על ההדרכה</button>}
        </div>
      </SheetBody>
    </Modal>
  );
}
