import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface ItemImageThumbProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Show "No image" / "Image unavailable" caption inside the fallback. */
  showLabel?: boolean;
  iconClassName?: string;
  "data-testid"?: string;
}

/**
 * Renders a product/item image with a clean ERPOVO-themed fallback when the
 * URL is missing OR fails to load (broken link / 404). Never shows the
 * browser's broken-image icon.
 */
export function ItemImageThumb({
  src,
  alt,
  className,
  showLabel = false,
  iconClassName,
  ...rest
}: ItemImageThumbProps) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const hasImage = !!src && !broken;

  const label = !src ? t("No image") : t("Image unavailable");

  return (
    <div
      className={cn(
        "bg-muted/40 overflow-hidden flex items-center justify-center text-muted-foreground",
        className,
      )}
      data-testid={rest["data-testid"] ?? "item-image-thumb"}
      data-fallback={hasImage ? "false" : "true"}
    >
      {hasImage ? (
        <img
          src={src ?? ""}
          alt={alt ?? t("Product image")}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 px-1 text-center">
          <ImageIcon className={cn("w-5 h-5 opacity-70", iconClassName)} aria-hidden="true" />
          {showLabel && <span className="text-[10px] leading-tight">{label}</span>}
          <span className="sr-only">{label}</span>
        </div>
      )}
    </div>
  );
}
