import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/support")({
  component: SupportAdminPage,
});

const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
type Status = (typeof STATUSES)[number];

type Ticket = {
  id: string;
  user_id: string;
  company_id: string | null;
  subject: string;
  module: string | null;
  priority: string;
  status: Status;
  created_at: string;
  last_reply_at: string | null;
};

type Message = {
  id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
};

function SupportAdminPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["sa-tickets", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const active = (tickets ?? []).find((tt) => tt.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Support Tickets")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Customer support inbox for platform admins.")}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("Inbox")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Subject")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6">
                      {t("Loading…")}
                    </TableCell>
                  </TableRow>
                ) : (tickets ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                      {t("No tickets.")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (tickets ?? []).map((tk) => (
                    <TableRow
                      key={tk.id}
                      className={`cursor-pointer ${activeId === tk.id ? "bg-accent" : ""}`}
                      onClick={() => setActiveId(tk.id)}
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{tk.subject}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(tk.created_at).toLocaleDateString()} · {tk.priority}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t(tk.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          {active ? (
            <TicketDetail
              ticket={active}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ["sa-tickets"] });
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                {t("Select a ticket to view details.")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const { data: messages } = useQuery({
    queryKey: ["sa-ticket-msgs", ticket.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const body = reply.trim();
      if (!body) throw new Error("Empty reply");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticket.id,
        author_id: user.id,
        body,
        is_internal: internal,
      });
      if (error) throw error;
      if (!internal) {
        await supabase
          .from("support_tickets")
          .update({ last_reply_at: new Date().toISOString() })
          .eq("id", ticket.id);
      }
      await logPlatformAudit("support.reply", {
        targetType: "support_ticket",
        targetId: ticket.id,
        metadata: { internal },
      });
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["sa-ticket-msgs", ticket.id] });
      toast.success(t("Reply sent"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: Status) => {
      const patch =
        status === "closed" ? { status, closed_at: new Date().toISOString() } : { status };
      const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticket.id);
      if (error) throw error;
      await logPlatformAudit("support.status_change", {
        targetType: "support_ticket",
        targetId: ticket.id,
        metadata: { status },
      });
    },
    onSuccess: () => {
      toast.success(t("Status updated"));
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{ticket.subject}</CardTitle>
            <CardDescription>
              {ticket.module ?? "general"} · {t("priority")} {ticket.priority}
            </CardDescription>
          </div>
          <Select value={ticket.status} onValueChange={(v) => setStatus.mutate(v as Status)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`rounded-md border p-3 text-sm ${
                m.is_internal ? "bg-amber-50 border-amber-200" : "bg-card"
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {m.is_internal ? t("Internal note") : t("Reply")} ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
          {(messages ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("No messages yet.")}
            </p>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label className="text-xs">{t("Your reply")}</Label>
          <Textarea
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("Type a reply or internal note…")}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
              />
              {t("Internal note (hidden from customer)")}
            </label>
            <Button
              size="sm"
              onClick={() => send.mutate()}
              disabled={send.isPending || !reply.trim()}
            >
              {send.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              {t("Send")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { Link };
