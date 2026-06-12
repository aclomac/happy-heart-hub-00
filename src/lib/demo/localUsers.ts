/**
 * Local user store for personal/local ERPOVO mode.
 * Passwords here are stored in localStorage for local demo only.
 */

export type LocalUser = {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  password: string; // local demo only
  mobileVerified: boolean;
  isDemoUser: boolean;
  createdAt: string;
  companyId?: string;
};

const USERS_KEY = "erpovo_local_users";

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
  const mobile = normalizeMobile(v);
  const users = getLocalUsers();
  return (
    users.find(
      (u) =>
        u.email.toLowerCase() === v ||
        (!!mobile && normalizeMobile(u.mobile) === mobile),
    ) ?? null
  );
}

export function userExists(email: string, mobile: string): boolean {
  const users = getLocalUsers();
  const e = email.trim().toLowerCase();
  const m = normalizeMobile(mobile);
  return users.some(
    (u) => u.email.toLowerCase() === e || (!!m && normalizeMobile(u.mobile) === m),
  );
}

export function addLocalUser(u: Omit<LocalUser, "id" | "createdAt" | "mobileVerified" | "isDemoUser"> & {
  mobileVerified?: boolean;
  isDemoUser?: boolean;
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
    isDemoUser: u.isDemoUser ?? false,
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

export function validatePassword(p: string): boolean {
  return typeof p === "string" && p.length >= 8;
}
