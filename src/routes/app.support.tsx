import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode, DEMO_USER_ID } from "@/lib/demo/localStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/support")({
  component: CustomerSupportPage,
});

type Ticket = {
  id: string;
  subject: string;
  module: string | null;
  priority: string;
  status: string;
  created_at: string;
};

type Message = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  is_internal: boolean;
};

function CustomerSupportPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    subject: "",
    module: "",
    priority: "normal",
    message: "",
    proof_url: "",
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: tickets } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, subject, module, priority, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = isDemoMode()
        ? { id: DEMO_USER_ID }
        : (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      if (!form.subject.trim() || !form.message.trim())
        throw new Error("Subject and message required");

      const { data: t, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          subject: form.subject.trim(),
          module: form.module || null,
          priority: form.priority,
          proof_url: form.proof_url || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: mErr } = await supabase.from("support_ticket_messages").insert({
        ticket_id: t.id,
        author_id: user.id,
        body: form.message.trim(),
        is_internal: false,
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      toast.success("Support request submitted");
      setForm({ subject: "", module: "", priority: "normal", message: "", proof_url: "" });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-sm text-muted-foreground">
          Need help? Send us a message and we'll get back to you.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Module</Label>
                <Input
                  value={form.module}
                  onChange={(e) => setForm({ ...form, module: e.target.value })}
                  placeholder="e.g. invoices"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Screenshot URL (optional)</Label>
              <Input
                value={form.proof_url}
                onChange={(e) => setForm({ ...form, proof_url: e.target.value })}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Submit request
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(tickets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No tickets yet.</p>
            ) : (
              (tickets ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id === activeId ? null : t.id)}
                  className="w-full text-left rounded-md border p-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                    <Badge variant="outline" className="text-xs">
                      {t.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(t.created_at).toLocaleString()} · {t.priority}
                  </div>
                  {activeId === t.id && <TicketThread ticketId={t.id} />}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketThread({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");

  const { data: messages } = useQuery({
    queryKey: ["my-ticket-msgs", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, body, author_id, created_at, is_internal")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const body = reply.trim();
      if (!body) throw new Error("Empty");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_id: user.id,
        body,
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["my-ticket-msgs", ticketId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 border-t pt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {(messages ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> No replies yet.
        </p>
      ) : (
        (messages ?? []).map((m) => (
          <div key={m.id} className="text-xs rounded bg-muted/40 p-2">
            <div className="text-muted-foreground mb-0.5">
              {new Date(m.created_at).toLocaleString()}
            </div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </div>
        ))
      )}
      <Textarea
        rows={2}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Reply…"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          send.mutate();
        }}
        disabled={send.isPending || !reply.trim()}
      >
        Send reply
      </Button>
    </div>
  );
}
