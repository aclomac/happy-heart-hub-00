const DEMO_SESSION_KEY = "erpovo_demo_session";
const DEMO_USER_KEY = "erpovo_demo_user";
const DEMO_COMPANIES_KEY = "erpovo_demo_companies";
const DEMO_CURRENT_COMPANY_KEY = "erpovo_demo_current_company";
const DEMO_AUTH_COOKIE = "erpovo_demo_auth";
const DEMO_EMAIL_COOKIE = "erpovo_demo_email";
const COMPANY_KEY = "erpovo:companyId";
const LAUNCH_MODE_KEY = "erpovo:launch-mode";

const DEMO_USER_ID = "demo-user-001";
const DEMO_USER_EMAIL = "demo@erpovo.com";
const DEMO_COMPANY_ID = "00000000-0000-0000-0000-0000000000c1";

declare global {
  interface Window {
    __ERPOVO_STATIC_HOSTINGER__?: boolean;
    __ERPOVO_EMERGENCY_LOCAL_DEMO__?: boolean;
  }
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function safeSetJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort emergency boot only
  }
}

export function isEmergencyLocalDemoMode(): boolean {
  return (
    typeof window !== "undefined" &&
    window.__ERPOVO_STATIC_HOSTINGER__ === true &&
    import.meta.env.PROD
  );
}

export function primeEmergencyLocalDemo(): void {
  if (!isEmergencyLocalDemoMode() || !canUseBrowserStorage()) return;
  window.__ERPOVO_EMERGENCY_LOCAL_DEMO__ = true;

  const now = new Date();
  const user = {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    role: "owner",
    name: "Demo User",
    fullName: "Demo User",
    isDemoUser: true,
  };
  const session = {
    isDemo: true,
    access_token: "demo-token",
    user,
    email: DEMO_USER_EMAIL,
    userId: DEMO_USER_ID,
    fullName: "Demo User",
    startedAt: now.getTime(),
    created_at: now.toISOString(),
    expires_at: "2099-12-31T23:59:59.000Z",
    isDemoUser: true,
  };
  const company = {
    id: DEMO_COMPANY_ID,
    name: "Chair King",
    owner_id: DEMO_USER_ID,
    ownerUserId: DEMO_USER_ID,
    sharedWithUserIds: [],
    isDemoCompany: true,
    business_type: "furniture",
    currency: "BDT",
    phone: "01700000000",
    email: DEMO_USER_EMAIL,
    address: "Dhaka, Bangladesh",
    tin_bin: null,
    created_at: now.toISOString(),
  };

  safeSetJson(DEMO_SESSION_KEY, session);
  safeSetJson(DEMO_USER_KEY, user);
  if (!localStorage.getItem(DEMO_COMPANIES_KEY)) safeSetJson(DEMO_COMPANIES_KEY, [company]);
  safeSetJson(DEMO_CURRENT_COMPANY_KEY, DEMO_COMPANY_ID);
  localStorage.setItem(COMPANY_KEY, DEMO_COMPANY_ID);
  localStorage.setItem(LAUNCH_MODE_KEY, "local");

  try {
    document.cookie = `${DEMO_AUTH_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `${DEMO_EMAIL_COOKIE}=${encodeURIComponent(DEMO_USER_EMAIL)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function redirectDisabledLoginToApp(): void {
  if (!isEmergencyLocalDemoMode() || typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (pathname === "/" || pathname === "/login") {
    window.history.replaceState(null, "", `/app${search}${hash}`);
  }
}

export function scheduleDeferredEmergencyDemoSeed(): void {
  if (!isEmergencyLocalDemoMode() || typeof window === "undefined") return;
  const run = () => {
    void import("@/lib/demo/localStore")
      .then(({ ensureDemoSeed }) => ensureDemoSeed())
      .catch(() => {});
  };
  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === "function") idle(run, { timeout: 2500 });
  else window.setTimeout(run, 1200);
}