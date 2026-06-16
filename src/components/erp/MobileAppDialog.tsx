import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, ExternalLink, Copy, Share2, CheckCircle2, AlertTriangle, Apple, Chrome, Monitor } from "lucide-react";
import { toast } from "sonner";
import { usePWA } from "@/hooks/use-pwa";
import { isDemoMode } from "@/lib/demo/localStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getAppUrl() {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  return `${protocol}//${host}/app`;
}

function isPublishedHost(host: string) {
  // Preview hosts include id-preview-- prefix; published lovable.app or custom domains otherwise
  if (!host) return false;
  if (host.includes("id-preview--")) return false;
  if (host.startsWith("localhost") || host.startsWith("127.")) return false;
  return true;
}

export function MobileAppDialog({ open, onOpenChange }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const { isInstallAvailable, isInstalled, install } = usePWA();
  const appUrl = useMemo(() => getAppUrl(), []);
  const host = typeof window !== "undefined" ? window.location.host : "";
  const isPublished = isPublishedHost(host);
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const hasSW = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const demo = isDemoMode();
  const company = "Chair King";

  useEffect(() => {
    if (!open || !appUrl) return;
    QRCode.toDataURL(appUrl, { width: 220, margin: 1, color: { dark: "#061B3A", light: "#FFFFFF" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [open, appUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      toast.success("App link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: "ERPOVO Mobile App",
          text: "Manage your business on the go",
          url: appUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  const handleInstall = async () => {
    if (isInstallAvailable) {
      await install();
    } else {
      toast.message("Use your browser menu", {
        description: "Open browser menu → Install app / Add to Home Screen",
      });
    }
  };

  const openMobile = () => {
    window.open(appUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> Get ERPOVO Mobile App
          </DialogTitle>
          <DialogDescription>Manage your business on the go</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Brand */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="grid place-items-center w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#0EA5A8] to-[#2563EB] text-white">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">ERPOVO Mobile App</div>
              <div className="text-xs text-muted-foreground truncate">Company: {company}</div>
              <div className="text-xs text-muted-foreground truncate">{appUrl}</div>
            </div>
          </div>


          {/* QR */}
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg border">
            {!isPublished ? (
              <div className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2 w-full">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="min-w-0">Preview links may change. Publish for permanent mobile access.</span>
              </div>
            ) : null}
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code to open ERPOVO on mobile" className="w-40 h-40 sm:w-48 sm:h-48 max-w-full" />
            ) : (
              <div className="w-40 h-40 sm:w-48 sm:h-48 grid place-items-center text-xs text-muted-foreground">Generating QR…</div>
            )}
            <div className="text-xs text-muted-foreground text-center">Scan with your phone camera</div>
          </div>


          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={handleInstall} disabled={isInstalled} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              {isInstalled ? "Installed" : "Install App"}
            </Button>
            <Button variant="outline" onClick={openMobile} className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" /> Open Mobile
            </Button>
            <Button variant="outline" onClick={handleCopy} className="w-full">
              <Copy className="w-4 h-4 mr-2" /> Copy Link
            </Button>
            <Button variant="outline" onClick={handleShare} className="w-full">
              <Share2 className="w-4 h-4 mr-2" /> Share Link
            </Button>
          </div>

          {/* Status checklist */}
          <div className="rounded-lg border p-3 text-sm space-y-1.5">
            <div className="font-medium mb-1">Install readiness</div>
            <Check ok={true} label="Manifest available" />
            <Check ok={hasSW} label="Service worker supported" />
            <Check ok={isHttps} label="HTTPS available" />
            <Check ok={isInstallAvailable || isInstalled} label="Install prompt supported" />
            <Check ok={isPublished} label="Published URL available" />
          </div>

          {/* Local mode notice */}
          {demo ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
              Local mode data is stored on this device/browser. For multi-device sync, connect Cloud/Live sync. Installing on another phone will not share your data — use backup/restore or cloud sync.
            </div>
          ) : null}

          {/* Instructions */}
          <div className="space-y-3">
            <Instructions
              icon={<Chrome className="w-4 h-4" />}
              title="Android Chrome"
              steps={["Open this link in Chrome", "Tap the three-dots menu", "Tap “Add to Home screen”", "Tap Install"]}
            />
            <Instructions
              icon={<Apple className="w-4 h-4" />}
              title="iPhone Safari"
              steps={["Open this link in Safari", "Tap the Share button", "Tap “Add to Home Screen”", "Tap Add"]}
            />
            <Instructions
              icon={<Monitor className="w-4 h-4" />}
              title="Desktop Chrome / Edge"
              steps={["Click the install icon in the address bar", "Or open browser menu → Install ERPOVO"]}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-500" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function Instructions({ icon, title, steps }: { icon: React.ReactNode; title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="font-medium flex items-center gap-2 mb-1">{icon} {title}</div>
      <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-0.5">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}

export function getMobileAppStatus(): "ready" | "publish" | "offline" {
  if (typeof window === "undefined") return "publish";
  if (!navigator.onLine) return "offline";
  if (isPublishedHost(window.location.host)) return "ready";
  return "publish";
}
