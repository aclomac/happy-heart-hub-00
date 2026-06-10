import type { Page, ConsoleMessage, Request, Response } from "@playwright/test";

export const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL ?? "admin@erpovo.com";
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "12345678";

/**
 * Patterns we intentionally ignore so the smoke suite only fails on real
 * runtime errors (not dev-only noise, third-party telemetry, etc.).
 */
const IGNORED_CONSOLE = [
  /ResizeObserver loop/i,
  /favicon\.ico/i,
  /\[route-orchestrator\]/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Lovable/i,
  // Generic "Failed to load resource" is paired with a network entry — keep
  // network-level checks authoritative and drop the console mirror.
  /Failed to load resource/i,
];

const IGNORED_NETWORK_URLS = [
  /favicon\.ico/i,
  /\/__lovable/i,
  /lovable\.dev/i,
  /sockjs|hot-update|@vite|@react-refresh/i,
  /google-analytics|googletagmanager|sentry\.io|posthog|segment\.io/i,
  /chrome-extension:/i,
];

export type ErrorBag = {
  console: string[];
  pageErrors: string[];
  network: string[];
  /** Aggregated, human-readable summary (empty if nothing to report). */
  all(): string[];
};

/**
 * Attach console + pageerror + failed-network listeners and return a single
 * bag. Caller asserts `bag.all()` is empty at the end of a test.
 */
export function attachErrorWatch(page: Page): ErrorBag {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(`[console] ${text}`);
  });

  page.on("pageerror", (err) => {
    pageErrors.push(`[pageerror] ${String(err?.message ?? err)}`);
  });

  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    if (IGNORED_NETWORK_URLS.some((re) => re.test(url))) return;
    const failure = req.failure()?.errorText ?? "unknown";
    networkErrors.push(`[reqfailed ${failure}] ${req.method()} ${url}`);
  });

  page.on("response", (res: Response) => {
    const url = res.url();
    if (IGNORED_NETWORK_URLS.some((re) => re.test(url))) return;
    const status = res.status();
    if (status < 400) return;
    // Tolerate 401/403 on optional probes (e.g. unauthenticated boot pings).
    // Hard-fail on 404 for app routes/assets and any 5xx.
    if (status === 401 || status === 403) return;
    const req = res.request();
    // Document navigations land on /login etc. after redirects — only flag
    // hard 404/5xx on subresources or API calls.
    if (req.resourceType() === "document" && status < 500) return;
    networkErrors.push(`[http ${status}] ${req.method()} ${url}`);
  });

  return {
    console: consoleErrors,
    pageErrors,
    network: networkErrors,
    all() {
      return [...this.pageErrors, ...this.console, ...this.network];
    },
  };
}

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  const demoBtn = page.getByRole("button", { name: /demo admin/i });
  if (await demoBtn.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 30_000 }),
      demoBtn.click(),
    ]);
    return;
  }
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in|log in/i }).click(),
  ]);
}

export async function ensureInsideApp(page: Page): Promise<void> {
  if (page.url().includes("/app")) return;
  const firstSelect = page.getByRole("button", { name: /select|open|continue/i }).first();
  if (await firstSelect.isVisible().catch(() => false)) {
    await firstSelect.click();
    await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 15_000 });
  }
}
