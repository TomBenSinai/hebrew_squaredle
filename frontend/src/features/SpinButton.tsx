import { Pill, RotateIcon } from "../components";

/** Turns the board a quarter; the icon keeps turning the same way (App.css). */
export function SpinButton({ turns, onClick }: { turns: number; onClick: () => void }) {
  return (
    <Pill className="round spinbtn" aria-label="סיבוב הלוח" onClick={onClick}>
      <span className="spinicon" style={{ transform: `rotate(${turns * -90}deg)` }}><RotateIcon /></span>
      <span className="tip" aria-hidden="true">סיבוב</span>
    </Pill>
  );
}
