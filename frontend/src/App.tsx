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
import { ArchivePill, LeadersPill, Masthead, News, SharePill, TodayPill } from "./features/Masthead";
import { MiniModal } from "./features/MiniModal";
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
import { share, shareText } from "./lib/share";
import { bootAuth, type AuthState } from "./state/auth";
import { progressStore } from "./state/progressStore";
import { useGame, type Game } from "./state/useGame";
import "./App.css";

/** Where the word list moves out of the modal and beside the board. The only copy:
    App.css styles the wide layout from the `wide` class this sets. */
const WIDE_QUERY = "(min-width: 1100px)";
/** Where the row under the board can't fit "back to today" beside share and the
    archive with their words, so those two go round. */
const NARROW_QUERY = "(max-width: 420px)";

/** Which board the player was on: ריבועוני ("mini") or the big one. Kept, so a
    reload, or the page coming back from a login started at ריבועוני, opens it again. */
type Mode = "daily" | "mini";
const MODE_KEY = "ribuon:mode";
function savedMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === "mini" ? "mini" : "daily"; } catch { return "daily"; }
}
function saveMode(mode: Mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode etc. */ }
}

export default function App() {
  const [days, setDays] = useState<DaysResponse | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [mode, setModeState] = useState<Mode>(savedMode);
  const setMode = useCallback((m: Mode) => { saveMode(m); setModeState(m); }, []);

  useEffect(() => {
    // finish a login the page came back from, then merge server progress (the
    // account's, once logged in) into local storage before the first board shows
    const synced = bootAuth().then(a => { setAuth(a); return a.settled ? progressStore.sync() : undefined; });
    Promise.all([api.days(), synced])
      .then(([d]) => { setDays(d); setDate(d.days.at(-1)?.date ?? null); })
      .catch(() => setLoadError(true));
  }, []);

  // a tab left open past midnight learns the new day: what's today, and the new board in the archive
  const refreshDays = useCallback(() => { api.days().then(setDays, () => {}); }, []);
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") refreshDays(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refreshDays]);

  // ריבועוני only for a logged-in player, and only on a day that has one
  const miniId = auth?.info.user ? days?.mini ?? null : null;
  const { game: loaded, error } = useGame(mode === "mini" && miniId ? miniId : date);
  // while the next day's board loads, the last one stays up, so Play isn't
  // remounted on a day change (what's open in it, and the login's notice, stay put)
  const lastGame = useRef<Game | null>(null);
  if (loaded) lastGame.current = loaded;
  const game = loaded ?? lastGame.current;
  // a first-time player learns on a practice board before the game opens
  const [learned, setLearned] = useState(() => hasSeen("tutorial"));
  // a player who starts after login came out isn't told it's new
  const finishTutorial = () => { markSeen("tutorial"); markSeen("login-news"); setLearned(true); };

  if (!learned) return <div className="app"><Tutorial onDone={finishTutorial} /></div>;
  if (loadError || error) return <div className="app"><p className="status">לא הצלחנו לטעון את המשחק. נסו לרענן.</p></div>;
  if (!days || !game || !auth) return <div className="app"><p className="status">טוען…</p></div>;
  const setNickname = (nickname: string | null) => setAuth(a => a && a.info.user
    ? { ...a, info: { ...a.info, user: { ...a.info.user, nickname } } } : a);
  return <Play days={days} refreshDays={refreshDays} game={game} setDate={setDate} auth={auth}
    setNickname={setNickname} setMode={setMode} />;
}

/** Play has mounted once this page load: only then is a solved board a refresh after the win */
let playMounted = false;

