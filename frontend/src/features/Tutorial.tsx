import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, CalendarIcon, Pill, RotateIcon } from "../components";
import type { FoundWord, PublicBoard } from "../api/types";
import { useFlash } from "../hooks/useFlash";
import { useSpin } from "../hooks/useSpin";
import { useSwipe } from "../hooks/useSwipe";
import { norm, withFinal } from "../lib/hebrew";
import { findPath, makeLayout } from "../lib/layout";
import { letterFraction, rankFor } from "../lib/scoring";
import { MIN_LEN, say, type Toast } from "../state/useGame";
import { Board, boardVars } from "./Board";
import { DefinitionModal } from "./DefinitionModal";
import { HelpModal } from "./HelpModal";
import { Readout } from "./Readout";
import { Score } from "./Score";
import { WordsModal } from "./WordsModal";
import "./Masthead.css";
import "./Tutorial.css";

// A practice board with gaps, holding שלום and מוצר and no other word (main,
// bonus or blocked; checked with wordgame.solve). The two share ו and מ, so
// finding שלום greys ש and ל while ו and מ stay lit for מוצר.
const MASK = ["XX.", "..X", "XXX"];
const LETTERS = "שלורצמ";
const WORDS = ["שלום", "מוצר"];
// the practice board as the real word list and score expect one
const BOARD: PublicBoard = {
  date: "", number: 0, shapeName: "", theme: null, letters: LETTERS, mask: MASK,
  mainTotal: WORDS.length, mainLetters: LETTERS.length,
  groups: [{ length: 4, total: WORDS.length }], bonusTotal: 0, themeTotal: 0,
};
const NO_HINTS = new Set<never>();

// Each step: a warm line, one plain instruction, and the fine print, quieter.
const STEPS: { head: string; text: ReactNode; aside?: ReactNode }[] = [
  {
    head: "ברוכים הבאים לריבועון",
    text: <>נתחיל ממילה אחת: החליקו על <b>ש</b>, <b>ל</b>, <b>ו</b>, <b>מ</b> בלי להרים את האצבע.</>,
    aside: <>אפשר לזוז לכל כיוון, גם באלכסון. ובסוף מילה, <b>מ</b> הופכת לבד ל-<b>ם</b>.</>,
  },
  {
    head: "שלום גם לכם!",
    text: <><b>ש</b> ו-<b>ל</b> האפירו, כי אף מילה אחרת לא צריכה אותן. באותיות שנשארו מסתתרת עוד מילה.</>,
    aside: <>אות אפורה אומרת שכבר אין בה מה לחפש.</>,
  },
  {
    head: "פתרתם את הלוח",
    text: <>לחצו על <b>מספר המילים</b> למעלה כדי לראות את הרשימה, ועל מילה ברשימה כדי לראות מה פירושה.</>,
  },
  {
    head: "אתם מוכנים",
    text: <>כפתור <b>הסיבוב</b> מסובב את הלוח, כשרוצים זווית חדשה. ב<b>ארכיון</b> מחכים הלוחות של ימים קודמים.</>,
    aside: <>וכל הכללים, מתי שתרצו, מאחורי ה-<b>?</b>.</>,
  },
];

/** A first visit starts here, in place of the game: a tiny board to learn the
    swipe and the grey letters, then the word list, definitions and the buttons. */
