import { useEffect, useState } from 'react';

const keyPrefix = 'astryx-calculator.v1.';

export function useSaved<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(keyPrefix + key);
      return raw === null ? fallback : JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(keyPrefix + key, JSON.stringify(value)); }
    catch { /* In restricted sessions the current page keeps working in memory. */ }
  }, [key, value]);
  return [value, setValue] as const;
}
