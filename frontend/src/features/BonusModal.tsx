import { useRef } from "react";
import { Button, Modal, SheetBody } from "../components";
import "./HintModal.css";

const SEEN_KEY = "rivuon:bonus-seen";

// as with the hints: storage may read but not write (Safari in private mode)
let seenInMemory = false;

/** Have bonus words already been explained to the player? */
export function bonusSeen(): boolean {
  if (seenInMemory) return true;
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

export function markBonusSeen() {
  seenInMemory = true;
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode etc. */ }
}

/** Explains bonus words the first time the player finds one. */
export function BonusModal({ word, onClose }: { word: string | null; onClose: () => void }) {
  // keep the word while the modal animates shut
  const last = useRef<string | null>(null);
  if (word) last.current = word;
  return (
    <Modal open={!!word} onClose={onClose} title="מילת בונוס" sheetClassName="hintcard" layer={30}>
      <SheetBody className="hintbody">
        <h3 className="hinthead hint-bonus">{last.current}</h3>
        <p>מילות בונוס הן צורות פחות נפוצות של מילים: סמיכות, הטיות וסלנג. למשל <b>גינה</b> היא מילה מרכזית, ו-<b className="bonusword">גינת</b> (כמו בגינת הילדים) היא מילת בונוס.</p>
        <p>הן נספרות בנפרד, ליד מספר המילים (<bdi dir="ltr">+1</bdi>), ולא צריך אותן כדי לסיים את הלוח.</p>
        <p>גם אותיות שהאפירו יכולות להיות חלק ממילת בונוס.</p>
        <div className="hintactions">
          <Button variant="primary" onClick={onClose}>הבנתי</Button>
        </div>
      </SheetBody>
    </Modal>
  );
}
