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
        toast.error(authzMessage(mapped.code), {
          description: "Renew your subscription to continue.",
          action: { label: "Renew", onClick: () => navigate({ to: "/app/subscription" }) },
        });
        break;
      case "UPGRADE_REQUIRED":
      case "COMPANY_LIMIT":
        toast.error(authzMessage(mapped.code), {
          description: mapped.message,
          action: { label: "Upgrade", onClick: () => navigate({ to: "/app/subscription" }) },
        });
        break;
      case "DEVICE_LIMIT":
        toast.error(authzMessage(mapped.code), {
          description: "Remove an old device or upgrade your plan.",
          action: { label: "Manage", onClick: () => navigate({ to: "/app/settings" }) },
        });
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
