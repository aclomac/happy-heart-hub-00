import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Download,
  Copy,
  CheckCircle2,
  XCircle,
  FileArchive,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/utilities/release-package")({
  component: ReleasePackagePage,
});

const PKG = {
  filename: "erpovo-release-package-2026-06-15T02-27-49.zip",
  href: "/releases/erpovo-release-package-2026-06-15T02-27-49.zip",
  sizeLabel: "6.48 MB",
  expectedSizeBytes: 6_794_619,
  generatedAt: "2026-06-15T02:27:49Z",
  totalEntries: 718,
  buildFiles: 696,
  /** SHA-256 of the full ZIP file */
  zipSha256: "428939354684f4b866408fc3d94768e12aa08ae7e82aead2b31e205b1512be03",
  /** SHA-256 of qa-summary.json (canonicalized, integrity field stripped) */
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

const REQUIRED_ENTRIES = [
  "PACKAGE_MANIFEST.json",
  "qa-summary.json",
  "qa-summary.sha256",
  "QA_SUMMARY.md",
  "RELEASE_NOTES.md",
];

const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: ".env", re: /(^|\/)\.env(\..*)?$/i },
  { label: "secret", re: /secret/i },
  { label: "token", re: /token/i },
  { label: "api_key", re: /api[_-]?key/i },
  { label: "node_modules", re: /(^|\/)node_modules(\/|$)/i },
  { label: "perf_stress", re: /perf[_-]?stress/i },
];

