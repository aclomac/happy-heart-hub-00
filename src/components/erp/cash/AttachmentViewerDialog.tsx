import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  resolveAttachmentUrl,
  downloadAttachment,
  getAttachmentKind,
  getAttachmentFilename,
} from "@/lib/cash-attachments";
import { toast } from "sonner";

export function AttachmentViewerDialog({
  open,
  onOpenChange,
  path,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  path: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = path ? getAttachmentKind(path) : "other";
  const filename = path ? getAttachmentFilename(path) : "";

  useEffect(() => {
    let cancelled = false;
    if (!open || !path) {
      setUrl(null);
      return;
    }
    setLoading(true);
    resolveAttachmentUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  const download = async () => {
    if (!path) return;
    const ok = await downloadAttachment(path);
    if (!ok) toast.error("Could not load attachment");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm truncate">Attachment · {filename}</DialogTitle>
        </DialogHeader>

        <div className="min-h-[200px] flex items-center justify-center bg-muted/30 rounded">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : !url ? (
            <div className="text-sm text-muted-foreground">Could not load attachment</div>
          ) : kind === "image" ? (
            <img src={url} alt={filename} className="max-h-[60vh] w-auto object-contain rounded" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={filename} className="w-full h-[60vh] rounded border" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
              <FileText className="w-8 h-8" />
              <span>Preview not available</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {url && (
            <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Open in new tab
            </Button>
          )}
          <Button size="sm" onClick={download} disabled={!path}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
