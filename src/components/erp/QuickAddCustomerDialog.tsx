import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  onCreated: (p: Party) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setAddress("");
    }
  }, [open]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("Customer name is required"));
      return;
    }
    setSaving(true);
    try {
      // Duplicate guard: same name + phone (when phone provided) in this company
      const dupQuery = supabase
        .from("parties")
        .select("id,name,phone,address,type")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .in("type", ["customer", "both"])
        .ilike("name", trimmed);

      const { data: dup } = phone.trim()
        ? await dupQuery.eq("phone", phone.trim()).maybeSingle()
        : await dupQuery.maybeSingle();

      if (dup) {
        toast.info(t("Customer already exists"));
        onCreated(dup as Party);
        onOpenChange(false);
        return;
      }

      const opening = 0;
      const { data, error } = await supabase
        .from("parties")
        .insert({
          company_id: companyId,
          name: trimmed,
          type: "customer",
          phone: phone.trim() || null,
          address: address.trim() || null,
          opening_balance: opening,
          balance: opening,
          loyalty_points: 0,
        })
        .select("id,name,phone,address,type")
        .single();

      if (error) throw error;
      toast.success(t("Customer added"));
      onCreated(data as Party);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
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
            <Label className="text-xs">{t("Address")}</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
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
