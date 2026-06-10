import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["platform-settings-public"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_platform_settings");
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 60_000,
  });

  const { data: isAdmin } = useQuery({
    queryKey: ["is-platform-admin-gate"],
    queryFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return false;
      const { data } = await supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  if (settings?.maintenance_mode && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Wrench className="w-8 h-8 text-amber-700" />
          </div>
          <h1 className="text-2xl font-bold">
            {settings?.platform_name ?? "ERPovo"} {t("is under maintenance")}
          </h1>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {settings?.maintenance_message ??
              t("We're performing scheduled maintenance. Please check back shortly.")}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
