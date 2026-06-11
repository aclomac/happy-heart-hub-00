import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Upload,
  Download,
  Barcode,
  Gift,
  RefreshCw,
  FileCheck2,
  Trash2,
  CalendarX,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { resetAndReseedDemo } from "@/lib/demo/resetDemo";

export const Route = createFileRoute("/app/utilities/")({ component: UtilitiesIndex });

type Tile = {
  i: LucideIcon;
  n: string;
  d: string;
  to?: string;
  comingSoon?: boolean;
};

const tiles: Tile[] = [
  { i: Upload, n: "Import Items", d: "Upload CSV file", to: "/app/utilities/import-items" },
  { i: Upload, n: "Import Parties", d: "Upload CSV file", to: "/app/utilities/import-parties" },
  { i: FileCheck2, n: "Import / Export", d: "Vyapar backup & ERPOVO backup", to: "/app/utilities/import-export" },
  { i: Download, n: "Export Items", d: "Download as CSV", to: "/app/utilities/export-items" },
  { i: Download, n: "Export to Tally", d: "Tally XML export", comingSoon: true },
  { i: Barcode, n: "Barcode Generator", d: "Print labels", to: "/app/utilities/barcode-generator" },
  { i: RefreshCw, n: "Bulk Update Items", d: "Edit items in bulk", to: "/app/utilities/bulk-update-items" },
  { i: FileCheck2, n: "Verify My Data", d: "Run data & security checks", to: "/app/admin/security-tests" },
  { i: Gift, n: "Refer & Earn", d: "Invite & earn rewards", comingSoon: true },
  { i: Trash2, n: "Recycle Bin", d: "Restore deleted records", to: "/app/recycle-bin" },
  { i: CalendarX, n: "Close Financial Year", d: "Reset numbers, fresh start", to: "/app/utilities/close-financial-year" },
];

function UtilitiesIndex() {
  const navigate = useNavigate();

  const handle = (t: Tile) => {
    if (t.comingSoon || !t.to) {
      toast.info(`${t.n}: coming soon`, { description: "This utility isn't available yet." });
      return;
    }
    navigate({ to: t.to });
  };

  const handleReset = () => {
    if (typeof window !== "undefined" &&
        !window.confirm("Reset all local demo business data and reload Chair King demo content?")) return;
    resetAndReseedDemo();
    toast.success("Full demo data reloaded");
    setTimeout(() => {
      navigate({ to: "/app" });
      if (typeof window !== "undefined") window.location.reload();
    }, 600);
  };

  return (
    <div>
      <PageHeader title="Utilities" subtitle="Import, export, barcode, financial year tools" />

      <Card className="mb-4 border-primary/40">
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary"><Sparkles className="w-5 h-5" /></div>
            <div>
              <div className="font-semibold">Reset &amp; Load Full Demo Data</div>
              <div className="text-xs text-muted-foreground">
                Wipes local demo records (items, parties, sales, online store, etc.) and reloads the full Chair King demo dataset.
              </div>
            </div>
          </div>
          <Button onClick={handleReset} variant="default">
            <RefreshCw className="w-4 h-4 mr-2" />Reset &amp; Reload
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {tiles.map((t) => (
          <button
            key={t.n}
            type="button"
            onClick={() => handle(t)}
            aria-label={t.n}
            data-testid={`util-${t.n.toLowerCase().replace(/\s+/g, "-")}`}
            className="text-left bg-card border rounded-md p-4 hover:border-primary hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <t.i className="w-6 h-6 text-primary mb-2" />
            <div className="font-semibold text-sm flex items-center gap-2">
              {t.n}
              {t.comingSoon && (
                <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.d}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
