import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Paperclip, Image as ImageIcon, FileText, Download, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_FILES_PER_DOCUMENT,
  downloadAttachmentFile,
  getAttachmentUrl,
  listAttachments,
  removeAttachment,
  uploadAttachment,
  validateAttachmentFile,
  type AttachmentDocType,
  type DocumentAttachment,
} from "@/lib/document-attachments";

export type AttachmentsSectionHandle = {
  /** Upload any pending files for a freshly created document. Returns true on full success. */
  flushPending: (newDocumentId: string) => Promise<boolean>;
  /** Number of pending (un-uploaded) files. */
  pendingCount: () => number;
};

type Props = {
  companyId: string | null | undefined;
  documentType: AttachmentDocType;
  /** null/undefined while the parent document is unsaved. */
  documentId: string | null | undefined;
  /** Hide the whole section (e.g. user lacks permission). */
  disabled?: boolean;
};

type PendingStatus = "pending" | "uploading" | "failed";

type PendingFile = {
  id: string;
  file: File;
  kind: "image" | "document";
  status: PendingStatus;
  error?: string;
};

export const AttachmentsSection = forwardRef<AttachmentsSectionHandle, Props>(
  function AttachmentsSection({ companyId, documentType, documentId, disabled }, ref) {
    const { t } = useI18n();
    const [items, setItems] = useState<DocumentAttachment[]>([]);
    const [pending, setPending] = useState<PendingFile[]>([]);
    const [busy, setBusy] = useState(false);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const imageInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    const refresh = async () => {
      if (!companyId || !documentId) {
        setItems([]);
        return;
      }
      try {
        const list = await listAttachments(companyId, documentType, documentId);
        setItems(list);
      } catch (e) {
        toast.error((e as Error).message || "Failed to load attachments");
      }
    };

    useEffect(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, documentType, documentId]);

    // Lazy-load signed URLs for image thumbnails.
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const next: Record<string, string> = {};
        for (const it of items) {
          if (it.attachment_kind !== "image") continue;
          if (thumbs[it.id]) {
            next[it.id] = thumbs[it.id];
            continue;
          }
          const url = await getAttachmentUrl(it, { expiresIn: 600 });
          if (cancelled) return;
          if (url) next[it.id] = url;
        }
        if (!cancelled) setThumbs(next);
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const onPick = (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const accepted: PendingFile[] = [];
      const total = items.length + pending.length;
      for (const file of Array.from(files)) {
        if (total + accepted.length >= MAX_FILES_PER_DOCUMENT) {
          toast.error(`${t("Attachment limit reached")} (${MAX_FILES_PER_DOCUMENT})`);
          break;
        }
        const v = validateAttachmentFile(file);
        if (!v.ok) {
          toast.error(`${file.name}: ${t(v.error) || v.error}`);
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          kind: v.kind,
          status: "pending",
        });
      }
      if (accepted.length === 0) return;
      setPending((p) => [...p, ...accepted]);
      if (documentId) {
        void uploadBatch(accepted, documentId);
      }
    };

    const setPendingStatus = (id: string, status: PendingStatus, error?: string) => {
      setPending((cur) => cur.map((p) => (p.id === id ? { ...p, status, error } : p)));
    };

    /**
     * Upload a batch. Per-file status is tracked on the pending row; on
     * success the row is removed (it becomes a real saved attachment after
     * refresh). On failure the row remains with status="failed" + error.
     */
    const uploadBatch = async (
      batch: PendingFile[],
      docId: string,
    ): Promise<{ ok: number; failed: number; failedIds: Set<string> }> => {
      const failedIds = new Set<string>();
      if (!companyId) {
        for (const p of batch) {
          failedIds.add(p.id);
          setPendingStatus(p.id, "failed", "Missing company");
        }
        return { ok: 0, failed: batch.length, failedIds };
      }
      setBusy(true);
      let ok = 0;
      let failed = 0;
      const successIds: string[] = [];
      for (const p of batch) {
        setPendingStatus(p.id, "uploading");
        try {
          await uploadAttachment({
            companyId,
            documentType,
            documentId: docId,
            file: p.file,
          });
          ok += 1;
          successIds.push(p.id);
        } catch (e) {
          failed += 1;
          failedIds.add(p.id);
          const msg = (e as Error).message || t("Upload failed");
          setPendingStatus(p.id, "failed", msg);
          toast.error(`${p.file.name}: ${msg}`);
        }
      }
      setBusy(false);
      if (ok > 0) toast.success(t("Attachment uploaded"));
      // Remove successful entries; failed entries stay for retry.
      setPending((cur) => cur.filter((p) => !successIds.includes(p.id)));
      await refresh();
      return { ok, failed, failedIds };
    };

    const onRetryPending = async (id: string) => {
      const p = pending.find((x) => x.id === id);
      if (!p || !documentId) return;
      await uploadBatch([p], documentId);
    };

    useImperativeHandle(ref, () => ({
      flushPending: async (newDocumentId: string) => {
        const batch = pending.filter((p) => p.status !== "uploading");
        if (batch.length === 0) return true;
        const { failed } = await uploadBatch(batch, newDocumentId);
        return failed === 0;
      },
      pendingCount: () => pending.length,
    }));

    const onRemove = async (att: DocumentAttachment) => {
      if (!window.confirm(`${t("Remove Attachment")}: ${att.file_name}?`)) return;
      try {
        await removeAttachment(att);
        toast.success(t("Attachment removed"));
        await refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    };

    const onRemovePending = (id: string) => {
      setPending((p) => p.filter((x) => x.id !== id));
    };

    const onDownload = async (att: DocumentAttachment) => {
      const ok = await downloadAttachmentFile(att);
      if (!ok) toast.error(t("Download failed"));
    };

    const onOpen = async (att: DocumentAttachment) => {
      const url = await getAttachmentUrl(att, { expiresIn: 600 });
      if (!url) {
        toast.error(t("Could not open attachment"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    };

    if (disabled) return null;

    const total = items.length + pending.length;

    return (
      <div
        data-testid="attachments-section"
        className="mt-6 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t("Attachments")}</h3>
            <span className="text-xs text-muted-foreground">
              ({total}/{MAX_FILES_PER_DOCUMENT})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
              data-testid="attach-image-input"
            />
            <input
              ref={docInputRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
              data-testid="attach-doc-input"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || total >= MAX_FILES_PER_DOCUMENT}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4 mr-1" />
              {t("Attach Images")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || total >= MAX_FILES_PER_DOCUMENT}
              onClick={() => docInputRef.current?.click()}
            >
              <FileText className="w-4 h-4 mr-1" />
              {t("Attach Documents")}
            </Button>
          </div>
        </div>

        {!documentId && pending.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            {t("Files will be uploaded after you save.")}
          </p>
        )}

        {total === 0 && <p className="text-xs text-muted-foreground">{t("No attachments yet")}</p>}

        {/* Saved images */}
        {items.filter((i) => i.attachment_kind === "image").length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-3">
            {items
              .filter((i) => i.attachment_kind === "image")
              .map((it) => (
                <div
                  key={it.id}
                  className="relative group border border-border rounded-md overflow-hidden bg-muted/30 aspect-square"
                >
                  {thumbs[it.id] ? (
                    <img
                      src={thumbs[it.id]}
                      alt={it.file_name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => onOpen(it)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-background/80 backdrop-blur-sm flex justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onDownload(it)}
                      aria-label={t("Download Attachment")}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => onRemove(it)}
                      aria-label={t("Remove Attachment")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="absolute top-0 left-0 right-0 bg-background/70 text-[10px] truncate px-1 py-0.5">
                    {it.file_name}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Saved documents */}
        {items.filter((i) => i.attachment_kind === "document").length > 0 && (
          <ul className="space-y-1 mb-2">
            {items
              .filter((i) => i.attachment_kind === "document")
              .map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{it.file_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({Math.max(1, Math.round(it.file_size / 1024))} KB)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onOpen(it)}
                      aria-label="open"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onDownload(it)}
                      aria-label={t("Download Attachment")}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onRemove(it)}
                      aria-label={t("Remove Attachment")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}

        {/* Pending / uploading / failed files (not yet saved attachments) */}
        {pending.length > 0 && (
          <div className="border-t border-border pt-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t("Pending upload")} ({pending.length})
            </p>
            <ul className="space-y-1" data-testid="pending-list">
              {pending.map((p) => {
                const statusLabel =
                  p.status === "uploading"
                    ? t("Uploading")
                    : p.status === "failed"
                      ? t("Failed")
                      : t("Pending");
                const badgeClass =
                  p.status === "uploading"
                    ? "bg-primary/10 text-primary"
                    : p.status === "failed"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground";
                return (
                  <li
                    key={p.id}
                    data-testid={`pending-item-${p.id}`}
                    data-status={p.status}
                    className="flex items-center justify-between gap-2 text-sm border border-dashed border-border rounded-md px-2 py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {p.kind === "image" ? (
                        <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{p.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({Math.max(1, Math.round(p.file.size / 1024))} KB)
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${badgeClass}`}
                        data-testid={`pending-status-${p.id}`}
                      >
                        {p.status === "uploading" && (
                          <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                        )}
                        {statusLabel}
                      </span>
                      {p.status === "failed" && p.error && (
                        <span className="text-xs text-destructive truncate" title={p.error}>
                          — {p.error}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.status === "failed" && documentId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => onRetryPending(p.id)}
                          data-testid={`pending-retry-${p.id}`}
                        >
                          {t("Retry")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onRemovePending(p.id)}
                        aria-label={t("Remove from queue")}
                        disabled={p.status === "uploading"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  },
);
