/**
 * Step 9 — local/demo storage for system tables:
 * settings_kv, support_tickets, support_ticket_messages, devices,
 * message_templates, payment_methods.
 *
 * Each backed by its own localStorage key, with safe defaults so
 * Settings / Support / Sync pages persist edits offline.
 */
import { DEMO_COMPANY_ID, DEMO_USER_ID } from "./constants";

const K_SETTINGS_KV = "erpovo_demo_settings_kv";
const K_SUPPORT_TICKETS = "erpovo_demo_support_tickets";
const K_SUPPORT_MESSAGES = "erpovo_demo_support_ticket_messages";
const K_DEVICES = "erpovo_demo_devices";
const K_MESSAGE_TEMPLATES = "erpovo_demo_message_templates";
const K_PAYMENT_METHODS = "erpovo_demo_payment_methods";
const K_ROLES = "erpovo_demo_roles";
const K_IMPORT_HISTORY = "erpovo_demo_import_history";
const K_PRINT_SETTINGS = "erpovo_demo_print_settings";
const SEED_KEY = "erpovo_demo_system_seeded_v1";

type Row = Record<string, unknown>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read<T = Row>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, rows: unknown[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function ensureSystemSeed(): void {
  if (!isBrowser()) return;
  try {
    if (localStorage.getItem(SEED_KEY)) return;
    if (read(K_DEVICES).length === 0) {
      write(K_DEVICES, [
        {
          id: "demo-device-1",
          user_id: DEMO_USER_ID,
          device_fingerprint: "demo-device",
          device_name: "Demo Device · Browser",
          last_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ]);
    }
    if (read(K_MESSAGE_TEMPLATES).length === 0) {
      write(K_MESSAGE_TEMPLATES, [
        {
          id: "tpl-sale",
          company_id: DEMO_COMPANY_ID,
          name: "Sale invoice",
          channel: "sms",
          body: "Thank you for your purchase, {party_name}. Invoice {doc_no} total {amount}.",
          created_at: new Date().toISOString(),
        },
        {
          id: "tpl-payment",
          company_id: DEMO_COMPANY_ID,
          name: "Payment received",
          channel: "sms",
          body: "Hi {party_name}, we received {amount} against {doc_no}. Thank you!",
          created_at: new Date().toISOString(),
        },
      ]);
    }
    if (read(K_PAYMENT_METHODS).length === 0) {
      write(K_PAYMENT_METHODS, [
        { id: "pm-cash", company_id: DEMO_COMPANY_ID, name: "Cash", type: "cash", is_active: true },
        { id: "pm-bank", company_id: DEMO_COMPANY_ID, name: "Bank Transfer", type: "bank", is_active: true },
        { id: "pm-bkash", company_id: DEMO_COMPANY_ID, name: "bKash", type: "mobile", is_active: true },
      ]);
    }
    localStorage.setItem(SEED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export const getSettingsKv = (): Row[] => read(K_SETTINGS_KV);
export const setSettingsKv = (r: Row[]): void => write(K_SETTINGS_KV, r);
export const getSupportTickets = (): Row[] => read(K_SUPPORT_TICKETS);
export const setSupportTickets = (r: Row[]): void => write(K_SUPPORT_TICKETS, r);
export const getSupportMessages = (): Row[] => read(K_SUPPORT_MESSAGES);
export const setSupportMessages = (r: Row[]): void => write(K_SUPPORT_MESSAGES, r);
export const getDevices = (): Row[] => read(K_DEVICES);
export const setDevices = (r: Row[]): void => write(K_DEVICES, r);
export const getMessageTemplates = (): Row[] => read(K_MESSAGE_TEMPLATES);
export const setMessageTemplates = (r: Row[]): void => write(K_MESSAGE_TEMPLATES, r);
export const getPaymentMethods = (): Row[] => read(K_PAYMENT_METHODS);
export const setPaymentMethods = (r: Row[]): void => write(K_PAYMENT_METHODS, r);
export const getRoles = (): Row[] => read(K_ROLES);
export const setRoles = (r: Row[]): void => write(K_ROLES, r);
export const getImportHistory = (): Row[] => read(K_IMPORT_HISTORY);
export const setImportHistory = (r: Row[]): void => write(K_IMPORT_HISTORY, r);
export const getPrintSettings = (): Row[] => read(K_PRINT_SETTINGS);
export const setPrintSettings = (r: Row[]): void => write(K_PRINT_SETTINGS, r);
