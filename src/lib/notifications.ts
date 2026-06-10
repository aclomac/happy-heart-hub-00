import { useEffect, useState, useCallback } from "react";

export type NotificationKind =
  | "sale_created"
  | "purchase_created"
  | "payment_received"
  | "payment_made"
  | "stock_alert"
  | "attachment_failed"
  | "backup_done"
  | "import_done"
  | "export_done"
  | "order_created"
  | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  createdAt: number;
  read: boolean;
}

const EVT = "erpovo:notificationsChanged";
const MAX = 50;

function key(scope: string): string {
  return `erpovo:notifications:${scope || "global"}`;
}

function read(scope: string): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(scope: string, list: AppNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(scope), JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new Event(EVT));
}

export function pushNotification(
  scope: string,
  n: Omit<AppNotification, "id" | "createdAt" | "read"> & { read?: boolean },
): AppNotification {
  const entry: AppNotification = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    read: !!n.read,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
  };
  const list = [entry, ...read(scope)];
  write(scope, list);
  return entry;
}

export function markRead(scope: string, id: string, isRead: boolean) {
  const list = read(scope).map((n) => (n.id === id ? { ...n, read: isRead } : n));
  write(scope, list);
}

export function markAllRead(scope: string) {
  write(
    scope,
    read(scope).map((n) => ({ ...n, read: true })),
  );
}

export function clearNotifications(scope: string) {
  write(scope, []);
}

export function useNotifications(scope: string | null | undefined) {
  const s = scope || "global";
  const [items, setItems] = useState<AppNotification[]>(() => read(s));
  useEffect(() => {
    const sync = () => setItems(read(s));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [s]);
  const unread = items.filter((n) => !n.read).length;
  const setRead = useCallback((id: string, r: boolean) => markRead(s, id, r), [s]);
  const setAllRead = useCallback(() => markAllRead(s), [s]);
  const clear = useCallback(() => clearNotifications(s), [s]);
  return { items, unread, setRead, setAllRead, clear };
}
