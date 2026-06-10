import { useEffect, useState } from "react";

const KEY = "erpovo:companyId";
const LAST_KEY_PREFIX = "erpovo:lastCompany:";
const CHANGE_EVENT = "erpovo:companyIdChanged";

export function useCurrentCompanyId(): string | null {
  const [id, setId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(KEY),
  );

  useEffect(() => {
    const sync = () => setId(localStorage.getItem(KEY));
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setId(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return id;
}

export function setCurrentCompanyId(id: string | null, userId?: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(KEY, id);
    if (userId) {
      localStorage.setItem(`${LAST_KEY_PREFIX}${userId}`, id);
    }
  } else {
    localStorage.removeItem(KEY);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getLastSelectedCompanyId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${LAST_KEY_PREFIX}${userId}`);
}
