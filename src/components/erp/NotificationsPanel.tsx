import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useNotifications, type AppNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Trash2, Circle } from "lucide-react";

function timeAgo(ts: number, t: (s: string) => string) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("just now");
  if (m < 60) return `${m}${t("m ago")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${t("h ago")}`;
  const d = Math.floor(h / 24);
  return `${d}${t("d ago")}`;
}

function NotificationRow({
  n,
  onToggle,
  t,
}: {
  n: AppNotification;
  onToggle: (id: string, read: boolean) => void;
  t: (s: string) => string;
}) {
  const body = (
    <div className="flex items-start gap-2 w-full">
      <div className="pt-1">
        {n.read ? (
          <Circle className="w-2 h-2 text-muted-foreground" />
        ) : (
          <Circle className="w-2 h-2 fill-primary text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{n.title}</div>
        {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
        <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt, t)}</div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle(n.id, !n.read);
        }}
      >
        {n.read ? t("Mark unread") : t("Mark read")}
      </Button>
    </div>
  );
  return (
    <div className="px-3 py-2 border-b hover:bg-muted/40 rounded-sm">
      {n.href ? (
        <Link to={n.href} onClick={() => onToggle(n.id, true)}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export function NotificationsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const { items, unread, setRead, setAllRead, clear } = useNotifications(companyId || "global");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {t("Notifications")}
            {unread > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unread}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-b">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAllRead();
              void logAudit({
                companyId,
                module: "Other",
                action: "notifications.mark_all_read",
              });
            }}
            disabled={unread === 0}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" />
            {t("Mark all read")}
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={items.length === 0}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {t("Clear all")}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div>{t("No notifications yet")}</div>
            </div>
          ) : (
            items.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                t={t}
                onToggle={(id, r) => {
                  setRead(id, r);
                  void logAudit({
                    companyId,
                    module: "Other",
                    action: r ? "notification.read" : "notification.unread",
                    entityId: id,
                  });
                }}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
