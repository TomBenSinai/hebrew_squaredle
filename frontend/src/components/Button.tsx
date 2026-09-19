import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import "./Button.css";

type Variant = "default" | "primary";

const cls = (variant: Variant, extra?: string) =>
  ["btn", variant === "primary" && "primary", extra].filter(Boolean).join(" ");

export function Button({ variant = "default", className, type = "button", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={cls(variant, className)} {...rest} />;
}

/** A link that looks like a Button (opens in a new tab when external). */
export function LinkButton({ variant = "default", className, external, ...rest }:
  AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; external?: boolean }) {
  const ext = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return <a className={cls(variant, className)} {...ext} {...rest} />;
}
