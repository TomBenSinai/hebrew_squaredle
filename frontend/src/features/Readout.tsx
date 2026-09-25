import type { Toast } from "../state/useGame";
import "./Readout.css";

interface Props {
  /** the word being swiped, or the one waiting for an answer */
  current: string;
  /** the word is out with the server: show it as not yet final */
  waiting?: boolean;
  toast: Toast | null;
  onWord: (word: string) => void;
}

/** Above the board: the word being swiped, else the last message. */
export function Readout({ current, waiting, toast, onWord }: Props) {
  return (
    <div className="readout">
      <div className={waiting ? "current waiting" : "current"} aria-live="polite" aria-busy={waiting || undefined}>
        {waiting
          ? [...current].map((letter, i) => (
              // the dip travels along the word, from its first letter on the right
              <span key={i} className="wl" style={{ animationDelay: `${450 + i * 70}ms` }}>{letter}</span>
            ))
          : current}
      </div>
      {!current && toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.word ? <ToastWord toast={toast} word={toast.word} onWord={onWord} /> : toast.text}
          {toast.note && <span className={`note hint-${toast.note.hint}`}>{toast.note.text}</span>}
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
