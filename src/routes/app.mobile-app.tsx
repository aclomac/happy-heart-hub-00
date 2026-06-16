import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { MobileAppDialog } from "@/components/erp/MobileAppDialog";

export const Route = createFileRoute("/app/mobile-app")({
  head: () => ({
    meta: [
      { title: "ERPOVO Mobile App" },
      { name: "description", content: "Install ERPOVO on your phone — QR code, install guide, and PWA status." },
    ],
  }),
  component: MobileAppPage,
});

function MobileAppPage() {
  const [open, setOpen] = useState(true);
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#0EA5A8] to-[#2563EB] text-white">
          <Smartphone className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">ERPOVO Mobile App</h1>
          <p className="text-sm text-muted-foreground">Install ERPOVO on any device — scan, share, or copy the link.</p>
        </div>
      </div>
      <Button onClick={() => setOpen(true)}>Open install guide</Button>
      <MobileAppDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
