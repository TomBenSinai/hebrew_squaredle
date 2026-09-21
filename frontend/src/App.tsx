import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Pill, RotateIcon } from "./components";
import { api } from "./api/client";
import type { DaysResponse } from "./api/types";
import { ArchiveModal } from "./features/ArchiveModal";
import { Board, boardVars } from "./features/Board";
import { DefinitionModal } from "./features/DefinitionModal";
import { HelpModal, helpSeen, markHelpSeen } from "./features/HelpModal";
import { Masthead } from "./features/Masthead";
import { Readout } from "./features/Readout";
import { Score } from "./features/Score";
import { WordsModal, WordsPanel } from "./features/WordsModal";
import { useSpin } from "./hooks/useSpin";
import { useSwipe } from "./hooks/useSwipe";
import { withFinal } from "./lib/hebrew";
import { letterFraction, rankFor } from "./lib/scoring";
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [defWord, setDefWord] = useState<string | null>(null);
  // the rules greet a first-time player, once
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen());
  const closeHelp = () => { setHelpOpen(false); markHelpSeen(); };

  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { phase, turns, spin } = useSpin(game.rotate);
  const { path, handlers } = useSwipe(layout, tileRefs, game.submit, phase !== "idle");

  const isToday = board.date === days.today;
  const mainFound = found.filter(f => f.cat === "main").length;
  const fraction = letterFraction(found, board.mainLetters);

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

        <Score found={mainFound} total={board.mainTotal} rank={rankFor(fraction)} fraction={fraction} />

        <div className="boardwrap" style={boardVars(layout)}>
          <Readout current={withFinal(path.map(i => layout.letters[i]).join("")) || game.pending || ""}
            toast={game.toast} onWord={setDefWord} />
          <Board layout={layout} path={path} live={game.live} flash={game.flash} spin={phase}
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

      <WordsPanel className="side" board={board} found={found} fresh={game.fresh} onWord={setDefWord} />
      <WordsModal open={wordsOpen} onClose={() => setWordsOpen(false)} board={board}
        found={found} fresh={game.fresh} onWord={setDefWord} />
      <ArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} days={days.days}
        today={days.today} current={board.date}
        progress={archiveOpen ? progressStore.all() : {}} onPick={pickDay} />
      <DefinitionModal word={defWord} onClose={() => setDefWord(null)} onShow={showOnBoard} />
      <HelpModal open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
