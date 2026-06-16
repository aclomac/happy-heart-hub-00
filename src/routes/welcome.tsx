import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Cloud, HardDrive, Check } from "lucide-react";
import { isDemoMode } from "@/lib/demo/localStore";
import { supabase } from "@/integrations/supabase/client";
import { setLaunchMode } from "@/lib/launch-mode";

export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    // If already authenticated (cloud or demo), skip the chooser.
    if (typeof window !== "undefined" && isDemoMode()) {
      throw redirect({ to: "/app" });
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) throw redirect({ to: "/app" });
    } catch (e: any) {
      if (e?.to) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Welcome to ERPOVO — Choose Local or Cloud" },
      {
        name: "description",
        content:
          "Pick how ERPOVO stores your business data: local on this device only, or cloud sync across all devices.",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const nav = useNavigate();

  const choose = (mode: "local" | "cloud") => {
    setLaunchMode(mode);
    if (mode === "local") {
      nav({ to: "/signup" });
    } else {
      nav({ to: "/signup" });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: "linear-gradient(135deg, var(--color-sidebar-bg), var(--color-primary))",
      }}
    >
      <div className="w-full max-w-4xl">
        <div className="text-center text-white mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-white text-primary flex items-center justify-center font-bold text-2xl">
              E
            </div>
            <div className="text-3xl font-bold">ERPOVO</div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">Welcome — how should we store your data?</h1>
          <p className="text-base opacity-80 mt-3 max-w-2xl mx-auto">
            Choose once. You can switch later from Settings. This decision controls where invoices,
            stock and reports are saved.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <button
            type="button"
            onClick={() => choose("local")}
            className="text-left bg-card rounded-xl p-7 shadow-xl hover:scale-[1.02] transition-transform border-2 border-transparent hover:border-primary"
          >
            <div className="flex items-center gap-3 mb-4">
              <HardDrive className="w-9 h-9 text-primary" />
              <h2 className="text-xl font-bold">Local / Personal Mode</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Data stays on this device. Works fully offline. Best for a single PC or shop counter.
            </p>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> No internet required after setup</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Fastest performance</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Manual backup &amp; restore</li>
            </ul>
            <Button variant="outline" className="w-full">Continue with Local</Button>
          </button>

          <button
            type="button"
            onClick={() => choose("cloud")}
            className="text-left bg-card rounded-xl p-7 shadow-xl hover:scale-[1.02] transition-transform border-2 border-primary"
          >
            <div className="flex items-center gap-3 mb-4">
              <Cloud className="w-9 h-9 text-primary" />
              <h2 className="text-xl font-bold">Cloud Sync</h2>
              <span className="ml-auto text-[10px] uppercase font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">Recommended</span>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Syncs across PC, mobile and Android app. Best for multi-device or multi-staff teams.
            </p>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Access from any device</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Automatic backup</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Multi-user company workspace</li>
            </ul>
            <Button className="w-full">Continue with Cloud</Button>
          </button>
        </div>

        <div className="text-center mt-8 text-sm text-white/80">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold underline hover:text-white">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
