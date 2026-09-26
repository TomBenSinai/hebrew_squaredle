export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13.5h2M11 13.5h2M14 13.5h2M8 16.5h2M11 16.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Head and shoulders: the account, before logging in. */
export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 20.2c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Google's "G", in its own colours as their sign-in guidelines ask. */
export function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** A board with an arrow sweeping over it, anticlockwise - the way the tiles actually turn. */
export function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="8.5" y="10.75" width="7" height="7" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 14.25A8 8 0 0 0 4 14.25M1.6 11.85 4 14.25l2.4-2.4" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A box with an arrow leaving it: the link opens in a new tab. */
export function ExternalLinkIcon() {
  return (
    <svg className="ext-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M13 4h7v7M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A 3x3 board with a tile missing: marks the day's board shape, so it doesn't read as the theme. */
export function ShapeIcon() {
  return (
    <svg className="shape-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      {[0, 1, 2].flatMap(r => [0, 1, 2].map(c => r === 0 && c === 2 ? null :
        <rect key={`${r}${c}`} x={c * 4 + .5} y={r * 4 + .5} width="3" height="3" rx=".7" fill="currentColor" />))}
    </svg>
  );
}

/** Shown in light mode: switches to dark. */
export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinejoin="round" />
    </svg>
  );
}

/** Shown in dark mode: switches to light. */
export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
