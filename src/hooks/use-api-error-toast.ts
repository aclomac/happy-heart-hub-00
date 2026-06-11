import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { mapApiError, authzMessage, type AuthzError } from "@/lib/api-errors";

/**
 * Returns a handler that translates Supabase/PostgREST errors raised by the
 * server-side authorization backstop (RLS, triggers, helper functions) into
 * the consistent ERPOVO UX: clear toast + optional redirect to upgrade.
 */
export function useApiErrorToast() {
  const navigate = useNavigate();

  return function handle(err: unknown): AuthzError {
    const mapped = mapApiError(err);

    switch (mapped.code) {
      case "SUBSCRIPTION_EXPIRED":
      case "UPGRADE_REQUIRED":
      case "COMPANY_LIMIT":
      case "DEVICE_LIMIT":
        // Personal Mode: all plan/device gates are disabled.
        toast.error(mapped.message || "Action unavailable");
        break;
      case "PERMISSION_DENIED":
      case "NO_COMPANY_ACCESS":
        toast.error(authzMessage(mapped.code), { description: mapped.message });
        break;
      default:
        toast.error(mapped.message);
    }
    return mapped;
  };
}
