import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import { getSyncLogs, setSyncLogs, getWebsites, type EcoSyncLog } from "@/lib/demo/ecommerce";
import { Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/sync-logs")({ component: SyncLogsPage });

function SyncLogsPage() {
  const [list, setList] = useState<EcoSyncLog[]>(() => getSyncLogs());
  const websites = getWebsites();

  const clear = () => {
    if (!confirm("Clear all sync logs?")) return;
    setList([]); setSyncLogs([]);
    toast.success("Cleared");
  };
  const exportLogs = () => {
    const csv = [
      ["Time", "Website", "Action", "Status", "New", "Updated", "Failed", "Error"].join(","),
      ...list.map((l) => [l.time, websites.find((w) => w.id === l.websiteId)?.name || l.websiteId, l.action, l.status, l.newOrders, l.updatedOrders, l.failed, l.errorMessage || ""].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = "ecommerce-sync-logs.csv"; a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div>
      <PageHeader
        title="Sync Logs"
        subtitle="Track every sync/import action"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" variant="outline" onClick={exportLogs}><Download className="w-4 h-4 mr-1" /> Export</Button>
            <Button size="sm" variant="outline" onClick={clear}><Trash2 className="w-4 h-4 mr-1" /> Clear</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Time</th><th>Website</th><th>Action</th><th>Status</th><th>New</th><th>Updated</th><th>Failed</th><th>Error</th></tr></thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 text-xs">{new Date(l.time).toLocaleString()}</td>
                  <td>{websites.find((w) => w.id === l.websiteId)?.name || "—"}</td>
                  <td>{l.action}</td>
                  <td><StatusBadge status={l.status === "success" ? "Delivered" : l.status} /></td>
                  <td>{l.newOrders}</td>
                  <td>{l.updatedOrders}</td>
                  <td>{l.failed}</td>
                  <td className="text-rose-600 text-xs">{l.errorMessage || "—"}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No logs yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
