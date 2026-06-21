/**
 * Phase 3D — Auto-sync orchestrator.
 *
 * Wires the existing outbox/replay queue into the app lifecycle so cloud
 * sync runs automatically:
 *   • once on app start (after the uploader is installed)
 *   • on every browser `online` event
 *   • on Supabase `SIGNED_IN` events
 *   • on a low-frequency polling interval (default 60s) while online
 *
 * All runs are non-blocking (fired with `void replayQueue(...)`), gated by
 * the in-flight latch inside `replayQueue`, and short-circuit when there
 * is no active company id or the device is offline.
 *
 * Safe to call `installAutoSync` multiple times — the previous disposers
 * are torn down before re-installing.
 */
import { supabase } from "@/integrations/supabase/client";
import { installSalesUploader } from "./install";
import { getActiveUploader, hasUploader } from "./active-uploader";
import { installQueueAutoReplay, replayQueue } from "./replay";

const COMPANY_KEY = "erpovo:companyId";
const DEFAULT_INTERVAL_MS = 60_000;

export type AutoSyncStatus = {
  running: boolean;
  lastSyncAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  nextScheduledAt: number | null;
  intervalMs: number;
};

const status: AutoSyncStatus = {
  running: false,
  lastSyncAt: null,
  lastErrorAt: null,
  lastError: null,
  nextScheduledAt: null,
  intervalMs: DEFAULT_INTERVAL_MS,
};

type Listener = (s: AutoSyncStatus) => void;
const listeners = new Set<Listener>();

function emit() {
  const snap = { ...status };
  for (const l of Array.from(listeners)) {
    try { l(snap); } catch { /* ignore */ }
  }
}

export function subscribeAutoSync(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...status });
  return () => { listeners.delete(listener); };
}

export function getAutoSyncStatus(): AutoSyncStatus {
  return { ...status };
}

function currentCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Fire-and-forget. Returns immediately; never throws to callers. */
function triggerReplay(reason: string): void {
  if (!hasUploader()) return;
  if (!isOnline()) return;
  const companyId = currentCompanyId();
  if (!companyId) return;
  try {
    status.running = true;
    emit();
    void replayQueue({ companyId, uploader: getActiveUploader() })
      .then(() => {
        status.lastSyncAt = Date.now();
        status.lastError = null;
      })
      .catch((err) => {
        status.lastErrorAt = Date.now();
        status.lastError = err instanceof Error ? err.message : String(err);
        if (typeof console !== "undefined") {
          console.debug("[auto-sync] replay error", reason, err);
        }
      })
      .finally(() => {
        status.running = false;
        if (status.nextScheduledAt !== null) {
          status.nextScheduledAt = Date.now() + status.intervalMs;
        }
        emit();
      });
  } catch (err) {
    status.running = false;
    status.lastErrorAt = Date.now();
    status.lastError = err instanceof Error ? err.message : String(err);
    emit();
    if (typeof console !== "undefined") {
      console.debug("[auto-sync] trigger error", reason, err);
    }
  }
}

let installed = false;
const disposers: Array<() => void> = [];

export type AutoSyncOptions = {
  intervalMs?: number;
};

/**
 * Install all auto-sync lifecycle hooks. Idempotent: a second call tears
 * down the previous wiring and re-installs with the new options.
 */
export function installAutoSync(opts: AutoSyncOptions = {}): () => void {
  if (typeof window === "undefined") return () => {};

  // Tear down a prior install before re-wiring.
  if (installed) {
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
    installed = false;
  }

  // 1. Make sure the uploader registry is wired (idempotent).
  installSalesUploader();

  // 2. Run once on startup (non-blocking).
  triggerReplay("startup");

  // 3. Browser online event.
  const offOnline = installQueueAutoReplay(() => {
    if (!hasUploader()) return null;
    const companyId = currentCompanyId();
    if (!companyId) return null;
    return { companyId, uploader: getActiveUploader() };
  });
  disposers.push(offOnline);

  // 4. Visibility regain — tabs that were backgrounded often miss the
  //    `online` event when the network flapped while hidden.
  const onVisibility = () => {
    if (document.visibilityState === "visible") triggerReplay("visibility");
  };
  document.addEventListener("visibilitychange", onVisibility);
  disposers.push(() => document.removeEventListener("visibilitychange", onVisibility));

  // 5. Periodic interval. Cheap because replayQueue short-circuits when
  //    the queue is empty (preflight + snapshot) and when offline.
  const intervalMs = Math.max(5_000, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  const intervalId = window.setInterval(() => triggerReplay("interval"), intervalMs);
  disposers.push(() => window.clearInterval(intervalId));

  // 6. Supabase sign-in — drain anything queued from a prior session as
  //    soon as the new bearer token is available.
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      // Defer slightly so the auth-state handler in __root.tsx can
      // restore the last-selected company id first.
      window.setTimeout(() => triggerReplay("signed-in"), 250);
    }
  });
  disposers.push(() => data.subscription.unsubscribe());

  installed = true;
  return () => {
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
    installed = false;
  };
}

/** Test/reset hook. */
export function __resetAutoSyncForTests(): void {
  for (const d of disposers.splice(0)) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
  installed = false;
}

/** Manual trigger — useful for "Sync now" buttons. Non-blocking. */
export function triggerAutoSyncNow(): void {
  triggerReplay("manual");
}
