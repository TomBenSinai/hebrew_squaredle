import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import type { DaysResponse } from "./api/types";
import { AccountModal } from "./features/AccountModal";
import { ArchiveModal } from "./features/ArchiveModal";
import { Board, boardVars } from "./features/Board";
import { DefinitionModal } from "./features/DefinitionModal";
import { FinishModal } from "./features/FinishModal";
import { HelpModal } from "./features/HelpModal";
import { introName, IntroModal, type Intro } from "./features/IntroModal";
import { LeaderboardModal } from "./features/LeaderboardModal";
import { Masthead, News } from "./features/Masthead";
import { Readout } from "./features/Readout";
import { Score } from "./features/Score";
import { SpinButton } from "./features/SpinButton";
import { Tutorial } from "./features/Tutorial";
import { useWordSort, WordsModal, WordsPanel } from "./features/WordsModal";
import { useDayStats } from "./hooks/useDayStats";
import { useMedia } from "./hooks/useMedia";
import { useSpin } from "./hooks/useSpin";
import { useSwipe } from "./hooks/useSwipe";
import { withFinal } from "./lib/hebrew";
import { HINTS, letterFraction, openHints, rankFor } from "./lib/scoring";
import { hasSeen, markSeen } from "./lib/seen";
import { bootAuth, type AuthState } from "./state/auth";
import { progressStore } from "./state/progressStore";
import { useGame, type Game } from "./state/useGame";
import "./App.css";

/** Where the word list moves out of the modal and beside the board. The only copy:
    App.css styles the wide layout from the `wide` class this sets. */
const WIDE_QUERY = "(min-width: 1100px)";

export default function App() {
  const [days, setDays] = useState<DaysResponse | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    // finish a login the page came back from, then merge server progress (the
    // account's, once logged in) into local storage before the first board shows
    const synced = bootAuth().then(a => { setAuth(a); return a.settled ? progressStore.sync() : undefined; });
    Promise.all([api.days(), synced])
      .then(([d]) => { setDays(d); setDate(d.days.at(-1)?.date ?? null); })
      .catch(() => setLoadError(true));
  }, []);

  const { game, error } = useGame(date);
  // a first-time player learns on a practice board before the game opens
  const [learned, setLearned] = useState(() => hasSeen("tutorial"));
  // a player who starts after login came out isn't told it's new
  const finishTutorial = () => { markSeen("tutorial"); markSeen("login-news"); setLearned(true); };

  if (!learned) return <div className="app"><Tutorial onDone={finishTutorial} /></div>;
  if (loadError || error) return <div className="app"><p className="status">לא הצלחנו לטעון את המשחק. נסו לרענן.</p></div>;
  if (!days || !game || !auth) return <div className="app"><p className="status">טוען…</p></div>;
  const setNickname = (nickname: string | null) => setAuth(a => a && a.info.user
    ? { ...a, info: { ...a.info, user: { ...a.info.user, nickname } } } : a);
  return <Play days={days} game={game} setDate={setDate} auth={auth} setNickname={setNickname} />;
}

