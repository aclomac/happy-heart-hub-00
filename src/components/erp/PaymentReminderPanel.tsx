import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Bell, ExternalLink, Phone } from "lucide-react";

type ReminderRow = {
  id: string;
  ref: string;
  party: string;
  phone: string | null;
  dueDate: string | null;
  amount: number;
  side: "sale" | "purchase";
};

function bucketOf(dueDate: string | null): "upcoming" | "due" | "overdue" {
  if (!dueDate) return "upcoming";
  const d = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "due";
  return "upcoming";
}

export function PaymentReminderPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["payment-reminders", companyId],
    enabled: !!companyId && open,
    queryFn: async (): Promise<ReminderRow[]> => {
      const [sales, purchases] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_no, due_date, balance, parties(name, phone)")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gt("balance", 0)
          .order("due_date", { ascending: true })
          .limit(100),
        supabase
          .from("purchases")
          .select("id, bill_no, due_date, balance, parties(name, phone)")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gt("balance", 0)
          .order("due_date", { ascending: true })
          .limit(100),
      ]);
      const rows: ReminderRow[] = [];
      type Row = {
        id: string;
        due_date: string | null;
        balance: number;
        invoice_no?: string;
        bill_no?: string;
        parties: { name?: string; phone?: string } | null;
      };
      for (const r of (sales.data ?? []) as unknown as Row[]) {
        rows.push({
          id: r.id,
          ref: r.invoice_no || "",
          party: r.parties?.name || "—",
          phone: r.parties?.phone || null,
          dueDate: r.due_date,
          amount: Number(r.balance) || 0,
          side: "sale",
        });
      }
      for (const r of (purchases.data ?? []) as unknown as Row[]) {
        rows.push({
          id: r.id,
          ref: r.bill_no || "",
          party: r.parties?.name || "—",
          phone: r.parties?.phone || null,
          dueDate: r.due_date,
          amount: Number(r.balance) || 0,
          side: "purchase",
        });
      }
      return rows;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data || [];
    if (!q) return list;
    return list.filter(
      (r) =>
        r.party.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const groups = {
    overdue: filtered.filter((r) => bucketOf(r.dueDate) === "overdue"),
    due: filtered.filter((r) => bucketOf(r.dueDate) === "due"),
    upcoming: filtered.filter((r) => bucketOf(r.dueDate) === "upcoming"),
  };

  const logContacted = (r: ReminderRow) => {
    void logAudit({
      companyId,
      module: r.side === "sale" ? "Sales" : "Purchases",
      action: "reminder.marked_contacted",
      entityType: r.side,
      entityId: r.id,
      referenceNo: r.ref,
    });
    toast.success(t("Marked as contacted"));
  };

  const logReminderSent = (r: ReminderRow) => {
    void logAudit({
      companyId,
      module: r.side === "sale" ? "Sales" : "Purchases",
      action: "reminder.logged_sent",
      entityType: r.side,
      entityId: r.id,
      referenceNo: r.ref,
    });
    toast.success(t("Reminder logged"));
  };

  function RowItem({ r }: { r: ReminderRow }) {
    const b = bucketOf(r.dueDate);
    const href = r.side === "sale" ? `/app/sales/${r.id}/edit` : `/app/purchases/${r.id}/edit`;
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-b text-sm">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{r.party}</div>
          <div className="text-xs text-muted-foreground truncate">
            {r.ref} · {r.dueDate || t("No due date")}
          </div>
        </div>
        <div className="text-right tabular-nums font-medium">
          {r.amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <Badge
          variant={b === "overdue" ? "destructive" : b === "due" ? "default" : "secondary"}
          className="ml-1"
        >
          {t(b === "overdue" ? "Overdue" : b === "due" ? "Due today" : "Upcoming")}
        </Badge>
        <Button asChild size="sm" variant="ghost" title={t("Open")}>
          <Link to={href}>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </Button>
        {r.phone && (
          <Button
            size="sm"
            variant="ghost"
            asChild
            title={t("Call")}
            onClick={() => logReminderSent(r)}
          >
            <a href={`tel:${r.phone}`}>
              <Phone className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => logContacted(r)}>
          {t("Mark contacted")}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {t("Payment Reminder")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-3 border-b">
          <Input
            placeholder={t("Search party, reference or phone")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        <Tabs defaultValue="overdue" className="w-full">
          <TabsList className="mx-3 mt-2">
            <TabsTrigger value="overdue">
              {t("Overdue")} ({groups.overdue.length})
            </TabsTrigger>
            <TabsTrigger value="due">
              {t("Due today")} ({groups.due.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {t("Upcoming")} ({groups.upcoming.length})
            </TabsTrigger>
          </TabsList>
          {(["overdue", "due", "upcoming"] as const).map((k) => (
            <TabsContent key={k} value={k} className="max-h-[55vh] overflow-y-auto mt-0">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">{t("Loading")}…</div>
              ) : groups[k].length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("Nothing here")}
                </div>
              ) : (
                groups[k].map((r) => <RowItem key={`${r.side}-${r.id}`} r={r} />)
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
