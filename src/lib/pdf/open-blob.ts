/**
 * Open a Blob safely across web and Electron desktop.
 *
 * In Electron, `window.open(blobUrl)` can trigger Windows' "Get an app to
 * open this 'blob' link" prompt when the main process forwards the URL to
 * `shell.openExternal`. To avoid that, in desktop mode we always trigger a
 * download via an anchor tag instead of opening a new window.
 *
 * On the web, we keep the existing behaviour (new tab preview).
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { erpovo?: unknown }).erpovo);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Open a blob in a new tab on web; download it on desktop.
 * Returns the object URL so callers may revoke it later if they wish.
 */
export function openOrDownloadBlob(blob: Blob, filename: string): string {
  if (isDesktop()) {
    downloadBlob(blob, filename);
    return "";
  }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Popup blocked — fall back to download.
    downloadBlob(blob, filename);
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return url;
}
