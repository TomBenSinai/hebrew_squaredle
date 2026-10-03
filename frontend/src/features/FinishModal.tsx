import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api/client";
import type { DayRow, Leaderboard, MyPlace, PublicBoard, Ranked, User } from "../api/types";
import { Button, Modal, SheetBody, TrophyIcon } from "../components";
import { playerId, progressStore } from "../state/progressStore";
import "./FinishModal.css";
import "./LeaderboardModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  board: PublicBoard;
  bonus: number;
  /** finished on the board's own day: it counts for the leaderboard */
  isToday: boolean;
  /** the page was loaded on a board already solved: welcome back, not "you did it" */
  again?: boolean;
  user: User | null;
  /** undefined: no leaderboard (login is off) */
  onLeaders?: () => void;
  onAccount: () => void;
}

const CONFETTI = 30;
const COLORS = ["var(--amber-fill)", "var(--cobalt)", "var(--hint-sort)", "var(--hint-reveal)",
  "var(--hint-starts)", "var(--hint-uses)"];

/**
 * The board is solved: a shower of the board's own letters, what the player
 * found, and on today's board their place and streak.
 */
export function FinishModal({ open, onClose, board, bonus, isToday, again, user, onLeaders, onAccount }: Props) {
  const [lead, setLead] = useState<Leaderboard | null>(null);
  // a flag, not the callback: the parent makes a new one each render, which would refetch
  const hasLeaders = !!onLeaders;

  useEffect(() => {
    if (!open || !isToday || !hasLeaders) return;
    const ctl = new AbortController();
    setLead(null);
    // the last word first, so the place counts it
    progressStore.sync().catch(() => {})
      .then(() => api.leaderboard(board.date, playerId(), ctl.signal))
      .then(setLead, () => {});
    return () => ctl.abort();
  }, [open, isToday, board.date, hasLeaders]);

  // spread over the card by the golden angle: looks random, renders the same each time
  const confetti = useMemo(() => Array.from({ length: CONFETTI }, (_, i) => ({
    letter: board.letters[i % board.letters.length],
    style: {
      "--x": `${(i * 61.8) % 100}%`,
      "--d": `${(i * 37) % 600}ms`,
      "--t": `${1600 + (i * 53) % 900}ms`,
      "--r": `${((i * 97) % 360) - 180}deg`,
      "--c": COLORS[i % COLORS.length],
    } as CSSProperties,
  })), [board.letters]);

  // the last fetch was for today's board: an archive board doesn't get its place or streak
  const shown = isToday ? lead : null;
  const me = shown?.day.me;
  const streak = shown?.streaks.me?.streak ?? 0;
  // the main words are done, the bonus words aren't: say the board isn't over
  const bonusLeft = Math.max(board.bonusTotal - bonus, 0);
  // finished today, but not on the list: say where they'd be, and how to get there
  const missed = isToday && me && !me.listed ? me : null;
  return (
    <Modal open={open} onClose={onClose} title="סיימתם!" sheetClassName="finishcard" layer={30}>
      {open && (
        <div className="confetti" aria-hidden="true">
          {confetti.map((c, i) => <span key={i} style={c.style}>{c.letter}</span>)}
        </div>
      )}
      <SheetBody className="finishbody">
        <div className="finishtrophy"><TrophyIcon /></div>
        <h3 className="finishhead">כל הכבוד!</h3>
        <p className="finishsub">
          {again ? <>לוח {board.number} כבר פתור. כל המילים שלכם.</> : <>מצאתם את כל המילים בלוח {board.number}.</>}
        </p>

        <div className="finishstats">
          <Stat value={board.mainTotal} label="מילים" />
          {bonus > 0 && <Stat value={`+${bonus}`} label="בונוס" bonus />}
          {me?.listed && <Stat value={me.rank} label="מקום היום" lit={me.rank <= 3} />}
          {streak > 1 && <Stat value={streak} label="ימים ברצף" />}
        </div>

        {board.bonusTotal > 0 && (bonusLeft > 0
          ? <div className="finishbonus">
              <p className="finishbonushead">
                {bonusLeft === 1 ? "יש עוד מילת בונוס אחת בלוח" : <>יש עוד <b>{bonusLeft}</b> מילות בונוס בלוח</>}
              </p>
              <p>
                הן לא חובה, אבל אפשר להמשיך לחפש. גם אותיות שהאפירו יכולות להיות חלק ממילת בונוס.{" "}
                <button type="button" className="linkish" onClick={onClose}>להמשיך לחפש</button>
              </p>
            </div>
          : <p className="finishbonus all">ומצאתם גם את כל מילות הבונוס!</p>)}

        {missed && shown && (
          <div className="finishmissed">
            <p className="finishwould">המקום שלכם בטבלה שמור</p>
            <ol className="finishpeek leadlist" aria-label="טבלת המובילים של היום">
              {peek(shown.day.top, missed).map(r => r === "me"
                ? <li key="me" className="leadrow ghost me">
                    <span className="leadrank">{missed.rank}</span>
                    <span className="leadname">אתם <span className="leadtag">כאן הייתם</span></span>
                    <span className="leadscore">
                      {missed.done ? <b>הושלם ✓</b> : <><b>{missed.main}</b>/{board.mainTotal}</>}
                      {missed.bonus > 0 && <span className="leadbonus">+{missed.bonus}</span>}
                    </span>
                  </li>
                : r === "gap"
                ? <li key="gap" className="leadgap" aria-hidden="true">⋯</li>
                : <li key={r.rank + r.name} className="leadrow">
                    <span className="leadrank">{r.rank}</span>
                    <bdi className="leadname">{r.name}</bdi>
                    <span className="leadscore">
                      {r.done ? <b>הושלם ✓</b> : <><b>{r.main}</b>/{board.mainTotal}</>}
                      {r.bonus > 0 && <span className="leadbonus">+{r.bonus}</span>}
                    </span>
                  </li>)}
            </ol>
            <p className="finishnudge">
              כל מה שמפריד ביניכם לבין מקום בטבלה זה {user ? "כינוי" : "התחברות"}!
            </p>
          </div>
        )}
        {!isToday && <p className="finishfine">לוחות מהארכיון לא נכנסים לטבלת המובילים, אבל הם נשמרים אצלכם.</p>}

        <div className="finishactions">
          {missed
            ? <Button variant="primary" onClick={onAccount}>{user ? "בחירת כינוי" : "להתחבר ולהופיע בטבלה"}</Button>
            : isToday && onLeaders && <Button variant="primary" onClick={onLeaders}>לטבלת המובילים</Button>}
          {missed
            ? <button type="button" className="linkish finishlater" onClick={onClose}>אולי אחר כך</button>
            : <Button onClick={onClose}>{isToday && onLeaders ? "סגירה" : "יופי"}</Button>}
        </div>
      </SheetBody>
    </Modal>
  );
}

function Stat({ value, label, bonus, lit }: { value: number | string; label: string; bonus?: boolean; lit?: boolean }) {
  return (
    <div className={"finishstat" + (bonus ? " bonus" : "") + (lit ? " lit" : "")}>
      <b dir="ltr">{value}</b>
      <span>{label}</span>
    </div>
  );
}

/**
 * A peek at today's list around the player's place: the row ahead of them,
 * their own (pencilled in), and the row behind. Below the rows sent, a gap
 * before their own, as on the full list.
 */
function peek(top: (Ranked & DayRow)[], me: MyPlace): ((Ranked & DayRow) | "me" | "gap")[] {
  const at = top.filter(r => r.rank < me.rank).length;
  const ahead = top.slice(Math.max(at - 1, 0), at);
  const gap = at === top.length && at > 0 && top[at - 1].rank + 1 < me.rank;
  return [...ahead, ...(gap ? ["gap" as const] : []), "me" as const, ...top.slice(at, at + 1)];
}