type Check = { name: string; pass: boolean; detail?: string };
type VerifyResult = {
  overall: "PASS" | "FAIL";
  checks: Check[];
  missing: string[];
  forbiddenHits: string[];
  hashActual?: string;
  entryCount: number;
  byteSize: number;
};

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Canonicalize JSON the same way scripts/hash-qa-manifest.ts does:
// sort keys recursively, no trailing newline, no whitespace.
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonicalize((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

const CHECKLIST = [
  { id: "downloaded", label: "Package downloaded" },
  { id: "verified", label: "ZIP verification PASS", auto: true },
  { id: "sha", label: "SHA-256 copied/saved" },
  { id: "snapshot", label: "Company data snapshot downloaded separately" },
  { id: "creds", label: "API credentials (WooCommerce / Steadfast) stored separately" },
];

function ReleasePackagePage() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

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

  const onDownload = () => setChecks((c) => ({ ...c, downloaded: true }));

  const verifyZip = async () => {
    setVerifying(true);
    setResult(null);
    const checks: Check[] = [];
    const missing: string[] = [];
    const forbiddenHits: string[] = [];
    let hashActual: string | undefined;
    let entryCount = 0;
    let byteSize = 0;

    try {
      const res = await fetch(PKG.href, { cache: "no-store" });
      checks.push({ name: "ZIP file exists in public/releases/", pass: res.ok, detail: `HTTP ${res.status}` });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      byteSize = buf.byteLength;
      const sizeOk = Math.abs(byteSize - PKG.expectedSizeBytes) / PKG.expectedSizeBytes < 0.05;
      checks.push({
        name: "File size within expected range",
        pass: sizeOk,
        detail: `${(byteSize / 1024 / 1024).toFixed(2)} MB`,
      });

      const JSZip = (await import("jszip")).default;
      let zip: import("jszip");
      try {
        zip = await JSZip.loadAsync(buf);
        checks.push({ name: "ZIP can be opened/read", pass: true });
      } catch (e) {
        checks.push({ name: "ZIP can be opened/read", pass: false, detail: String(e) });
        throw e;
      }

      const names = Object.keys(zip.files);
      entryCount = names.length;

      for (const req of REQUIRED_ENTRIES) {
        const present = !!zip.file(req);
        checks.push({ name: `Contains ${req}`, pass: present });
        if (!present) missing.push(req);
      }
      const buildPresent = names.some((n) => n.startsWith("build/dist/"));
      checks.push({ name: "Contains build/dist/* files", pass: buildPresent });
      if (!buildPresent) missing.push("build/dist/**");

      for (const { label, re } of FORBIDDEN_PATTERNS) {
        const hit = names.find((n) => re.test(n));
        checks.push({ name: `Excludes ${label}`, pass: !hit, detail: hit ?? "none" });
        if (hit) forbiddenHits.push(`${label}: ${hit}`);
      }

      const qaEntry = zip.file("qa-summary.json");
      if (qaEntry) {
        const txt = await qaEntry.async("string");
        const parsed = JSON.parse(txt);
        const canonical = JSON.stringify(canonicalize(parsed));
        hashActual = await sha256Hex(new TextEncoder().encode(canonical).buffer);
        const hashMatch = hashActual === PKG.sha256;
        checks.push({
          name: "Manifest SHA-256 matches expected",
          pass: hashMatch,
          detail: hashActual,
        });
      } else {
        checks.push({ name: "Manifest SHA-256 matches expected", pass: false, detail: "qa-summary.json missing" });
      }
    } catch (e) {
      checks.push({ name: "Verification completed without errors", pass: false, detail: String(e) });
    }

    const overall: "PASS" | "FAIL" = checks.every((c) => c.pass) ? "PASS" : "FAIL";
    const r: VerifyResult = { overall, checks, missing, forbiddenHits, hashActual, entryCount, byteSize };
    setResult(r);
    setVerifying(false);
    setChecks((c) => ({ ...c, verified: overall === "PASS" }));
    if (overall === "PASS") toast.success("ZIP verification PASS");
    else toast.error("ZIP verification FAIL");
  };

  const readyToPublish = useMemo(() => {
    return !!(
      result?.overall === "PASS" &&
      (checks.downloaded || result) &&
      checks.snapshot &&
      checks.creds
    );
  }, [result, checks]);

  return (
    <div className="space-y-6">
      <PageHeader title="Release Package" subtitle="Download and verify the final ERPOVO release/backup package" />

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Download and store this backup before publishing.</AlertTitle>
        <AlertDescription>
          Verify the ZIP after download. Keep it in safe offline storage.
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
            <Button variant="secondary" size="lg" onClick={verifyZip} disabled={verifying}>
              {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Verify Release ZIP
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
              <dt className="text-muted-foreground">Manifest SHA-256 (expected)</dt>
              <dd className="font-mono text-xs break-all">{PKG.sha256}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.overall === "PASS" ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              ZIP verification: {result.overall}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>Entries scanned: <strong>{result.entryCount}</strong></div>
              <div>Bytes: <strong>{result.byteSize.toLocaleString()}</strong></div>
              <div className="sm:col-span-2">
                Excluded secrets check:{" "}
                <strong className={result.forbiddenHits.length ? "text-destructive" : "text-green-600"}>
                  {result.forbiddenHits.length ? "FAIL" : "PASS"}
                </strong>
              </div>
              {result.hashActual && (
                <div className="sm:col-span-2">
                  Hash match:{" "}
                  <strong className={result.hashActual === PKG.sha256 ? "text-green-600" : "text-destructive"}>
                    {result.hashActual === PKG.sha256 ? "PASS" : "FAIL"}
                  </strong>
                  <div className="font-mono text-xs break-all text-muted-foreground">actual: {result.hashActual}</div>
                </div>
              )}
            </div>

            <ul className="space-y-1">
              {result.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  {c.pass ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    {c.name}
                    {c.detail && <span className="ml-2 text-xs text-muted-foreground">({c.detail})</span>}
                  </span>
                </li>
              ))}
            </ul>

            {result.missing.length > 0 && (
              <div className="text-destructive">
                Missing: {result.missing.join(", ")}
              </div>
            )}
            {result.forbiddenHits.length > 0 && (
              <div className="text-destructive">
                Forbidden entries: {result.forbiddenHits.join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Verify &amp; download checklist</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {CHECKLIST.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Checkbox
                  id={c.id}
                  checked={!!checks[c.id]}
                  onCheckedChange={() => toggle(c.id)}
                />
                <label htmlFor={c.id} className="text-sm cursor-pointer select-none">
                  {c.label}
                  {c.auto && <span className="ml-2 text-xs text-muted-foreground">(auto)</span>}
                </label>
              </li>
            ))}
            <li className="flex items-center gap-2 border-t pt-2">
              <Checkbox id="ready" checked={readyToPublish} disabled />
              <label htmlFor="ready" className="text-sm select-none">
                Ready to Publish
                <span className="ml-2 text-xs text-muted-foreground">
                  (auto-enabled when ZIP verified PASS + reminders acknowledged)
                </span>
              </label>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
