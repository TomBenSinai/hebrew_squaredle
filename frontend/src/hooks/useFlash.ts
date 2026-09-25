import { useCallback, useEffect, useRef, useState } from "react";

/** How long a found word stays lit on the board. */
const FLASH_MS = 1600;

/** A value that shows for a moment, then clears (a word lit up on the board). */
export function useFlash<T>(): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((v: T) => {
    clearTimeout(timer.current);
    setValue(v);
    timer.current = setTimeout(() => setValue(null), FLASH_MS);
  }, []);
  return [value, show];
}
