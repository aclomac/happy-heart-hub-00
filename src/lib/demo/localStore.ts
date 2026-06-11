/**
 * Local/demo storage foundation (Step 1 of Option B).
 *
 * All ERP demo data lives in localStorage so the app can run without
 * Supabase. Keys are namespaced `erpovo_demo_*` and every read/write is
 * wrapped in try/catch so a corrupted entry never crashes the app.
 */

export const DEMO_SESSION_KEY = "erpovo_demo_session";
export const DEMO_USER_KEY = "erpovo_demo_user";
export const DEMO_COMPANIES_KEY = "erpovo_demo_companies";
export const DEMO_CURRENT_COMPANY_KEY = "erpovo_demo_current_company";
export const DEMO_SETTINGS_KEY = "erpovo_demo_settings";
export const DEMO_AUTH_COOKIE = "erpovo_demo_auth";
export const DEMO_EMAIL_COOKIE = "erpovo_demo_email";
const DEMO_COOKIE_MAX_AGE_SECONDS = 31_536_000;

// Legacy marker written by earlier demo bypass. Still honored for compatibility.
const LEGACY_SESSION_KEY = "erpovo:demoSession";

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_USER_EMAIL = "demo@erpovo.com";
export const DEMO_COMPANY_ID = "00000000-0000-0000-0000-0000000000c1";

export type DemoCompany = {
  id: string;
  name: string;
  owner_id: string;
  business_type: string | null;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin_bin: string | null;
  created_at: string;
};

export type DemoUser = {
  id: string;
  email: string;
  role: "owner" | "admin" | "user";
  name: string;
};

export type DemoSession = {
  isDemo: true;
  access_token: string;
  user: DemoUser;
  email: string;
  userId: string;
  startedAt: number;
  created_at: string;
  expires_at: string;
};

