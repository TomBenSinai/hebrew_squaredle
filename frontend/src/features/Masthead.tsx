import type { ReactNode } from "react";
import { CalendarIcon, Chip, PersonIcon, Pill } from "../components";
import type { DaySummary, User } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import "./Masthead.css";

interface Props {
  day: DaySummary;
  isToday: boolean;
  canGoToday: boolean;
  onToday: () => void;
  onArchive: () => void;
  onHelp: () => void;
  /** undefined: login is off, so no account button */
  account?: { user: User | null; onOpen: () => void };
}

export function Masthead({ day, isToday, canGoToday, onToday, onArchive, onHelp, account }: Props) {
  return (
    <MastheadFrame live when={<>
      {isToday ? <b>היום</b> : <><b>ארכיון</b> · {weekday(day.date)}</>}
      {` ${shortDate(day.date)} · לוח ${day.number}`}
      {day.shapeName && <> · <span className="shape">{day.shapeName}</span></>}
      {day.theme && <Chip>{day.theme}</Chip>}
    </>}>
      {!isToday && canGoToday && <Pill strong onClick={onToday}>חזרה להיום</Pill>}
      <ArchivePill onClick={onArchive} />
      {account && <AccountPill user={account.user} onClick={account.onOpen} />}
      <HelpPill onClick={onHelp} />
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

export function HelpPill({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <Pill className={["round", className].filter(Boolean).join(" ")} aria-label="איך משחקים" title="איך משחקים"
      onClick={onClick}>?</Pill>
  );
}
