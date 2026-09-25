import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Pill, RotateIcon } from "./components";
import { api } from "./api/client";
import type { DaysResponse } from "./api/types";
import { ArchiveModal } from "./features/ArchiveModal";
import { Board, boardVars } from "./features/Board";
import { DefinitionModal } from "./features/DefinitionModal";
import { HelpModal, helpSeen, markHelpSeen } from "./features/HelpModal";
import { HintModal, hintSeen, markHintSeen } from "./features/HintModal";
import { Masthead } from "./features/Masthead";
import { Readout } from "./features/Readout";
import { Score } from "./features/Score";
import { useWordSort, WordsModal, WordsPanel } from "./features/WordsModal";
import { useSpin } from "./hooks/useSpin";
import { useSwipe } from "./hooks/useSwipe";
import { withFinal } from "./lib/hebrew";
import { HINTS, letterFraction, openHints, rankFor, totalPoints, type HintId } from "./lib/scoring";
import { progressStore } from "./state/progressStore";
import { useGame, type Game } from "./state/useGame";
import "./App.css";

export default function App() {
  const [days, setDays] = useState<DaysResponse | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // merge server progress into local storage before the first board shows
    Promise.all([api.days(), progressStore.sync()])
      .then(([d]) => { setDays(d); setDate(d.days.at(-1)?.date ?? null); })
      .catch(() => setLoadError(true));
  }, []);

  const { game, error } = useGame(date);

  if (loadError || error) return <div className="app"><p className="status">לא הצלחנו לטעון את המשחק. נסו לרענן.</p></div>;
  if (!days || !game) return <div className="app"><p className="status">טוען…</p></div>;
  return <Play days={days} game={game} setDate={setDate} />;
}

function Play({ days, game, setDate }: { days: DaysResponse; game: Game; setDate: (d: string) => void }) {
  const { board, layout, found } = game;
  const [wordsOpen, setWordsOpen] = useState(false);
  // one sort for both word lists: the side panel and the modal are both mounted
  const { az, toggleSort } = useWordSort();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [defWord, setDefWord] = useState<string | null>(null);
  // the rules greet a first-time player, once
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen());
  const closeHelp = () => { setHelpOpen(false); markHelpSeen(); };

  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { phase, turns, spin } = useSpin(game.rotate);
  const { path, handlers } = useSwipe(layout, tileRefs, game.submit, phase !== "idle");

  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const isToday = board.date === days.today;
  const mainFound = found.filter(f => f.cat === "main").length;
  const fraction = letterFraction(found, board.mainLetters);

  // each hint is explained once, the first time this player ever gets it
  const hintsOpen = useMemo(() => openHints(fraction), [fraction]);
  const [hintIntro, setHintIntro] = useState<HintId | null>(null);
  const nextUnexplained = useCallback(
    (open: Set<HintId>) => HINTS.find(h => open.has(h.id) && !hintSeen(h.id))?.id ?? null,
    [],
  );
  useEffect(() => {
    const next = nextUnexplained(hintsOpen);
    if (next) setHintIntro(next);
  }, [hintsOpen, nextUnexplained]);
  const closeHintIntro = () => {
    if (hintIntro) markHintSeen(hintIntro);
    setHintIntro(nextUnexplained(hintsOpen));
  };

  const pickDay = (d: string) => { setArchiveOpen(false); if (d !== board.date) setDate(d); };
  const showOnBoard = useCallback((w: string) => {
    setDefWord(null);
    setWordsOpen(false);
    game.showWord(w);
  }, [game]);

  return (
    <div className="app">
      <section className="play" aria-label="הלוח">
        <Masthead day={board} isToday={isToday} canGoToday={days.days.some(d => d.date === days.today)}
          onToday={() => setDate(days.today)} onArchive={() => setArchiveOpen(true)}
          onHelp={() => setHelpOpen(true)} />

        <Score found={mainFound} total={board.mainTotal} points={totalPoints(found)} rank={rankFor(fraction)}
          fraction={fraction} fresh={game.fresh} />

        <div className="boardwrap" style={boardVars(layout)}>
          <Readout current={swiping || game.pending || ""} waiting={!swiping && !!game.pending}
            toast={game.toast} onWord={setDefWord} />
          <Board layout={layout} path={path} live={game.live} hints={game.hints} flash={game.flash} spin={phase}
            tileRefs={tileRefs} handlers={handlers} />
        </div>

        <div className="tools">
          <Pill className="round spinbtn" aria-label="סיבוב הלוח" onClick={spin}>
            <span className="spinicon" style={{ transform: `rotate(${turns * -90}deg)` }}><RotateIcon /></span>
            <span className="tip" aria-hidden="true">סיבוב</span>
          </Pill>
          <Button className="wordsbtn" onClick={() => setWordsOpen(true)}>המילים (<b>{found.length}</b>)</Button>
        </div>
      </section>

      <WordsPanel className="side" board={board} found={found} fresh={game.fresh}
        reveals={game.reveals} hintsOpen={hintsOpen} az={az} onToggleSort={toggleSort}
        onWord={setDefWord} />
      <WordsModal open={wordsOpen} onClose={() => setWordsOpen(false)} board={board}
        found={found} fresh={game.fresh} reveals={game.reveals} hintsOpen={hintsOpen}
        az={az} onToggleSort={toggleSort} onWord={setDefWord} />
      <ArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} days={days.days}
        today={days.today} current={board.date}
        progress={archiveOpen ? progressStore.all() : {}} onPick={pickDay} />
      <DefinitionModal word={defWord} onClose={() => setDefWord(null)} onShow={showOnBoard} />
      <HelpModal open={helpOpen} onClose={closeHelp} />
      <HintModal hint={helpOpen ? null : hintIntro} onClose={closeHintIntro} />
    </div>
  );
}
