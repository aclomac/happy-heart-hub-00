/**
 * Maps Supabase/PostgREST errors raised by the RLS + trigger backstop into
 * stable codes the UI can present consistently (PlanLockScreen,
 * AccessDeniedScreen, toasts, etc).
 */

export type AuthzCode =
  | "SUBSCRIPTION_EXPIRED"
  | "UPGRADE_REQUIRED"
  | "DEVICE_LIMIT"
  | "COMPANY_LIMIT"
  | "PERMISSION_DENIED"
  | "NO_COMPANY_ACCESS"
  | "UNKNOWN";

export type AuthzError = {
  code: AuthzCode;
  message: string;
  original?: unknown;
};

const RX = [
  {
    rx: /company limit reached/i,
    code: "COMPANY_LIMIT" as const,
    msg: "Company limit reached. Upgrade your plan to add more companies.",
  },
  {
    rx: /device limit exceeded/i,
    code: "DEVICE_LIMIT" as const,
    msg: "Device limit exceeded. Remove a device or upgrade your plan.",
  },
  {
    rx: /subscription expired/i,
    code: "SUBSCRIPTION_EXPIRED" as const,
    msg: "Your subscription has expired. Renew to continue.",
  },
  {
    rx: /payroll|feature/i,
    code: "UPGRADE_REQUIRED" as const,
    msg: "This feature is not available in your current plan.",
  },
  {
    rx: /row[- ]level security|new row violates|permission denied/i,
    code: "PERMISSION_DENIED" as const,
    msg: "Permission denied for this action.",
  },
];

export function mapApiError(err: unknown): AuthzError {
  if (!err) return { code: "UNKNOWN", message: "Unknown error" };

  const anyErr = err as { message?: string; code?: string; details?: string; hint?: string };
  const text = [anyErr.message, anyErr.details, anyErr.hint].filter(Boolean).join(" ");

  for (const m of RX) {
    if (m.rx.test(text)) {
      return { code: m.code, message: m.msg, original: err };
    }
  }

  // PostgREST 42501 = insufficient privilege
  if (anyErr.code === "42501") {
    return {
      code: "PERMISSION_DENIED",
      message: "Permission denied for this action.",
      original: err,
    };
  }

  return { code: "UNKNOWN", message: anyErr.message ?? "Something went wrong", original: err };
}

export function authzMessage(code: AuthzCode): string {
  switch (code) {
    case "SUBSCRIPTION_EXPIRED":
      return "Subscription expired";
    case "UPGRADE_REQUIRED":
      return "Upgrade required";
    case "DEVICE_LIMIT":
      return "Device limit exceeded";
    case "COMPANY_LIMIT":
      return "Company limit reached";
    case "PERMISSION_DENIED":
      return "Permission denied";
    case "NO_COMPANY_ACCESS":
      return "You do not have access to this company";
    default:
      return "Something went wrong";
  }
}