function Play({ days, refreshDays, game, setDate, auth, setNickname, setMode }:
  { days: DaysResponse; refreshDays: () => void; game: Game; setDate: (d: string) => void; auth: AuthState;
    setNickname: (nickname: string | null) => void; setMode: (m: Mode) => void }) {
  const { board, layout, found } = game;
  // ריבועוני: today's only, with no archive, leaderboard or crowd on the progress bar
  const mini = board.date.startsWith("mini-");
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
  // logged out, ריבועוני's switch opens a card about it instead of the board
  const [miniCardOpen, setMiniCardOpen] = useState(false);
  const miniSwitch = loginOn && days.mini ? {
    on: mini,
    locked: user === null,
    onSwitch: () => {
      if (mini) setMode("daily");
      else if (user) setMode("mini");
      else setMiniCardOpen(true);
    },
  } : undefined;
  // login is new: tell a logged-out player once, until they close the note or open the sheet
  const [newsSeen, setNewsSeen] = useState(() => hasSeen("login-news"));
  const seeNews = () => { markSeen("login-news"); setNewsSeen(true); };
  const openAccount = () => { setNotice(null); setAccountOpen(true); seeNews(); };
  // the leaderboard is new: a note once, and a dot on its button until it's opened
  const [leadersSeen, setLeadersSeen] = useState(() => hasSeen("leaders"));
  // "today" is checked again, so the ranking is never yesterday's
  const openLeaders = () => { markSeen("leaders"); setLeadersSeen(true); setLeadersOpen(true); refreshDays(); };

  // on a computer the list is always beside the board, so the count opens nothing
  const wide = useMedia(WIDE_QUERY);
  const narrow = useMedia(NARROW_QUERY);

  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { phase, turns, spin } = useSpin(game.rotate);
  const { path, handlers } = useSwipe(layout, tileRefs, game.submit, phase !== "idle");

  const swiping = withFinal(path.map(i => layout.letters[i]).join(""));
  const isToday = mini || board.date === days.today;
  const showToday = !mini && !isToday && days.days.some(d => d.date === days.today);
  // one note at a time: the leaderboard's first, the login's after it
  const showLeadersNews = loginOn && !leadersSeen && isToday && !mini;
  const showNews = !newsSeen && user === null && isToday && !mini && !showLeadersNews;
  const mainFound = found.filter(f => f.cat === "main").length;
  const bonusFound = found.length - mainFound;
  const fraction = letterFraction(found, board.mainLetters);

  // called straight from the tap: Safari only opens the share dialog inside one.
  // Without a share menu the text goes to the clipboard, and the button says so.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shareProgress = () => {
    share(shareText(found, board.mainTotal, mini ? "ריבועוני" : "ריבועון")).then(r => {
      if (r !== "copied") return;
      clearTimeout(copiedTimer.current);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2200);
    });
  };
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const hintsOpen = useMemo(() => openHints(fraction), [fraction]);
  const crowd = useDayStats(mini ? null : board.date);

  // The last main word, found just now: a wave across the board, then the
  // finish card. Today's board already solved when the page loads (a refresh
  // after the win) gets them too, once; coming back to it from another day doesn't.
  const [won, setWon] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const solved = useRef({ date: board.date, n: mainFound });
  const [reloadWin] = useState(() => !playMounted && isToday && mainFound >= board.mainTotal ? board.date : null);
  const reloadShown = useRef(false);
  useEffect(() => { playMounted = true; }, []);
  useEffect(() => {
    const was = solved.current;
    solved.current = { date: board.date, n: mainFound };
    // off to another day, even before the card showed: coming back doesn't replay it
    if (board.date !== reloadWin) reloadShown.current = true;
    const justWon = was.date === board.date && was.n < board.mainTotal && mainFound >= board.mainTotal;
    const reload = reloadWin === board.date && !reloadShown.current;
    if (!justWon && !reload) return;
    setWon(true);
    // marked when the card shows, not before: a strict-mode rerun must still get it
    const card = setTimeout(() => { reloadShown.current = true; setFinishOpen(true); }, 900);
    const calm = setTimeout(() => setWon(false), 2200);
    // leaving the board mid-wave (another day) mustn't leave the next board's tiles waving
    return () => { clearTimeout(card); clearTimeout(calm); setWon(false); };
  }, [mainFound, board.date, board.mainTotal, reloadWin]);

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
    <div className={["app", wide && "wide", mini && "mini"].filter(Boolean).join(" ")}>
      <section className="play" aria-label="הלוח">
        <Masthead day={board} isToday={isToday}
          onHelp={() => setHelpOpen(true)}
          account={loginOn ? { user, onOpen: openAccount } : undefined} mini={miniSwitch} />
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

        {showLeadersNews && (
          <News to="leaders" onOpen={openLeaders} onDismiss={() => { markSeen("leaders"); setLeadersSeen(true); }}>
            טבלת המובילים: מי מצא הכי הרבה מילים היום, ומי שומר על רצף הכי ארוך. בחרו כינוי והצטרפו.
          </News>
        )}
        <div className="tools">
          <SpinButton turns={turns} onClick={spin} />
          <span className="toolsend">
            {found.length > 0 && <SharePill copied={copied} round={showToday && narrow} onClick={shareProgress} />}
            {showToday && <TodayPill onClick={() => setDate(days.today)} />}
            {!mini && <ArchivePill round={showToday && narrow} onClick={() => setArchiveOpen(true)} />}
            {loginOn && !mini && <LeadersPill fresh={!leadersSeen} onClick={openLeaders} />}
          </span>
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
      <MiniModal open={miniCardOpen} onClose={() => setMiniCardOpen(false)}
        onLogin={() => { setMiniCardOpen(false); setMode("mini"); openAccount(); }} />
      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} board={board} bonus={bonusFound}
        onShare={shareProgress} copied={copied}
        isToday={isToday} user={user} onAccount={() => { setFinishOpen(false); openAccount(); }}
        onLeaders={loginOn && !mini ? () => { setFinishOpen(false); openLeaders(); } : undefined} mini={mini} />
      <LeaderboardModal open={leadersOpen} onClose={() => setLeadersOpen(false)} date={days.today} user={user}
        onAccount={openAccount} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} auth={auth.info} notice={notice}
        savedDays={accountOpen ? Object.values(progressStore.all()).filter(p => p.found.length).length : 0}
        onNickname={setNickname} />
      <IntroModal intro={helpOpen || accountOpen || leadersOpen || finishOpen || miniCardOpen ? null : intros[0] ?? null} onClose={closeIntro} />
    </div>
  );
}
