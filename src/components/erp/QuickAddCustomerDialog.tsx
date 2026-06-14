import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/demo/localStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ensurePartiesSeed,
  getParties,
  setParties,
  type DemoParty,
} from "@/lib/demo/parties";

export type Party = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  type: string;
};

export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
  initialName,
  initialPhone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  onCreated: (p: Party) => void;
  initialName?: string;
  initialPhone?: string;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [opening, setOpening] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      ensurePartiesSeed();
      setName(initialName ?? "");
      setPhone(initialPhone ?? "");
      setEmail("");
      setAddress("");
      setOpening("");
    }
  }, [open, initialName, initialPhone]);

  const save = async () => {
    if (saving) return; // duplicate-submit guard
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      toast.error(t("Customer name or phone is required"));
      return;
    }
    setSaving(true);
    try {
      const all = getParties();

      // Duplicate by phone
      if (trimmedPhone) {
        const byPhone = all.find(
          (p) =>
            !p.deleted_at &&
            p.company_id === companyId &&
            (p.type === "customer" || p.type === "both") &&
            (p.phone || "") === trimmedPhone,
        );
        if (byPhone) {
          toast.info(t("Customer already exists"));
          onCreated({
            id: byPhone.id,
            name: byPhone.name,
            phone: byPhone.phone,
            address: byPhone.address,
            type: byPhone.type,
          });
          onOpenChange(false);
          return;
        }
      }

      // Duplicate by name (case-insensitive)
      const byName = all.find(
        (p) =>
          !p.deleted_at &&
          p.company_id === companyId &&
          (p.type === "customer" || p.type === "both") &&
          p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (byName && !trimmedPhone) {
        toast.info(t("Customer already exists"));
        onCreated({
          id: byName.id,
          name: byName.name,
          phone: byName.phone,
          address: byName.address,
          type: byName.type,
        });
        onOpenChange(false);
        return;
      }

      const opn = Number(opening) || 0;
      const newId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `demo-pty-${Date.now()}`;
      const newParty: DemoParty = {
        id: newId,
        company_id: companyId,
        name: trimmedName || trimmedPhone,
        type: "customer",
        phone: trimmedPhone || null,
        email: email.trim() || null,
        address: address.trim() || null,
        shipping_address: null,
        group_id: null,
        opening_balance: opn,
        balance: opn,
        credit_limit: null,
        loyalty_points: 0,
        gst_number: null,
        is_active: true,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };
      setParties([newParty, ...all]);

      // Non-demo: also persist to Supabase so the customer is visible across devices.
      // Failure here must NOT block the local save — the customer already exists locally.
      if (!isDemoMode()) {
        try {
          const { data: inserted, error } = await supabase
            .from("parties")
            .insert({
              company_id: companyId,
              name: trimmedName || trimmedPhone,
              type: "customer",
              phone: trimmedPhone || null,
              email: email.trim() || null,
              address: address.trim() || null,
              opening_balance: opn,
              balance: opn,
            })
            .select("id,name,phone,address,type")
            .single();
          if (!error && inserted?.id) newParty.id = inserted.id as string;
        } catch {
          // Offline / not signed in — local copy is the source of truth.
        }
      }

      toast.success(t("Customer added"));
      onCreated({
        id: newParty.id,
        name: newParty.name,
        phone: newParty.phone,
        address: newParty.address,
        type: newParty.type,
      });
      onOpenChange(false);
    } catch {
      toast.error(t("Could not add customer. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add New Customer")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("Customer Name")} *</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="quick-add-customer-name"
            />
          </div>
          <div>
            <Label className="text-xs">{t("Phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("Email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("Address")}</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("Opening Balance")}</Label>
            <Input
              type="number"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            variant="sale"
            size="sm"
            disabled={!name.trim() || saving}
            onClick={save}
            data-testid="quick-add-customer-save"
          >
            {saving ? t("Saving…") : t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
