export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13.5h2M11 13.5h2M14 13.5h2M8 16.5h2M11 16.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
