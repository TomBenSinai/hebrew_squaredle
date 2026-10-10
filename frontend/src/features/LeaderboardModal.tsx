import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../api/client";
import type { DayRow, Leaderboard, MyPlace, Ranked, StreakRow, User } from "../api/types";
import { Button, GridIcon, Modal, SheetBody } from "../components";
import { playerId, progressStore } from "../state/progressStore";
import "./LeaderboardModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** today's date: the day's ranking is today's */
  date: string;
  /** today's ריבועוני ("mini-<date>"), when this player can see it: then the card has both games */
  mini?: string | null;
  /** which game it opens on: the one being played */
  startMini?: boolean;
  user: User | null;
  /** opens the account card, to log in or pick a nickname */
  onAccount: () => void;
}

type Tab = "day" | "streaks";

/**
 * Today's ranking and the streaks. Lists only players who picked a nickname;
 * everyone else sees their own place in it too. Only play on a board's own day counts.
 */
export function LeaderboardModal({ open, onClose, date, mini, startMini, user, onAccount }: Props) {
  const [tab, setTab] = useState<Tab>("day");
  // the game picked in the card; until one is, the game being played. Cleared
  // on closing, so the next opening starts there again, and fetches only that
  const [picked, setGame] = useState<"daily" | "mini" | null>(null);
  useEffect(() => { if (!open) setGame(null); }, [open]);
  const game = picked ?? (startMini && mini ? "mini" : "daily");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);
  const board = game === "mini" && mini ? mini : date;

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setFailed(false);
    setData(null);
    // send the words found so far first, so the player's own row is current
    progressStore.sync().catch(() => {})
      .then(() => api.leaderboard(board, playerId(), ctl.signal))
      .then(setData, () => { if (!ctl.signal.aborted) setFailed(true); });
    return () => ctl.abort();
  }, [open, board, user?.nickname]);

  const part = data?.[tab];
  return (
    <Modal open={open} onClose={onClose} title="טבלת המובילים" sheetClassName="leadcard">
      <SheetBody className="leadbody">
        {mini && (
          <div className="leadgames" role="tablist" aria-label="משחק">
            <button type="button" role="tab" aria-selected={game === "daily"}
              className={"leadgame" + (game === "daily" ? " on" : "")} onClick={() => setGame("daily")}>
              <GridIcon n={4} />ריבועון
            </button>
            <button type="button" role="tab" aria-selected={game === "mini"}
              className={"leadgame mini" + (game === "mini" ? " on" : "")} onClick={() => setGame("mini")}>
              <GridIcon n={3} />ריבועוני
            </button>
          </div>
        )}
        <div className="leadtabs" role="tablist" aria-label="טבלה">
          <TabButton on={tab === "day"} onClick={() => setTab("day")}>היום</TabButton>
          <TabButton on={tab === "streaks"} onClick={() => setTab("streaks")}>רצפים</TabButton>
        </div>
        <p className="leadfine">
          {tab === "day"
            ? "לפי מספר המילים, ואז מילות הבונוס. בתיקו: מי שסיים ראשון."
            : game === "mini"
            ? "ימים ברצף שבהם מצאתם מילה בריבועוני של אותו יום."
            : "ימים ברצף שבהם מצאתם מילה בלוח של אותו יום. משחק בארכיון לא נספר."}
        </p>

        {failed && !data && <p className="leadempty">אין חיבור לשרת. נסו שוב בעוד רגע.</p>}
        {!failed && !data && <p className="leadempty">טוען…</p>}
        {data && part && (part.top.length || part.me
          ? <ol className="leadlist" role="tabpanel">
              {withMe(part.top, part.me, user?.nickname ?? "").map((r, k) => r === GAP
                ? <li key="gap" className="leadgap" aria-hidden="true">⋯</li>
                : <Row key={k} row={r} index={k}>{tab === "day"
                    ? <DayScore row={r as Ranked & DayRow} total={data.day.mainTotal} />
                    : <StreakScore row={r as Ranked & StreakRow} />}
                  </Row>)}
            </ol>
          : <p className="leadempty" role="tabpanel">
              {tab === "day" ? "עוד אף אחד לא בטבלה היום. אולי אתם הראשונים?" : "עוד אין רצפים בטבלה."}
            </p>)}

        {data && !user?.nickname && <JoinHint user={user} onAccount={onAccount} />}
      </SheetBody>
    </Modal>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={on} className={"leadtab" + (on ? " on" : "")} onClick={onClick}>
      {children}
    </button>
  );
}

/** A list row; `ghost` is the player's own place while they aren't listed. */
type ListRow = Ranked & { ghost?: boolean };
const GAP = "gap" as const;

/**
 * The listed rows with the player's own row put in where it belongs, when the
 * list doesn't already show it: after everyone ahead of them, or at the end
 * after a gap when they rank below the rows shown. A listed row with their own
 * place number comes after them: their place counts only the rows ahead, so
 * that row is level with them or behind.
 */
function withMe(top: Ranked[], me: MyPlace | null, name: string): (ListRow | typeof GAP)[] {
  if (!me || top.some(r => r.me)) return top;
  const row: ListRow = { ...me, name, me: true, ghost: !me.listed };
  const at = top.filter(r => r.rank < me.rank).length;
  if (at === top.length && top.length && top[top.length - 1].rank + 1 < me.rank) return [...top, GAP, row];
  return [...top.slice(0, at), row, ...top.slice(at)];
}

function Row({ row, index, children }: { row: ListRow; index: number; children: ReactNode }) {
  return (
    <li className={"leadrow" + (row.me ? " me" : "") + (row.ghost ? " ghost" : "") + (row.rank <= 3 ? ` p${row.rank}` : "")}
      style={{ "--i": Math.min(index, 16) } as CSSProperties}>
      <span className="leadrank">{row.rank}</span>
      {row.ghost
        ? <span className="leadname">אתם <span className="leadtag">כאן הייתם</span></span>
        : <bdi className="leadname">{row.name}</bdi>}
      <span className="leadscore">{children}</span>
    </li>
  );
}

function DayScore({ row, total }: { row: DayRow; total: number }) {
  return (
    <>
      {row.done ? <b>הושלם ✓</b> : <><b>{row.main}</b>/{total}</>}
      {row.bonus > 0 && <span className="leadbonus">+{row.bonus}</span>}
    </>
  );
}

function StreakScore({ row }: { row: StreakRow }) {
  return <><b>{row.streak}</b> {row.streak === 1 ? "יום" : "ימים"}</>;
}

/** How to get on the list, for a player who isn't on it. */
function JoinHint({ user, onAccount }: { user: User | null; onAccount: () => void }) {
  return (
    <div className="leadjoin">
      <p className="leadfine">
        {user ? "בחרו כינוי בכרטיס החשבון כדי להופיע בטבלה." : "התחברו ובחרו כינוי כדי להופיע בטבלה."}
      </p>
      <Button variant="primary" onClick={onAccount}>{user ? "בחירת כינוי" : "התחברות"}</Button>
    </div>
  );
}
