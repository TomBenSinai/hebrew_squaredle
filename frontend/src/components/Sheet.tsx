import type { ReactNode } from "react";
import "./Sheet.css";

interface Props {
  title: ReactNode;
  titleId?: string;
  /** shown at the end of the header, e.g. a close button */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A paper card with a big title bar: the body of every modal and side panel. */
export function Sheet({ title, titleId, action, className, children }: Props) {
  return (
    <section className={"sheet" + (className ? " " + className : "")}>
      <div className="sheethead">
        <h2 id={titleId}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Scrolling body under the sheet's header. */
export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={"sheetbody" + (className ? " " + className : "")}>{children}</div>;
}
