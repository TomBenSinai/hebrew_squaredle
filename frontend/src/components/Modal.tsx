import { useEffect, useId, useRef, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import "./Modal.css";

// Open modals, topmost last: Escape closes only the top one.
const stack: string[] = [];

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** extra class on the sheet, e.g. a narrower card */
  sheetClassName?: string;
  /** stacking order for modals opened from other modals */
  layer?: number;
}

/**
 * Centered dialog with a blurred backdrop. It stays mounted and animates on
 * `open`, so children may use `.modal.open …` selectors to stagger in.
 * Focus goes to the close button on open and back to the opener on close.
 */
export function Modal({ open, onClose, title, children, sheetClassName, layer = 20 }: Props) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(id);
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack.at(-1) === id) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, id]);

  return (
    <div className={"modal" + (open ? " open" : "")} style={{ zIndex: layer }}
      role="dialog" aria-modal="true" aria-labelledby={id} inert={!open}>
      <div className="backdrop" onClick={onClose} />
      <Sheet title={title} titleId={id} className={sheetClassName}
        action={<button ref={closeRef} className="closebtn" type="button" aria-label="סגירה" onClick={onClose}>✕</button>}>
        {children}
      </Sheet>
    </div>
  );
}
