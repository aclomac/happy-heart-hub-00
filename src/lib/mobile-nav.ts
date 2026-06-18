import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

export const mobileNavStore = {
  get: () => open,
  set: (v: boolean) => {
    if (open === v) return;
    open = v;
    listeners.forEach((l) => l());
  },
  toggle: () => mobileNavStore.set(!open),
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useMobileNavOpen() {
  return useSyncExternalStore(
    mobileNavStore.subscribe,
    mobileNavStore.get,
    () => false,
  );
}