export function Tutorial({ onDone }: { onDone: () => void }) {
  const [rot, setRot] = useState(0);
  const layout = useMemo(() => makeLayout(MASK, LETTERS, rot), [rot]);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flashWord, showWord] = useFlash<string>();
  const [wordsOpen, setWordsOpen] = useState(false);
  const [defWord, setDefWord] = useState<string | null>(null);
  const [defined, setDefined] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { phase, turns, spin } = useSpin(() => setRot(r => (r + 1) % 4));

  const next = WORDS[found.length];
  const step = next ? found.length : defined ? 3 : 2;

  const submit = (path: number[]) => {
    const key = path.map(i => layout.letters[i]).join("");
    const word = WORDS.find(w => norm(w) === key);
    if (key.length < MIN_LEN) setToast(say.tooShort(key));
    else if (!word) setToast(say.notInList(key));
    else if (found.includes(word)) setToast(say.again(word));
    else if (word !== next) setToast({ kind: "info", text: `נכון! אבל קודם ${next}` });
    else {
      setFound([...found, word]);
      setToast(say.found(word));
      showWord(word);
    }
  };
  const tap = () => setToast({ kind: "info", text: "מחליקים את האצבע, לא מקישים" });
  const { path, handlers } = useSwipe(layout, tileRefs, submit, phase !== "idle", tap);

  // letters no word still to find passes through
  const live = useMemo(() => new Set(
    WORDS.filter(w => !found.includes(w)).flatMap(w => findPath(layout, w) ?? []),
  ), [layout, found]);

  const foundWords: FoundWord[] = found.map(w => ({ w, cat: "main" }));
  const fraction = letterFraction(foundWords, BOARD.mainLetters);
  const define = (w: string) => { setDefWord(w); setDefined(true); };
  const showOnBoard = (w: string) => { setDefWord(null); setWordsOpen(false); showWord(w); };
  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const flash = flashWord ? { cells: findPath(layout, flashWord) ?? [], bonus: false } : null;

  return (
    <section className="play tutorial" aria-label="איך משחקים">
      <header className="masthead">
        <div className="brand">
          <h1>ריבועון</h1>
          <div className="when"><b>איך משחקים</b> · {step + 1} מתוך {STEPS.length}</div>
        </div>
        <div className="headbtns">
          {step < 3
            ? <Pill className="tutskip" onClick={onDone}>דילוג</Pill>
            : <>
                <Pill className="cal tutnew" icon={<CalendarIcon />} aria-label="ארכיון" title="ארכיון"
                  onClick={() => setToast({ kind: "info", text: "הארכיון נפתח מתוך המשחק" })}>
                  <span className="pilllabel">ארכיון</span>
                </Pill>
                <Pill className="round tutnew" aria-label="איך משחקים" title="איך משחקים"
                  onClick={() => setHelpOpen(true)}>?</Pill>
              </>}
        </div>
      </header>

      {/* the first step is only the swipe: the score comes in with the first word.
          Step 3 points at what to tap: the count, then the words in the list. */}
      {step > 0 && (
        <div className={step === 2 && !wordsOpen ? "tutnew tutcue" : "tutnew"}>
          <Score found={found.length} total={WORDS.length} bonus={0} rank={rankFor(fraction)}
            fraction={fraction} onOpen={() => setWordsOpen(true)} />
        </div>
      )}

      {/* one live region whose text changes, so screen readers read every step */}
      <p className="tutstep" aria-live="polite">
        <span key={step}>
          <span className="tuthead">{STEPS[step].head}</span>{" "}
          <span className="tuttext">{STEPS[step].text}</span>{" "}
          {STEPS[step].aside && <span className="tutaside">{STEPS[step].aside}</span>}
        </span>
      </p>

      <div className="boardwrap" style={boardVars(layout)}>
        <Readout current={swiping} toast={toast} onWord={define} />
        <Board layout={layout} path={path} live={live} hints={null} flash={flash} spin={phase}
          tileRefs={tileRefs} handlers={handlers} />
      </div>

      <div className="tutactions">
        {step === 3 && <>
          <div className="tools tutnew">
            <Pill className="round spinbtn" aria-label="סיבוב הלוח" onClick={spin}>
              <span className="spinicon" style={{ transform: `rotate(${turns * -90}deg)` }}><RotateIcon /></span>
              <span className="tip" aria-hidden="true">סיבוב</span>
            </Pill>
          </div>
          <Button variant="primary" onClick={onDone}>יאללה, מתחילים</Button>
        </>}
      </div>

      <WordsModal open={wordsOpen} onClose={() => setWordsOpen(false)} sheetClassName={defined ? undefined : "tutcue"}
        board={BOARD} found={foundWords}
        fresh={found.at(-1) ?? null} reveals={null} hintsOpen={NO_HINTS} az={false} onToggleSort={() => {}}
        onWord={define} />
      <DefinitionModal word={defWord} onClose={() => setDefWord(null)} onShow={showOnBoard} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
