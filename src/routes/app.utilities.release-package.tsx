import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, Copy, CheckCircle2, FileArchive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/utilities/release-package")({
  component: ReleasePackagePage,
});

const PKG = {
  filename: "erpovo-release-package-2026-06-14T19-04-08.zip",
  href: "/releases/erpovo-release-package-2026-06-14T19-04-08.zip",
  sizeLabel: "3.27 MB",
  generatedAt: "2026-06-14T19:04:08Z",
  totalEntries: 714,
  buildFiles: 693,
  sha256: "6e9d135e5ec97e458f7c0aeb04033d533493bd546a44ec3121bf828f91420589",
  includedDocs: [
    "qa-summary.json",
    "qa-summary.sha256",
    "QA_SUMMARY.md",
    "RELEASE_NOTES.md",
    "ci/ci.yml",
    "CHECKLIST.md",
    "RESTORE_INSTRUCTIONS.md",
    "CI_WORKFLOW_SUMMARY.md",
    "PERFORMANCE_BENCHMARK.md",
    "RESTORE_SAFETY.md",
    "PACKAGE_MANIFEST.json",
    "build/dist/**",
  ],
  excluded: [".env", "API keys", "auth tokens", "*secret*", "*.pem", "node_modules", "perf_stress*"],
};

const CHECKLIST = [
  { id: "downloaded", label: "Package downloaded" },
  { id: "sha", label: "SHA-256 copied/saved" },
  { id: "snapshot", label: "Company data snapshot downloaded separately" },
  { id: "creds", label: "API credentials (WooCommerce / Steadfast) stored separately" },
  { id: "ready", label: "Ready to publish" },
];

function ReleasePackagePage() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecks((c) => ({ ...c, [id]: !c[id] }));

  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(PKG.sha256);
      toast.success("SHA-256 copied to clipboard");
      setChecks((c) => ({ ...c, sha: true }));
    } catch {
      toast.error("Copy failed");
    }
  };

  const onDownload = () => {
    setChecks((c) => ({ ...c, downloaded: true }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Release Package" subtitle="Download the final ERPOVO release/backup package" />

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Download and store this backup before publishing.</AlertTitle>
        <AlertDescription>
          This package contains the QA-verified release artifacts, CI workflow snapshot, restore
          instructions, and the production build. Keep it in safe offline storage.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            ERPOVO Release Package
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" onClick={onDownload}>
              <a href={PKG.href} download={PKG.filename}>
                <Download className="mr-2 h-4 w-4" />
                Download ERPOVO Release Package
              </a>
            </Button>
            <Button variant="outline" onClick={copySha}>
              <Copy className="mr-2 h-4 w-4" />
              Copy SHA-256
            </Button>
            <Badge variant="secondary" className="self-center">Release-ready: YES</Badge>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Filename</dt><dd className="font-mono break-all">{PKG.filename}</dd></div>
            <div><dt className="text-muted-foreground">Size</dt><dd>{PKG.sizeLabel}</dd></div>
            <div><dt className="text-muted-foreground">Generated</dt><dd>{PKG.generatedAt}</dd></div>
            <div><dt className="text-muted-foreground">Total entries</dt><dd>{PKG.totalEntries} ({PKG.buildFiles} build files)</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Manifest SHA-256</dt>
              <dd className="font-mono text-xs break-all">{PKG.sha256}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Included docs</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {PKG.includedDocs.map((d) => (
              <li key={d} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="font-mono text-xs">{d}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Excluded (confirmed)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PKG.excluded.map((x) => (
              <Badge key={x} variant="outline" className="font-mono text-xs">{x}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No .env, API keys, auth tokens, payment secrets, node_modules, or PERF stress data are
            packaged.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Verify &amp; download checklist</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {CHECKLIST.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Checkbox id={c.id} checked={!!checks[c.id]} onCheckedChange={() => toggle(c.id)} />
                <label htmlFor={c.id} className="text-sm cursor-pointer select-none">{c.label}</label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
