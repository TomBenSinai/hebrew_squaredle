import type { Toast } from "../state/useGame";
import "./Readout.css";

interface Props {
  /** the word being swiped */
  current: string;
  toast: Toast | null;
  onWord: (word: string) => void;
}

/** Above the board: the word being swiped, else the last message. */
export function Readout({ current, toast, onWord }: Props) {
  return (
    <div className="readout">
      <div className="current" aria-live="polite">{current}</div>
      {!current && toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.word ? <ToastWord toast={toast} word={toast.word} onWord={onWord} /> : toast.text}
        </div>
      )}
    </div>
  );
}

/** A found word inside the message: tap it for its definition. */
function ToastWord({ toast, word, onWord }: { toast: Toast; word: string; onWord: (w: string) => void }) {
  const [before, ...rest] = toast.text.split(word);
  return (
    <button type="button" className="toastbtn" onClick={() => onWord(word)}>
      {before}<span className="tw">{word}</span>{rest.join(word)}
    </button>
  );
}
