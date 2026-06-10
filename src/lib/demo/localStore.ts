/**
 * Local/demo storage foundation (Step 1 of Option B).
 *
 * All ERP demo data lives in localStorage so the app can run without
 * Supabase. Keys are namespaced `erpovo_demo_*` and every read/write is
 * wrapped in try/catch so a corrupted entry never crashes the app.
 */

export const DEMO_SESSION_KEY = "erpovo_demo_session";
export const DEMO_COMPANIES_KEY = "erpovo_demo_companies";
export const DEMO_CURRENT_COMPANY_KEY = "erpovo_demo_current_company";
export const DEMO_SETTINGS_KEY = "erpovo_demo_settings";

// Legacy marker written by earlier demo bypass. Still honored for compatibility.
const LEGACY_SESSION_KEY = "erpovo:demoSession";

export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
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

export type DemoSession = {
  email: string;
  userId: string;
  startedAt: number;
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
      !!localStorage.getItem(DEMO_SESSION_KEY) || !!localStorage.getItem(LEGACY_SESSION_KEY)
    );
  } catch {
    return false;
  }
}

export function getDemoSession(): DemoSession | null {
  return (
    safeRead<DemoSession>(DEMO_SESSION_KEY) ?? safeRead<DemoSession>(LEGACY_SESSION_KEY)
  );
}

export function startDemoSession(): DemoSession {
  const session: DemoSession = {
    email: DEMO_USER_EMAIL,
    userId: DEMO_USER_ID,
    startedAt: Date.now(),
  };
  safeWrite(DEMO_SESSION_KEY, session);
  ensureDemoSeed();
  return session;
}

export function endDemoSession(): void {
  safeRemove(DEMO_SESSION_KEY);
  safeRemove(LEGACY_SESSION_KEY);
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
}

/** Clears every demo-related localStorage key. Used by logout. */
export function clearDemoStorage(): void {
  if (!isBrowser()) return;
  try {
    [
      DEMO_SESSION_KEY,
      DEMO_COMPANIES_KEY,
      DEMO_CURRENT_COMPANY_KEY,
      DEMO_SETTINGS_KEY,
      LEGACY_SESSION_KEY,
    ].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
