import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { usePWA } from "@/hooks/use-pwa";
import { useI18n } from "@/lib/i18n";
import { isPublicStartupPath, isStartupDisabled } from "@/lib/startup-switches";

interface PWAInstallButtonProps {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showIcon?: boolean;
}

export function PWAInstallButton({
  variant = "default",
  size = "default",
  className,
  showIcon = true,
}: PWAInstallButtonProps) {
  if (typeof window !== "undefined" && (isStartupDisabled("pwa") || isPublicStartupPath())) {
    return null;
  }
  const { isInstallAvailable, isInstalled, install } = usePWA();
  const { t } = useI18n();

  if (isInstalled || !isInstallAvailable) {
    return null;
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={install}>
      {showIcon && <Download className="w-4 h-4 mr-2" />}
      {t("Install ERPOVO")}
    </Button>
  );
}
