/**
 * Active uploader registry for the transaction-sync replay flow.
 *
 * Phase 3 ships the gating + queue + replay scaffold but does NOT enable
 * an actual cloud uploader yet. UI surfaces (e.g. the manual "Replay
 * offline queue" button) still need a function to hand to `replayQueue`,
 * so this module provides:
 *
 *   • `registerUploader` — wire the real uploader once a later phase
 *     implements it.
 *   • `getActiveUploader` — returns the registered uploader, or a stub
 *     that throws a clear "not enabled yet" error so the replay flow
 *     fails loudly instead of silently marking records as synced.
 */
import type { Uploader } from "./replay";

let active: Uploader | null = null;

export function registerUploader(uploader: Uploader): void {
  active = uploader;
}

export function clearUploader(): void {
  active = null;
}

export function hasUploader(): boolean {
  return active !== null;
}

const NOT_READY_UPLOADER: Uploader = () => {
  throw new Error(
    "Transaction cloud sync is not enabled yet. Pending entries will stay queued.",
  );
};

export function getActiveUploader(): Uploader {
  return active ?? NOT_READY_UPLOADER;
}
