import { supabase } from "@/integrations/supabase/client";

const BUCKET = "reconciliation-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
] as const;
export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "pdf"];

export type AttachmentKind = "image" | "pdf" | "other";

export function getAttachmentKind(pathOrName: string): AttachmentKind {
  const p = (pathOrName || "").toLowerCase();
  if (p.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(p)) return "image";
  return "other";
}

export function getAttachmentFilename(path: string): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function validateReconciliationFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (!file || !file.name) return { ok: false, error: "Invalid file" };
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const mimeOk = (ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(file.type);
  const extOk = ALLOWED_EXT.includes(ext);
  if (!mimeOk && !extOk) {
    return { ok: false, error: "Only PNG, JPG, WEBP or PDF files are allowed" };
  }
  if (file.size <= 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `File is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`,
    };
  }
  return { ok: true };
}

export async function uploadReconciliationAttachment(
  companyId: string,
  file: File,
): Promise<string> {
  const v = validateReconciliationFile(file);
  if (!v.ok) throw new Error(v.error);
  if (!companyId) throw new Error("Missing company");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || (ext === "pdf" ? "application/pdf" : `image/${ext}`),
  });
  if (error) throw error;
  return path;
}

export async function removeReconciliationAttachment(path: string): Promise<void> {
  if (!path) return;
  // Only remove from the dedicated bucket; ignore legacy paths from other buckets
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function getReconciliationAttachmentUrl(
  path: string,
  opts: { download?: boolean; expiresIn?: number } = {},
): Promise<string | null> {
  return resolveAttachmentUrl(path, opts);
}

// Fallback resolver that tries the dedicated bucket, then the legacy one
// (older reconciliations may have stored attachments in `expense-attachments`).
// Both buckets are private, so we always return a short-lived signed URL.
export async function resolveAttachmentUrl(
  path: string,
  opts: { download?: boolean; expiresIn?: number } = {},
): Promise<string | null> {
  if (!path) return null;
  const tryBuckets = [BUCKET, "expense-attachments"];
  for (const b of tryBuckets) {
    const { data, error } = await supabase.storage
      .from(b)
      .createSignedUrl(
        path,
        opts.expiresIn ?? 300,
        opts.download ? { download: getAttachmentFilename(path) } : undefined,
      );
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

// Trigger a true browser download (works around popup blockers on window.open).
export async function downloadAttachment(path: string): Promise<boolean> {
  const url = await resolveAttachmentUrl(path, { download: true });
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = getAttachmentFilename(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
