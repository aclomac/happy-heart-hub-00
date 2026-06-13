/**
 * Integration diagnostics
 * -----------------------
 * Shared structures for the WooCommerce + Steadfast service layer.
 * Every API call returns a `DiagnosticResult` — never `boolean` / `null` —
 * so the UI can always render a clear success/failure reason.
 *
 * Diagnostic results are persisted to localStorage so the diagnostics
 * panel can show "Last tested at …" across page refreshes.
 *
 * SECURITY: secrets are masked before being persisted or rendered.
 */

export type IntegrationMode =
  | "local-demo"
  | "direct-browser"
  | "backend-proxy"
  | "electron-proxy";

export type DiagStatus = "success" | "failed" | "blocked" | "skipped";

export type DiagErrorKind =
  | "none"
  | "cors"
  | "network"
  | "auth"
  | "not_found"
  | "validation"
  | "ssl"
  | "parse"
  | "config"
  | "mode_disabled"
  | "server"
  | "unknown";

export interface DiagnosticResult {
  provider: string;
  action: string;
  url?: string;
  status: DiagStatus;
  httpStatus?: number;
  errorKind: DiagErrorKind;
  message: string;
  rawSafe?: unknown;
  maskedCreds?: Record<string, string>;
  at: string; // ISO time
  durationMs?: number;
}

const DIAG_KEY = "erpovo:eco:integration_diag_v1";

function readAll(): Record<string, DiagnosticResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DiagnosticResult>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, DiagnosticResult>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

export function saveDiagnostic(key: string, r: DiagnosticResult) {
  const all = readAll();
  all[key] = r;
  writeAll(all);
}

export function getDiagnostic(key: string): DiagnosticResult | undefined {
  return readAll()[key];
}

export function getAllDiagnostics(): Record<string, DiagnosticResult> {
  return readAll();
}

export function clearDiagnostic(key: string) {
  const all = readAll();
  delete all[key];
  writeAll(all);
}

/** Mask a secret value like `abcdef1234` → `ab****1234`. */
export function maskSecret(s: string | undefined | null, prefix = 2, suffix = 4): string {
  if (!s) return "—";
  const v = String(s);
  if (v.length <= prefix + suffix) return "*".repeat(v.length);
  return `${v.slice(0, prefix)}${"*".repeat(Math.max(4, v.length - prefix - suffix))}${v.slice(-suffix)}`;
}

/** Inspect a fetch error and classify it. Browser CORS shows up as TypeError "Failed to fetch". */
export function classifyFetchError(e: unknown): { kind: DiagErrorKind; message: string } {
  const msg = String((e as Error)?.message || e || "Unknown error");
  if (/Failed to fetch|NetworkError|TypeError: Load failed/i.test(msg)) {
    return {
      kind: "cors",
      message:
        "API request blocked by browser/CORS. Use backend proxy or Electron main-process proxy for live API.",
    };
  }
  if (/timeout|aborted/i.test(msg)) return { kind: "network", message: msg };
  if (/SSL|certificate/i.test(msg)) return { kind: "ssl", message: msg };
  return { kind: "unknown", message: msg };
}
