import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getAllDiagnostics, clearDiagnostic,
  type DiagnosticResult,
} from "@/lib/integrations/diagnostics";
import { useState } from "react";

function badge(d: DiagnosticResult) {
  const palette: Record<DiagnosticResult["status"], string> = {
    success: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-700",
    blocked: "bg-amber-100 text-amber-800",
    skipped: "bg-slate-100 text-slate-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${palette[d.status]}`}>{d.status.toUpperCase()}</span>;
}

export function DiagnosticsPanel({ providers, title = "Integration Diagnostics" }: { providers?: string[]; title?: string }) {
  const [, force] = useState(0);
  const all = getAllDiagnostics();
  const entries = Object.entries(all)
    .filter(([k]) => !providers || providers.includes(k))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return (
      <Card className="mb-4"><CardContent className="pt-4 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">{title}</div>
        No API calls made yet. Run a Test Connection to populate diagnostics.
      </CardContent></Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="font-semibold mb-2">{title}</div>
        <div className="space-y-2">
          {entries.map(([key, d]) => (
            <div key={key} className="border rounded p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {badge(d)}
                  <span className="font-medium">{d.provider}</span>
                  <span className="text-muted-foreground">· {d.action}</span>
                  {d.httpStatus ? <span className="text-muted-foreground">· HTTP {d.httpStatus}</span> : null}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>{new Date(d.at).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(d.message).then(() => toast.success("Copied")); }}>Copy Error</Button>
                  <Button size="sm" variant="ghost" onClick={() => { clearDiagnostic(key); force((n) => n + 1); }}>Clear</Button>
                </div>
              </div>
              {d.url ? <div className="text-muted-foreground truncate"><b>URL:</b> {d.url}</div> : null}
              <div><b>Message:</b> {d.message}</div>
              <div className="text-muted-foreground">
                <b>Error kind:</b> {d.errorKind}
                {d.maskedCreds ? <> · <b>Keys:</b> {Object.entries(d.maskedCreds).map(([k, v]) => `${k}=${v}`).join(" ")}</> : null}
              </div>
              {d.rawSafe !== undefined ? (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">View Raw Safe Response</summary>
                  <pre className="mt-1 max-h-48 overflow-auto bg-muted/40 p-2 rounded text-[11px]">{typeof d.rawSafe === "string" ? d.rawSafe : JSON.stringify(d.rawSafe, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
