import type { ReactNode } from "react";
import { CalendarIcon, Chip, MoonIcon, Pill, ShapeIcon, SunIcon } from "../components";
import type { DaySummary } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import { useTheme } from "../lib/theme";
import "./Masthead.css";

interface Props {
  day: DaySummary;
  isToday: boolean;
  canGoToday: boolean;
  onToday: () => void;
  onArchive: () => void;
  onHelp: () => void;
}

export function Masthead({ day, isToday, canGoToday, onToday, onArchive, onHelp }: Props) {
  return (
    <MastheadFrame live when={<>
      {isToday ? <b>היום</b> : <><b>ארכיון</b> · {weekday(day.date)}</>}
      {` ${shortDate(day.date)} · לוח ${day.number}`}
      {day.shapeName && <> · <span className="shape" title="צורת הלוח"><ShapeIcon />{day.shapeName}</span></>}
      {day.theme && <Chip>★ {day.theme}</Chip>}
    </>}>
      {!isToday && canGoToday && <Pill strong onClick={onToday}>חזרה להיום</Pill>}
      <ArchivePill onClick={onArchive} />
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