export type DemoSettings = {
  dateFormat: string;
  currencySymbol: string;
  plan: string;
  status: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function writeCookie(name: string, value: string, maxAge = DEMO_COOKIE_MAX_AGE_SECONDS): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=${encodeURIComponent(
      value,
    )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function removeCookie(name: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function hasDemoAuthCookie(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.cookie.split(";").some((part) => part.trim() === `${DEMO_AUTH_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function setDemoAuthCookies(email = DEMO_USER_EMAIL): void {
  writeCookie(DEMO_AUTH_COOKIE, "1");
  writeCookie(DEMO_EMAIL_COOKIE, email);
}

export function clearDemoAuthCookies(): void {
  removeCookie(DEMO_AUTH_COOKIE);
  removeCookie(DEMO_EMAIL_COOKIE);
}

function safeRead<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled — ignore */
  }
}

function safeRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True if a demo session is active in this browser. */
export function isDemoMode(): boolean {
  if (!isBrowser()) return false;
  try {
    return (
      !!localStorage.getItem(DEMO_SESSION_KEY) ||
      !!localStorage.getItem(LEGACY_SESSION_KEY) ||
      hasDemoAuthCookie()
    );
  } catch {
    return false;
  }
}

export function getDemoSession(): DemoSession | null {
  return (
    safeRead<DemoSession>(DEMO_SESSION_KEY) ??
    safeRead<DemoSession>(LEGACY_SESSION_KEY) ??
    (hasDemoAuthCookie()
      ? {
          isDemo: true,
          access_token: "demo-token",
          user: {
            id: DEMO_USER_ID,
            email: DEMO_USER_EMAIL,
            role: "owner",
            name: "Demo User",
          },
          email: DEMO_USER_EMAIL,
          userId: DEMO_USER_ID,
          startedAt: Date.now(),
          created_at: new Date().toISOString(),
          expires_at: "2099-12-31T23:59:59.000Z",
        }
      : null)
  );
}

export function startDemoSession(): DemoSession {
  const now = new Date();
  const user: DemoUser = {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    role: "owner",
    name: "Demo User",
  };
  const session: DemoSession = {
    isDemo: true,
    access_token: "demo-token",
    user,
    email: DEMO_USER_EMAIL,
    userId: DEMO_USER_ID,
    startedAt: now.getTime(),
    created_at: now.toISOString(),
    expires_at: "2099-12-31T23:59:59.000Z",
  };
  safeWrite(DEMO_SESSION_KEY, session);
  safeWrite(DEMO_USER_KEY, user);
  setDemoAuthCookies(user.email);
  ensureDemoSeed();
  if (import.meta.env.DEV) {
    console.log("[demo-auth] demo localStorage + cookie session created");
  }
  return session;
}

export function getDemoUser(): DemoUser | null {
  return safeRead<DemoUser>(DEMO_USER_KEY);
}

/** Convenience guard for route gates and AuthProvider checks. */
export function isDemoAuthenticated(): boolean {
  if (!isDemoMode()) return false;
  const s = getDemoSession();
  if (!s) return false;
  if (!s.expires_at) return true;
  return new Date(s.expires_at).getTime() > Date.now();
}

export function endDemoSession(): void {
  safeRemove(DEMO_SESSION_KEY);
  safeRemove(DEMO_USER_KEY);
  safeRemove(LEGACY_SESSION_KEY);
  clearDemoAuthCookies();
}

/** Returns the seeded demo company list. Auto-seeds Chair King on first call. */
export function getDemoCompanies(): DemoCompany[] {
  ensureDemoSeed();
  return safeRead<DemoCompany[]>(DEMO_COMPANIES_KEY) ?? [];
}

export function setDemoCompanies(list: DemoCompany[]): void {
  safeWrite(DEMO_COMPANIES_KEY, list);
}

export function getDemoCompany(id: string | null | undefined): DemoCompany | null {
  if (!id) return null;
  return getDemoCompanies().find((c) => c.id === id) ?? null;
}

export function addDemoCompany(
  input: Partial<DemoCompany> & { name: string },
): DemoCompany {
  const list = getDemoCompanies();
  const company: DemoCompany = {
    id:
      input.id ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
    name: input.name,
    owner_id: input.owner_id ?? DEMO_USER_ID,
    business_type: input.business_type ?? "retail",
    currency: input.currency ?? "BDT",
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    tin_bin: input.tin_bin ?? null,
    created_at: input.created_at ?? new Date().toISOString(),
  };
  list.push(company);
  setDemoCompanies(list);
  return company;
}

export function renameDemoCompany(id: string, name: string): DemoCompany | null {
  const list = getDemoCompanies();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], name };
  setDemoCompanies(list);
  return list[idx];
}

export function updateDemoCompany(
  id: string,
  patch: Partial<DemoCompany>,
): DemoCompany | null {
  const list = getDemoCompanies();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch, id: list[idx].id };
  setDemoCompanies(list);
  return list[idx];
}

export function deleteDemoCompany(id: string): void {
  const list = getDemoCompanies().filter((c) => c.id !== id);
  setDemoCompanies(list);
}

export function getDemoSettings(): DemoSettings {
  const defaults: DemoSettings = {
    dateFormat: "DD/MM/YYYY",
    currencySymbol: "৳",
    plan: "pro_demo",
    status: "active",
  };
  return { ...defaults, ...(safeRead<DemoSettings>(DEMO_SETTINGS_KEY) ?? {}) };
}

export function setDemoSettings(settings: Partial<DemoSettings>): void {
  safeWrite(DEMO_SETTINGS_KEY, { ...getDemoSettings(), ...settings });
}

/** Seeds Chair King + default settings if no demo data exists yet. */
export function ensureDemoSeed(): void {
  if (!isBrowser()) return;
  const existing = safeRead<DemoCompany[]>(DEMO_COMPANIES_KEY);
  if (!existing || existing.length === 0) {
    const seed: DemoCompany = {
      id: DEMO_COMPANY_ID,
      name: "Chair King",
      owner_id: DEMO_USER_ID,
      business_type: "furniture",
      currency: "BDT",
      phone: "01700000000",
      email: DEMO_USER_EMAIL,
      address: "Dhaka, Bangladesh",
      tin_bin: null,
      created_at: new Date().toISOString(),
    };
    safeWrite(DEMO_COMPANIES_KEY, [seed]);
  }
  if (!safeRead<DemoSettings>(DEMO_SETTINGS_KEY)) {
    safeWrite(DEMO_SETTINGS_KEY, {
      dateFormat: "DD/MM/YYYY",
      currencySymbol: "৳",
      plan: "pro_demo",
      status: "active",
    });
  }
  // Persist current-company selection so the sidebar/topbar resolve Chair
  // King synchronously on refresh, no orchestrator round-trip needed.
  try {
    const list = safeRead<DemoCompany[]>(DEMO_COMPANIES_KEY) ?? [];
    const pick = list.find((c) => c.id === DEMO_COMPANY_ID) ?? list[0];
    if (pick) {
      safeWrite(DEMO_CURRENT_COMPANY_KEY, pick.id);
      if (!localStorage.getItem("erpovo:companyId")) {
        localStorage.setItem("erpovo:companyId", pick.id);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Canned demo numbers used by the dashboard widgets when in demo mode. */
export type DemoDashboardData = {
  todaySales: number;
  monthSales: number;
  monthPurchases: number;
  receivables: number;
  payables: number;
  monthExpenses: number;
  monthOtherIncome: number;
  itemCount: number;
  partyCount: number;
  inventory: {
    stockValue: number;
    totalItems: number;
    lowStock: number;
    outOfStock: number;
    warehouses: number;
    transfers: number;
  };
};

export function getDemoDashboardData(): DemoDashboardData {
  return {
    todaySales: 18500,
    monthSales: 425000,
    monthPurchases: 280000,
    receivables: 72200,
    payables: 65000,
    monthExpenses: 42500,
    monthOtherIncome: 8500,
    itemCount: 12,
    partyCount: 10,
    inventory: {
      stockValue: 685000,
      totalItems: 12,
      lowStock: 2,
      outOfStock: 1,
      warehouses: 2,
      transfers: 3,
    },
  };
}

/** Clears every demo-related localStorage key. Used by logout. */
export function clearDemoStorage(): void {
  if (!isBrowser()) return;
  try {
    [
      DEMO_SESSION_KEY,
      DEMO_USER_KEY,
      DEMO_COMPANIES_KEY,
      DEMO_CURRENT_COMPANY_KEY,
      DEMO_SETTINGS_KEY,
      LEGACY_SESSION_KEY,
    ].forEach((k) => localStorage.removeItem(k));
    clearDemoAuthCookies();
  } catch {
    /* ignore */
  }
}