function Play({ days, game, setDate, auth, setNickname }:
  { days: DaysResponse; game: Game; setDate: (d: string) => void; auth: AuthState;
    setNickname: (nickname: string | null) => void }) {
  const { board, layout, found } = game;
  const [wordsOpen, setWordsOpen] = useState(false);
  // one sort for both word lists: the side panel and the modal are both mounted
  const { az, toggleSort } = useWordSort();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [leadersOpen, setLeadersOpen] = useState(false);
  const [defWord, setDefWord] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // back from a login (or a failed one), the account card says how it went
  const [notice, setNotice] = useState(auth.notice);
  const [accountOpen, setAccountOpen] = useState(auth.notice !== null);
  const { providers, user } = auth.info;
  const loginOn = providers.google || providers.email || user !== null;
  // login is new: tell a logged-out player once, until they close the note or open the sheet
  const [newsSeen, setNewsSeen] = useState(() => hasSeen("login-news"));
  const seeNews = () => { markSeen("login-news"); setNewsSeen(true); };
  const openAccount = () => { setNotice(null); setAccountOpen(true); seeNews(); };
  // the leaderboard is new: a note once, and a dot on its button until it's opened
  const [leadersSeen, setLeadersSeen] = useState(() => hasSeen("leaders"));
  const openLeaders = () => { markSeen("leaders"); setLeadersSeen(true); setLeadersOpen(true); };

  // on a computer the list is always beside the board, so the count opens nothing
  const wide = useMedia(WIDE_QUERY);

  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { phase, turns, spin } = useSpin(game.rotate);
  const { path, handlers } = useSwipe(layout, tileRefs, game.submit, phase !== "idle");

  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const isToday = board.date === days.today;
  // one note at a time: the leaderboard's first, the login's after it
  const showLeadersNews = loginOn && !leadersSeen && isToday;
  const showNews = !newsSeen && user === null && isToday && !showLeadersNews;
  const mainFound = found.filter(f => f.cat === "main").length;
  const bonusFound = found.length - mainFound;
  const fraction = letterFraction(found, board.mainLetters);

  const hintsOpen = useMemo(() => openHints(fraction), [fraction]);
  const crowd = useDayStats(board.date);

  // The last main word, found just now (not a board already solved when it
  // loaded): a wave across the board, then the finish card.
  const [won, setWon] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const solved = useRef({ date: board.date, n: mainFound });
  useEffect(() => {
    const was = solved.current;
    solved.current = { date: board.date, n: mainFound };
    if (was.date !== board.date || was.n >= board.mainTotal || mainFound < board.mainTotal) return;
    setWon(true);
    const card = setTimeout(() => setFinishOpen(true), 900);
    const calm = setTimeout(() => setWon(false), 2200);
    return () => { clearTimeout(card); clearTimeout(calm); };
  }, [mainFound, board.date, board.mainTotal]);

  // Each hint, and the first bonus and theme word, is explained once, the first
  // time this player ever meets it. One card at a time, in the order they came.
  const [intros, setIntros] = useState<Intro[]>([]);
  const queue = useCallback((add: Intro[]) => setIntros(q => [
    ...q,
    ...add.filter(i => !hasSeen(introName(i)) && !q.some(o => introName(o) === introName(i))),
  ]), []);
  // a new day drops the cards still waiting (their words and theme belong to the
  // old board); the hints open on the new one queue again just below
  useEffect(() => setIntros([]), [board.date]);
  useEffect(() => {
    queue(HINTS.filter(h => hintsOpen.has(h.id)).map(h => ({ kind: "hint", hint: h.id })));
  }, [hintsOpen, board.date, queue]);
  const { fresh } = game;
  useEffect(() => {
    const f = fresh ? found.find(x => x.w === fresh) : undefined;
    if (f?.cat === "bonus") queue([{ kind: "bonus", word: f.w }]);
    else if (f?.theme) queue([{ kind: "theme", word: f.w, theme: board.theme }]);
  }, [fresh, found, board.theme, queue]);
  // mark and drop in one step, so a double tap can't drop the next card unseen
  const closeIntro = () => setIntros(q => {
    if (q[0]) markSeen(introName(q[0]));
    return q.slice(1);
  });

  const pickDay = (d: string) => { setArchiveOpen(false); if (d !== board.date) setDate(d); };
  const showOnBoard = useCallback((w: string) => {
    setDefWord(null);
    setWordsOpen(false);
    game.showWord(w);
  }, [game]);

  return (
    <div className={wide ? "app wide" : "app"}>
      <section className="play" aria-label="הלוח">
        <Masthead day={board} isToday={isToday} canGoToday={days.days.some(d => d.date === days.today)}
          onToday={() => setDate(days.today)} onArchive={() => setArchiveOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onLeaders={loginOn ? openLeaders : undefined} leadersNew={!leadersSeen}
          account={loginOn ? { user, onOpen: openAccount } : undefined} />
        {showLeadersNews && (
          <News to="leaders" onOpen={openLeaders} onDismiss={() => { markSeen("leaders"); setLeadersSeen(true); }}>
            טבלת המובילים: מי מצא הכי הרבה מילים היום, ומי שומר על רצף הכי ארוך. בחרו כינוי והצטרפו.
          </News>
        )}
        {loginOn && showNews && (
          <News to="acct" onOpen={openAccount} onDismiss={seeNews}>
            התחברו כדי שההתקדמות שלכם תישמר, ותוכלו להמשיך אותה מכל המכשירים שלכם.
          </News>
        )}

        <Score found={mainFound} total={board.mainTotal} bonus={bonusFound}
          rank={rankFor(fraction)} fraction={fraction} crowd={crowd} isToday={isToday}
          onOpen={wide ? undefined : () => setWordsOpen(true)} />

        <div className="boardwrap" style={boardVars(layout)}>
          <Readout current={swiping || game.pending || ""} waiting={!swiping && !!game.pending}
            toast={game.toast} onWord={setDefWord} />
          <Board layout={layout} path={path} live={game.live} hints={game.hints} flash={game.flash} spin={phase} won={won}
            tileRefs={tileRefs} handlers={handlers} />
        </div>

        <div className="tools">
          <SpinButton turns={turns} onClick={spin} />
        </div>
      </section>

      <WordsPanel className="side" board={board} found={found} fresh={game.fresh}
        reveals={game.reveals} hintsOpen={hintsOpen} az={az} onToggleSort={toggleSort}
        onWord={setDefWord} />
      <WordsModal open={wordsOpen && !wide} onClose={() => setWordsOpen(false)} board={board}
        found={found} fresh={game.fresh} reveals={game.reveals} hintsOpen={hintsOpen}
        az={az} onToggleSort={toggleSort} onWord={setDefWord} />
      <ArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} days={days.days}
        today={days.today} current={board.date}
        progress={archiveOpen ? progressStore.all() : {}} onPick={pickDay} />
      <DefinitionModal word={defWord} onClose={() => setDefWord(null)} onShow={showOnBoard} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} board={board} bonus={bonusFound}
        isToday={isToday} user={user} onAccount={() => { setFinishOpen(false); openAccount(); }}
        onLeaders={loginOn ? () => { setFinishOpen(false); openLeaders(); } : undefined} />
      <LeaderboardModal open={leadersOpen} onClose={() => setLeadersOpen(false)} date={days.today} user={user}
        onAccount={openAccount} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth.info} notice={notice}
        savedDays={accountOpen ? Object.values(progressStore.all()).filter(p => p.found.length).length : 0}
        onNickname={setNickname} />
      <IntroModal intro={helpOpen || accountOpen || leadersOpen || finishOpen ? null : intros[0] ?? null} onClose={closeIntro} />
    </div>
  );
}
