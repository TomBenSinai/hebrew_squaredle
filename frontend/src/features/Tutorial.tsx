import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Pill } from "../components";
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
import { ArchivePill, HelpPill, MastheadFrame } from "./Masthead";
import { Readout } from "./Readout";
import { Score } from "./Score";
import { SpinButton } from "./SpinButton";
import { WordsModal } from "./WordsModal";
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
    text: <>החליקו על <b>ש</b>, <b>ל</b>, <b>ו</b>, <b>מ</b> בלי להרים את האצבע.</>,
    aside: <>אפשר לזוז לכל כיוון, גם באלכסון.</>,
  },
  {
    head: "שלום גם לכם!",
    text: <>יש עוד מילה על הלוח. מצאו אותה.</>,
    aside: <>אות אפורה כבר לא נחוצה לאף מילה.</>,
  },
  {
    head: "פתרתם את הלוח",
    text: <>לחצו על <b>מספר המילים</b> כדי לראות את הרשימה.</>,
  },
  {
    head: "אתם מוכנים",
    text: <>ה<b>סיבוב</b> מסובב את הלוח, וב<b>ארכיון</b> יש ימים קודמים.</>,
    aside: <>לחיצה על מילה ברשימה מראה את פירושה. לחצו על <b>?</b> כדי להגיע לכל החוקים.</>,
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
  const [listed, setListed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { phase, turns, spin } = useSpin(() => setRot(r => (r + 1) % 4));

  const next = WORDS[found.length];
  const step = next ? found.length : listed ? 3 : 2;

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
  // opening the list once the board is solved finishes step 3
  const openWords = () => { setWordsOpen(true); if (!next) setListed(true); };
  const define = (w: string) => setDefWord(w);
  const showOnBoard = (w: string) => { setDefWord(null); setWordsOpen(false); showWord(w); };
  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const flash = flashWord ? { cells: findPath(layout, flashWord) ?? [], bonus: false } : null;

  return (
    <section className="play tutorial" aria-label="איך משחקים">
      <MastheadFrame when={<><b>איך משחקים</b> · {step + 1} מתוך {STEPS.length}</>}>
        {step < 3
          ? <Pill className="tutskip" onClick={onDone}>דילוג</Pill>
          : <>
              <ArchivePill className="tutnew"
                onClick={() => setToast({ kind: "info", text: "הארכיון נפתח מתוך המשחק" })} />
              <HelpPill className="tutnew" onClick={() => setHelpOpen(true)} />
            </>}
      </MastheadFrame>

      {/* the first step is only the swipe: the score comes in with the first word.
          Step 3 points at what to tap: the count. */}
      {step > 0 && (
        <div className={step === 2 && !wordsOpen ? "tutnew tutcue" : "tutnew"}>
          <Score found={found.length} total={WORDS.length} bonus={0} rank={rankFor(fraction)}
            fraction={fraction} onOpen={openWords} />
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
            <SpinButton turns={turns} onClick={spin} />
          </div>
          <Button variant="primary" onClick={onDone}>יאללה, מתחילים</Button>
        </>}
      </div>

      <WordsModal open={wordsOpen} onClose={() => setWordsOpen(false)}
        board={BOARD} found={foundWords}
        fresh={found.at(-1) ?? null} reveals={null} hintsOpen={NO_HINTS} az={false} onToggleSort={() => {}}
        onWord={define} />
      <DefinitionModal word={defWord} onClose={() => setDefWord(null)} onShow={showOnBoard} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
