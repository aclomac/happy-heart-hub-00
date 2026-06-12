/**
 * Local user store + OTP helpers for personal/local ERPOVO mode.
 *
 * NOTE: For production, use server-side authentication and a real SMS OTP
 * provider. Passwords here are stored in localStorage for local demo only.
 */

export type LocalUser = {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  password: string; // local demo only
  mobileVerified: boolean;
  createdAt: string;
  companyId?: string;
};

const USERS_KEY = "erpovo_local_users";
const OTP_KEY = "erpovo_local_otp";

const OTP_TTL_MS = 5 * 60 * 1000;
const FIXED_TEST_OTP = "123456";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, val: unknown) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

export function getLocalUsers(): LocalUser[] {
  return readJSON<LocalUser[]>(USERS_KEY, []);
}

export function setLocalUsers(users: LocalUser[]) {
  writeJSON(USERS_KEY, users);
}

export function normalizeMobile(m: string): string {
  return m.replace(/[\s-]/g, "");
}

export function isValidBdMobile(m: string): boolean {
  const v = normalizeMobile(m);
  return /^01\d{9}$/.test(v) || /^\+8801\d{9}$/.test(v);
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function findUserByEmailOrMobile(emailOrMobile: string): LocalUser | null {
  const v = emailOrMobile.trim().toLowerCase();
  const users = getLocalUsers();
  return (
    users.find(
      (u) =>
        u.email.toLowerCase() === v ||
        normalizeMobile(u.mobile) === normalizeMobile(v),
    ) ?? null
  );
}

export function userExists(email: string, mobile: string): boolean {
  const users = getLocalUsers();
  const e = email.trim().toLowerCase();
  const m = normalizeMobile(mobile);
  return users.some(
    (u) => u.email.toLowerCase() === e || normalizeMobile(u.mobile) === m,
  );
}

export function addLocalUser(u: Omit<LocalUser, "id" | "createdAt" | "mobileVerified"> & {
  mobileVerified?: boolean;
}): LocalUser {
  const users = getLocalUsers();
  const user: LocalUser = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u-${Date.now()}`,
    fullName: u.fullName,
    email: u.email.trim(),
    mobile: normalizeMobile(u.mobile),
    password: u.password,
    mobileVerified: u.mobileVerified ?? true,
    createdAt: new Date().toISOString(),
    companyId: u.companyId,
  };
  users.push(user);
  setLocalUsers(users);
  return user;
}

export function deleteLocalUser(id: string) {
  setLocalUsers(getLocalUsers().filter((u) => u.id !== id));
}

// ---------- OTP ----------

type OtpRecord = { mobile: string; code: string; expiresAt: number };

export function generateOtp(mobile: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const rec: OtpRecord = {
    mobile: normalizeMobile(mobile),
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
  };
  writeJSON(OTP_KEY, rec);
  return code;
}

export function getCurrentOtp(): OtpRecord | null {
  return readJSON<OtpRecord | null>(OTP_KEY, null);
}

export function verifyOtp(mobile: string, code: string): boolean {
  if (code === FIXED_TEST_OTP) return true;
  const rec = getCurrentOtp();
  if (!rec) return false;
  if (rec.mobile !== normalizeMobile(mobile)) return false;
  if (Date.now() > rec.expiresAt) return false;
  return rec.code === code;
}

export function clearOtp() {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(OTP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Placeholder SMS sender. In local/demo mode this resolves without sending.
 * Wire this to a real SMS gateway in production.
 */
export async function sendOtpSms(
  _mobile: string,
  _otp: string,
): Promise<{ ok: true; demo: boolean }> {
  return { ok: true, demo: true };
}

export function validatePassword(p: string): boolean {
  return typeof p === "string" && p.length >= 8;
}
