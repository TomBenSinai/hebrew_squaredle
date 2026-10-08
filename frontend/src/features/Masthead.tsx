import type { ReactNode } from "react";
import { CalendarIcon, Chip, MoonIcon, PersonIcon, Pill, ShapeIcon, ShareIcon, SunIcon, TrophyIcon } from "../components";
import type { DaySummary, User } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import { useTheme } from "../lib/theme";
import "./Masthead.css";

interface Props {
  day: DaySummary;
  isToday: boolean;
  canGoToday: boolean;
  onToday: () => void;
  onHelp: () => void;
  /** undefined: login is off, so no account button */
  account?: { user: User | null; onOpen: () => void };
}

export function Masthead({ day, isToday, canGoToday, onToday, onHelp, account }: Props) {
  return (
    <MastheadFrame live when={<>
      {isToday ? <b>היום</b> : <><b>ארכיון</b> · {weekday(day.date)}</>}
      {` ${shortDate(day.date)} · לוח ${day.number}`}
      {day.shapeName && <> · <span className="shape" title="צורת הלוח"><ShapeIcon />{day.shapeName}</span></>}
      {day.theme && <Chip>★ {day.theme}</Chip>}
    </>}>
      {!isToday && canGoToday && <Pill strong onClick={onToday}>חזרה להיום</Pill>}
      {account && <AccountPill user={account.user} onClick={account.onOpen} />}
      <HelpPill onClick={onHelp} />
      <ThemePill />
    </MastheadFrame>
  );
}

/** The header itself, shared with the tutorial: the name, a line under it, and buttons. */
export function MastheadFrame({ when, live, children }: { when: ReactNode; live?: boolean; children: ReactNode }) {
  return (
    <header className="masthead">
      <div className="brand">
        <h1>ריבועון</h1>
        <div className="when" aria-live={live ? "polite" : undefined}>{when}</div>
      </div>
      <div className="headbtns">{children}</div>
    </header>
  );
}

export function ArchivePill({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <Pill className={["cal", className].filter(Boolean).join(" ")} icon={<CalendarIcon />}
      aria-label="ארכיון" title="ארכיון" onClick={onClick}>
      <span className="pilllabel">ארכיון</span>
    </Pill>
  );
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

/** Share the player's progress: the one filled pill in the row. */
export function SharePill({ onClick }: { onClick: () => void }) {
  return (
    <Pill className="share" icon={<ShareIcon />} aria-label="שיתוף ההתקדמות" onClick={onClick}>
      <span className="pilllabel">שיתוף</span>
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
