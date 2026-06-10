import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { seedDemoData } from "@/lib/demo/seedDemo";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/constants";
import { setCurrentCompanyId } from "@/lib/use-company";
import {
  startDemoSession,
  ensureDemoSeed,
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
} from "@/lib/demo/localStore";
import { PWAInstallButton } from "@/components/erp/PWAInstallButton";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (overrideEmail?: string, overridePass?: string) => {
    const useEmail = overrideEmail ?? email;
    const usePass = overridePass ?? pass;
    setLoading(true);

    const isDemo =
      (useEmail === DEMO_EMAIL || useEmail === DEMO_USER_EMAIL) && usePass === DEMO_PASSWORD;

    // Demo login is fully local — skip Supabase, seed Chair King, pre-select it
    // so the orchestrator doesn't bounce through /companies.
    if (isDemo) {
      try {
        ensureDemoSeed();
        startDemoSession();
        setCurrentCompanyId(DEMO_COMPANY_ID, DEMO_USER_ID);
        try {
          await seedDemoData();
        } catch {
          /* best-effort */
        }
        toast.success("Signed in as Demo (local mode)");
      } catch {
        toast.error("Could not start demo mode");
        setLoading(false);
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("erpovo:cameFromLogin", "1");
        sessionStorage.removeItem("erpovo:adminLandedOnce");
      }
      setLoading(false);
      nav({ to: "/app", replace: true });
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: useEmail,
      password: usePass,
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    setLoading(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("erpovo:cameFromLogin", "1");
      sessionStorage.removeItem("erpovo:adminLandedOnce");
    }
    nav({ to: "/app", replace: true });
  };


  const handleDemoLogin = async () => {
    setEmail(DEMO_EMAIL);
    setPass(DEMO_PASSWORD);
    await handleLogin(DEMO_EMAIL, DEMO_PASSWORD);
  };

  // demo button removed — real auth required

  return (
    <div
      className="min-h-screen flex"
      style={{
        background: "linear-gradient(135deg, var(--color-sidebar-bg), var(--color-primary))",
      }}
    >
      <div className="flex-1 hidden lg:flex flex-col justify-center p-16 text-white">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-lg bg-white text-primary flex items-center justify-center font-bold text-2xl">
            E
          </div>
          <div>
            <div className="text-3xl font-bold">ERPOVO</div>
            <div className="text-sm opacity-70">Premium Business ERP</div>
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-4 leading-tight">
          Run your entire business
          <br />
          from one place.
        </h1>
        <p className="text-base opacity-80 max-w-md">
          Sales, purchase, inventory, parties, payroll, reports and online store — built for retail,
          wholesale, furniture, manufacturing, service and trading.
        </p>
        <ul className="mt-8 space-y-2 text-sm opacity-90">
          <li>✓ Multi-company, multi-store, multi-user</li>
          <li>✓ Built for Bangladesh & international SMBs</li>
          <li>✓ English & বাংলা language support</li>
          <li>✓ Auto-backup, cloud sync & device management</li>
        </ul>
      </div>
      <div className="w-full lg:w-[480px] bg-card flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-6">Sign in to your ERPOVO account</p>
          <Tabs defaultValue="email">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="mobile">Mobile + OTP</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="space-y-3 mt-4">
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button
                variant="default"
                className="w-full"
                onClick={() => handleLogin()}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              {import.meta.env.DEV && (
                <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-foreground">Demo Login (dev only)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setEmail(DEMO_EMAIL);
                        setPass(DEMO_PASSWORD);
                      }}
                    >
                      Fill credentials
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={handleDemoLogin}
                    disabled={loading}
                  >
                    {loading ? "Loading demo..." : "Login as Demo Admin"}
                  </Button>
                </div>
              )}
              <Link to="/signup">
                <Button variant="outline" className="w-full" type="button">
                  Create new account
                </Button>
              </Link>
              <div className="text-xs text-center text-muted-foreground">
                <Link to="/reset-password" className="text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="mobile" className="space-y-3 mt-4">
              <div>
                <Label className="text-xs">Mobile Number</Label>
                <Input placeholder="+880 1XXX XXXXXX" />
              </div>
              <Button variant="default" className="w-full">
                Send OTP
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                We'll send a 6-digit code to verify your mobile.
              </p>
            </TabsContent>
          </Tabs>
          <div className="mt-6 text-sm text-center">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Sign Up
            </Link>
          </div>
          <div className="mt-8 pt-8 border-t">
            <PWAInstallButton variant="outline" className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
