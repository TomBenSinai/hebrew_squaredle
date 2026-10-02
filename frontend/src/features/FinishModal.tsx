import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api/client";
import type { Leaderboard, PublicBoard, User } from "../api/types";
import { Button, Modal, SheetBody, TrophyIcon } from "../components";
import { playerId, progressStore } from "../state/progressStore";
import "./FinishModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  board: PublicBoard;
  bonus: number;
  /** finished on the board's own day: it counts for the leaderboard */
  isToday: boolean;
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
export function FinishModal({ open, onClose, board, bonus, isToday, user, onLeaders, onAccount }: Props) {
  const [lead, setLead] = useState<Leaderboard | null>(null);

  useEffect(() => {
    if (!open || !isToday || !onLeaders) return;
    const ctl = new AbortController();
    setLead(null);
    // the last word first, so the place counts it
    progressStore.sync().catch(() => {})
      .then(() => api.leaderboard(board.date, playerId(), ctl.signal))
      .then(setLead, () => {});
    return () => ctl.abort();
  }, [open, isToday, board.date, onLeaders]);

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

  const me = lead?.day.me;
  const streak = lead?.streaks.me?.streak ?? 0;
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
        <p className="finishsub">מצאתם את כל המילים בלוח {board.number}.</p>

        <div className="finishstats">
          <Stat value={board.mainTotal} label="מילים" />
          {bonus > 0 && <Stat value={`+${bonus}`} label="בונוס" bonus />}
          {me && <Stat value={me.rank} label={me.listed ? "מקום היום" : "הייתם במקום"} lit={me.listed && me.rank <= 3} />}
          {streak > 1 && <Stat value={streak} label="ימים ברצף" />}
        </div>

        {isToday && me && !me.listed && (
          <p className="finishfine">
            {user ? "בחרו כינוי כדי שהמקום שלכם יופיע בטבלה." : "התחברו ובחרו כינוי כדי שהמקום שלכם יופיע בטבלה."}{" "}
            <button type="button" className="linkish" onClick={onAccount}>{user ? "בחירת כינוי" : "התחברות"}</button>
          </p>
        )}
        {!isToday && <p className="finishfine">לוחות מהארכיון לא נכנסים לטבלת המובילים, אבל הם נשמרים אצלכם.</p>}

        <div className="finishactions">
          {isToday && onLeaders && <Button variant="primary" onClick={onLeaders}>לטבלת המובילים</Button>}
          <Button onClick={onClose}>{isToday && onLeaders ? "סגירה" : "יופי"}</Button>
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
