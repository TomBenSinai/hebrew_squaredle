import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Pill.css";

/** Round header button; `strong` gets an ink border (e.g. "back to today"). */
export function Pill({ strong, icon, children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { strong?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" className={["pill", strong && "strong", className].filter(Boolean).join(" ")} {...rest}>
      {icon}
      {children}
    </button>
  );
}
