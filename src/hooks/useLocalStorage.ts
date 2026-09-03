import { useEffect, useState } from "react";

/** Small persisted-state helper shared by app settings and cookie consent. */
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore write failures (e.g. private-browsing storage quotas).
    }
  }, [key, value]);

  return [value, setValue] as const;
}
