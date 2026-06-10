import { useEffect, useState, useCallback } from "react";

const KEY = "erpovo:privacyMode";
const EVT = "erpovo:privacyModeChanged";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setPrivacyMode(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}

export function getPrivacyMode(): boolean {
  return read();
}

export function usePrivacyMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => read());
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((v: boolean) => setPrivacyMode(v), []);
  return [on, set];
}

/** Mask the rendered amount string when privacy mode is enabled. */
export function maskAmount(formatted: string | number, hidden: boolean): string {
  if (!hidden) return String(formatted);
  return "•••••";
}
