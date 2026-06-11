/**
 * Demo storage shim — turns Supabase Storage uploads into base64 data URLs
 * persisted in localStorage so the demo clone never hits a network bucket.
 */
const PREFIX = "erpovo_demo_file:";

export function isDemoStoragePath(path: string | null | undefined): boolean {
  return !!path && path.startsWith("demo://");
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error ?? new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

export async function demoUploadFile(prefix: string, file: File): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const path = `demo://${prefix}/${id}-${file.name}`;
  try {
    const dataUrl = await fileToDataUrl(file);
    // Skip persistence for very large files to avoid quota crashes — UI still
    // gets a usable returned path, just no preview on refresh.
    if (dataUrl.length < 4 * 1024 * 1024) {
      try {
        localStorage.setItem(PREFIX + path, dataUrl);
      } catch {
        /* quota — ignore */
      }
    }
  } catch {
    /* ignore — return the path anyway so the UI continues */
  }
  return path;
}

export function demoGetFileUrl(path: string | null | undefined): string | null {
  if (!isDemoStoragePath(path)) return null;
  try {
    return localStorage.getItem(PREFIX + path);
  } catch {
    return null;
  }
}

export function demoRemoveFile(path: string | null | undefined): void {
  if (!isDemoStoragePath(path)) return;
  try {
    localStorage.removeItem(PREFIX + path);
  } catch {
    /* ignore */
  }
}
