import type { ReactNode } from "react";
import { CalendarIcon, Chip, GridIcon, LockIcon, MoonIcon, PersonIcon, Pill, ShapeIcon, ShareIcon, SunIcon, TrophyIcon } from "../components";
import type { DaySummary, User } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import { useTheme } from "../lib/theme";
import "./Masthead.css";

interface Props {
  day: DaySummary;
  isToday: boolean;
  onHelp: () => void;
  /** undefined: login is off, so no account button */
  account?: { user: User | null; onOpen: () => void };
  /** the switch between ריבועון and ריבועוני; undefined: no ריבועוני today */
  mini?: { on: boolean; locked: boolean; onSwitch: () => void };
}

export function Masthead({ day, isToday, onHelp, account, mini }: Props) {
  if (mini?.on) {
    return (
      <MastheadFrame live title={<>ריבועונ<span className="mini-yod">י</span></>} when={<>
        <b>היום</b>{` ${shortDate(day.date.slice("mini-".length))} · 3×3`}
      </>}>
        <GameSwitch to="ריבועון" n={4} onClick={mini.onSwitch} />
        {account && <AccountPill user={account.user} onClick={account.onOpen} />}
        <HelpPill onClick={onHelp} />
        <ThemePill />
      </MastheadFrame>
    );
  }
  return (
    <MastheadFrame live when={<>
      {isToday ? <b>היום</b> : <><b>ארכיון</b> · {weekday(day.date)}</>}
      {` ${shortDate(day.date)} · לוח ${day.number}`}
      {day.shapeName && <> · <span className="shape" title="צורת הלוח"><ShapeIcon />{day.shapeName}</span></>}
      {day.theme && <Chip>★ {day.theme}</Chip>}
    </>}>
      {mini && <GameSwitch to="ריבועוני" n={3} locked={mini.locked} onClick={mini.onSwitch} />}
      {account && <AccountPill user={account.user} onClick={account.onOpen} />}
      <HelpPill onClick={onHelp} />
      <ThemePill />
    </MastheadFrame>
  );
}

/**
 * Over to the other board: the first pill, beside the name, showing that board's
 * grid. ריבועוני's is amber, with a lock on its corner for a logged-out player.
 */
function GameSwitch({ to, n, locked, onClick }: { to: string; n: 3 | 4; locked?: boolean; onClick: () => void }) {
  const label = locked ? `${to}: למשתמשים מחוברים` : `מעבר ל${to}`;
  return (
    <Pill className={"round gameswitch to-" + (n === 3 ? "mini" : "daily")} aria-label={label} title={label}
      onClick={onClick}>
      <GridIcon n={n} />
      {locked && <span className="gamelock"><LockIcon /></span>}
    </Pill>
  );
}

/** The header itself, shared with the tutorial: the name, a line under it, and buttons. */
export function MastheadFrame({ when, live, title = "ריבועון", children }:
  { when: ReactNode; live?: boolean; title?: ReactNode; children: ReactNode }) {
  return (
    <header className="masthead">
      <div className="brand">
        <h1>{title}</h1>
        <div className="when" aria-live={live ? "polite" : undefined}>{when}</div>
      </div>
      <div className="headbtns">{children}</div>
    </header>
  );
}

export function ArchivePill({ className, round, onClick }:
  { className?: string; round?: boolean; onClick: () => void }) {
  return (
    <Pill className={["cal", round && "round", className].filter(Boolean).join(" ")} icon={<CalendarIcon />}
      aria-label="ארכיון" title={round ? undefined : "ארכיון"} onClick={onClick}>
      {round
        ? <span className="tip" aria-hidden="true">ארכיון</span>
        : <span className="pilllabel">ארכיון</span>}
    </Pill>
  );
}

/** On an archive day, beside the archive: straight back to today's board. */
export function TodayPill({ onClick }: { onClick: () => void }) {
  return <Pill strong className="today" onClick={onClick}>חזרה להיום</Pill>;
}

/** The leaderboard, in the row under the board; `fresh`: not opened yet, so a dot. */
export function LeadersPill({ fresh, onClick }: { fresh?: boolean; onClick: () => void }) {
  return (
    <Pill className={"round leaders" + (fresh ? " new" : "")} aria-label="טבלת המובילים" onClick={onClick}>
      <TrophyIcon />
      <span className="tip" aria-hidden="true">טבלת המובילים</span>
    </Pill>
  );
}

/**
 * Share the player's progress: the one filled pill in the row. `round`: icon
 * only (a narrow row), its label a tip that stays up while it says it copied.
 */
export function SharePill({ copied, round, onClick }: { copied?: boolean; round?: boolean; onClick: () => void }) {
  const label = copied ? "הועתק" : "שיתוף";
  return (
    <Pill className={"share" + (round ? " round" : "") + (copied ? " copied" : "")} icon={<ShareIcon />}
      aria-label={copied ? "הועתק" : "שיתוף ההתקדמות"} onClick={onClick}>
      <span className={round ? "tip" : "pilllabel"} aria-live="polite">{label}</span>
    </Pill>
  );
}

/** Logged out, a person to log in; logged in, their initial on a lit tile. */
function AccountPill({ user, onClick }: { user: User | null; onClick: () => void }) {
  const label = user ? "החשבון" : "התחברות";
  const initial = user && [...(user.name || user.email || "").trim()][0]?.toUpperCase();
  return (
    <Pill className={"round acct" + (user ? " in" : "")} aria-label={label} title={label} onClick={onClick}>
      {user ? initial || <PersonIcon /> : <PersonIcon />}
    </Pill>
  );
}

/**
 * Tells players about something new, once. A row of its own, so it covers
 * nothing: under the header pointing up at the account button, or above the
 * row under the board pointing down at the leaderboard. Tapping it opens what
 * it's about.
 */
export function News({ to, onOpen, onDismiss, children }:
  { to: "acct" | "leaders"; onOpen: () => void; onDismiss: () => void; children: ReactNode }) {
  return (
    <div className={"news to-" + to} role="note">
      <button type="button" className="newsbody" onClick={onOpen}>
        <b>חדש!</b> {children}
      </button>
      <button type="button" className="newsclose" aria-label="סגירה" onClick={onDismiss}>×</button>
    </div>
  );
}

export function HelpPill({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <Pill className={["round", className].filter(Boolean).join(" ")} aria-label="איך משחקים" title="איך משחקים"
      onClick={onClick}>?</Pill>
  );
}

/** Light/dark switch; the icon shows the mode it switches to. */
export function ThemePill() {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "מצב בהיר" : "מצב כהה";
  return (
    <Pill className="round theme" aria-label={label} title={label} onClick={toggle}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Pill>
  );
}
