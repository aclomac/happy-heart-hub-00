import { Link } from "@tanstack/react-router";
import { ShieldOff, ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Props = {
  reason?: "admin" | "permission";
  permission?: string;
};

export function AccessDeniedScreen({ reason = "permission", permission }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-xl mx-auto">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center mb-5 shadow-lg shadow-rose-200">
        <ShieldOff className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">{t("Access Denied")}</h2>
      <p className="text-muted-foreground mt-3 max-w-md">
        {t(
          "You don't have permission to view this page. Contact your administrator to request access.",
        )}
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        {reason === "admin"
          ? t("Admins only")
          : permission
            ? `${t("Missing permission")}: ${permission}`
            : t("Insufficient role")}
      </p>

      <div className="flex flex-wrap gap-2 mt-8 justify-center">
        <Link to="/app">
          <Button size="lg" variant="default">
            <ArrowLeft className="w-4 h-4" />
            {t("Back to Dashboard")}
          </Button>
        </Link>
        <Link to="/companies">
          <Button size="lg" variant="outline">
            <Building2 className="w-4 h-4" />
            {t("Switch Company")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
