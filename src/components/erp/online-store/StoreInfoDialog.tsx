import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function StoreInfoDialog({ open, onOpenChange, store, onSuccess }: any) {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    store_name: "",
    slug: "",
    description: "",
    whatsapp_number: "",
    address: "",
    category: "",
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setLoading(true);
    try {
      const payload = {
        company_id: companyId,
        store_name: formData.store_name,
        slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        description: formData.description,
        whatsapp_number: formData.whatsapp_number,
        settings: {
          address: formData.address,
          category: formData.category,
        },
        updated_at: new Date().toISOString(),
      };

      let error;
      if (store) {
        const { error: updateError } = await supabase
          .from("online_store_settings")
          .update(payload)
          .eq("id", store.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("online_store_settings")
          .insert(payload);
        error = insertError;
      }

      if (error) throw error;

      toast.success(t("Store info updated"));
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || t("Failed to update"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("Edit Store Info")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="store_name" className="text-right">
              {t("Store Name")}
            </Label>
            <Input
              id="store_name"
              className="col-span-3"
              value={formData.store_name}
              onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="slug" className="text-right">
              {t("Store Link (Slug)")}
            </Label>
            <div className="col-span-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">/store/</span>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="my-cool-store"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              {t("Category")}
            </Label>
            <Input
              id="category"
              className="col-span-3"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="whatsapp" className="text-right">
              {t("WhatsApp")}
            </Label>
            <Input
              id="whatsapp"
              className="col-span-3"
              value={formData.whatsapp_number}
              onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="address" className="text-right">
              {t("Address")}
            </Label>
            <Input
              id="address"
              className="col-span-3"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">
              {t("Description")}
            </Label>
            <Textarea
              id="description"
              className="col-span-3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
