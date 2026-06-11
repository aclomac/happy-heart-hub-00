import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getOnlineStore, setOnlineStore, type DemoOnlineStore,
} from "@/lib/demo/online-store";

export function StoreInfoDialog({ open, onOpenChange, store, onSuccess }: any) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    store_name: "", slug: "", description: "", whatsapp_number: "",
    address: "", category: "",
  });

  useEffect(() => {
    if (store) {
      setFormData({
        store_name: store.store_name || "",
        slug: store.slug || "",
        description: store.description || "",
        whatsapp_number: store.whatsapp_number || "",
        address: store.settings?.address || "",
        category: store.settings?.category || "",
      });
    }
  }, [store]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const current = getOnlineStore();
    const next: DemoOnlineStore = {
      ...(current ?? {
        id: "demo-store-01",
        company_id: "demo",
        logo_url: null,
        banner_url: null,
        theme: "Professional Furniture Store",
        status: "active",
        view_count: 0,
        created_at: new Date().toISOString(),
      } as DemoOnlineStore),
      store_name: formData.store_name,
      slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description: formData.description,
      whatsapp_number: formData.whatsapp_number,
      settings: {
        ...(current?.settings ?? {
          delivery_charge_inside: 80, delivery_charge_outside: 150,
          cod_available: true, payment_methods: ["COD", "bKash", "Nagad", "Bank Transfer"],
        }),
        address: formData.address,
        category: formData.category,
      },
    };
    setOnlineStore(next);
    toast.success(t("Store info updated"));
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>{t("Edit Store Info")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <Field label={t("Store Name")}>
            <Input value={formData.store_name} onChange={(e) => setFormData({ ...formData, store_name: e.target.value })} required />
          </Field>
          <Field label={t("Store Link (Slug)")}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">/store/</span>
              <Input value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="chair-king" required />
            </div>
          </Field>
          <Field label={t("Category")}>
            <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
          </Field>
          <Field label={t("WhatsApp")}>
            <Input value={formData.whatsapp_number} onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })} />
          </Field>
          <Field label={t("Address")}>
            <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          </Field>
          <Field label={t("Description")}>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </Field>
          <DialogFooter><Button type="submit">{t("Save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label className="text-right">{label}</Label>
      <div className="col-span-3">{children}</div>
    </div>
  );
}
