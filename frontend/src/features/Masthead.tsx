import { CalendarIcon, Chip, Pill } from "../components";
import type { DaySummary } from "../api/types";
import { shortDate, weekday } from "../lib/dates";
import "./Masthead.css";

interface Props {
  day: DaySummary;
  isToday: boolean;
  canGoToday: boolean;
  onToday: () => void;
  onArchive: () => void;
}

export function Masthead({ day, isToday, canGoToday, onToday, onArchive }: Props) {
  return (
    <header className="masthead">
      <div className="brand">
        <h1>ריבועון</h1>
        <div className="when" aria-live="polite">
          {isToday ? <b>היום</b> : <><b>ארכיון</b> · {weekday(day.date)}</>}
          {` ${shortDate(day.date)} · לוח ${day.number}`}
          {day.shapeName && <> · <span className="shape">{day.shapeName}</span></>}
          {day.theme && <Chip>{day.theme}</Chip>}
        </div>
      </div>
      <div className="headbtns">
        {!isToday && canGoToday && <Pill strong onClick={onToday}>חזרה להיום</Pill>}
        <Pill icon={<CalendarIcon />} onClick={onArchive}>ארכיון</Pill>
      </div>
    </header>
  );
}
