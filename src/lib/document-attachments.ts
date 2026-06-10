import { supabase } from "@/integrations/supabase/client";

/**
 * Document Attachments — shared library for Sale Invoice and Purchase Bill
 * file attachments. Files live in the private `document-attachments` bucket
 * under `{company_id}/{document_type}/{document_id}/{uuid}.{ext}`. Metadata
 * rows live in `public.document_attachments`. All access is gated by RLS;
 * we never use service role on the client.
 */

export const BUCKET = "document-attachments";
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_DOCUMENT = 20;

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;

export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
export const ALLOWED_DOCUMENT_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv"];

export const BLOCKED_EXT = [
  "exe",
  "js",
  "mjs",
  "html",
  "htm",
  "sh",
  "bat",
  "cmd",
  "msi",
  "dll",
  "scr",
  "ps1",
  "jar",
  "vbs",
];

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const DOCUMENT_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export type AttachmentKind = "image" | "document";
export type AttachmentDocType = "sale_invoice" | "purchase_bill";

export type DocumentAttachment = {
  id: string;
  company_id: string;
  document_type: AttachmentDocType;
  document_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  attachment_kind: AttachmentKind;
  uploaded_by: string | null;
  created_at: string;
};

export function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function classifyKind(file: File): AttachmentKind | null {
  const ext = getExt(file.name);
  if (
    (ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type) ||
    ALLOWED_IMAGE_EXT.includes(ext)
  ) {
    return "image";
  }
  if (
    (ALLOWED_DOCUMENT_MIME as readonly string[]).includes(file.type) ||
    ALLOWED_DOCUMENT_EXT.includes(ext)
  ) {
    return "document";
  }
  return null;
}

export type ValidationOk = { ok: true; kind: AttachmentKind };
export type ValidationErr = { ok: false; error: string };

export function validateAttachmentFile(file: File): ValidationOk | ValidationErr {
  if (!file || !file.name) return { ok: false, error: "Invalid file" };
  const ext = getExt(file.name);
  if (BLOCKED_EXT.includes(ext)) {
    return { ok: false, error: `Unsupported file type: .${ext}` };
  }
  if (file.size <= 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`,
    };
  }
  const kind = classifyKind(file);
  if (!kind) {
    return { ok: false, error: `Unsupported file type: ${file.type || ext || "unknown"}` };
  }
  return { ok: true, kind };
}

export function filenameFromPath(path: string): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/* ---------------- CRUD ---------------- */

export async function listAttachments(
  companyId: string,
  documentType: AttachmentDocType,
  documentId: string,
): Promise<DocumentAttachment[]> {
  if (!companyId || !documentId) return [];
  const { data, error } = await supabase
    .from("document_attachments")
    .select("*")
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("document_id", documentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as DocumentAttachment[];
}

export async function countAttachments(
  companyId: string,
  documentType: AttachmentDocType,
  documentId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("document_attachments")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", companyId)
    .eq("document_type", documentType)
    .eq("document_id", documentId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function safeAudit(
  companyId: string,
  module: "sales" | "purchase",
  action: string,
  documentType: AttachmentDocType,
  documentId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("log_audit_event", {
      _company_id: companyId,
      _module: module,
      _action: action,
      _entity_type: documentType,
      _entity_id: documentId,
      _reference_no: null,
      _old_value: null,
      _new_value: null,
      _amount_impact: null,
      _status: null,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      _metadata: meta,
    });
  } catch {
    // best-effort; never break user flow
  }
}

export async function uploadAttachment(args: {
  companyId: string;
  documentType: AttachmentDocType;
  documentId: string;
  file: File;
}): Promise<DocumentAttachment> {
  const { companyId, documentType, documentId, file } = args;
  const v = validateAttachmentFile(file);
  if (!v.ok) throw new Error(v.error);
  if (!companyId || !documentId) throw new Error("Missing company or document");

  const existing = await countAttachments(companyId, documentType, documentId);
  if (existing >= MAX_FILES_PER_DOCUMENT) {
    throw new Error(`Attachment limit reached (max ${MAX_FILES_PER_DOCUMENT} per document)`);
  }

  const ext = getExt(file.name) || "bin";
  const path = `${companyId}/${documentType}/${documentId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  const insertRow = {
    company_id: companyId,
    document_type: documentType,
    document_id: documentId,
    file_name: file.name.slice(0, 255),
    file_type: file.type || `application/octet-stream`,
    file_size: file.size,
    storage_path: path,
    attachment_kind: v.kind,
    uploaded_by: userId,
  };
  const { data, error } = await supabase
    .from("document_attachments")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) {
    // best-effort cleanup of the orphaned storage object
    await supabase.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => undefined);
    throw error;
  }

  const auditModule = documentType === "sale_invoice" ? "sales" : "purchase";
  const action =
    documentType === "sale_invoice"
      ? "sale_invoice.attachment_uploaded"
      : "purchase_bill.attachment_uploaded";
  await safeAudit(companyId, auditModule, action, documentType, documentId, {
    file_name: insertRow.file_name,
    file_size: insertRow.file_size,
    file_type: insertRow.file_type,
    attachment_kind: v.kind,
  });
  await safeAudit(companyId, auditModule, "attachment.uploaded", documentType, documentId, {
    file_name: insertRow.file_name,
    file_size: insertRow.file_size,
    file_type: insertRow.file_type,
  });

  return data as DocumentAttachment;
}

export async function removeAttachment(att: DocumentAttachment): Promise<void> {
  await supabase.storage
    .from(BUCKET)
    .remove([att.storage_path])
    .catch(() => undefined);
  const { error } = await supabase
    .from("document_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", att.id);
  if (error) throw error;
  const auditModule = att.document_type === "sale_invoice" ? "sales" : "purchase";
  await safeAudit(
    att.company_id,
    auditModule,
    "attachment.deleted",
    att.document_type,
    att.document_id,
    {
      file_name: att.file_name,
      file_size: att.file_size,
      file_type: att.file_type,
    },
  );
}

export async function getAttachmentUrl(
  att: DocumentAttachment,
  opts: { download?: boolean; expiresIn?: number } = {},
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      att.storage_path,
      opts.expiresIn ?? 300,
      opts.download ? { download: att.file_name } : undefined,
    );
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadAttachmentFile(att: DocumentAttachment): Promise<boolean> {
  const url = await getAttachmentUrl(att, { download: true });
  if (!url) return false;
  const auditModule = att.document_type === "sale_invoice" ? "sales" : "purchase";
  await safeAudit(
    att.company_id,
    auditModule,
    "attachment.downloaded",
    att.document_type,
    att.document_id,
    {
      file_name: att.file_name,
      file_size: att.file_size,
      file_type: att.file_type,
    },
  );
  if (typeof document === "undefined") return true;
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = att.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
