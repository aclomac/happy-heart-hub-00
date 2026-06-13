import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { seedDemoData } from "@/lib/demo/seedDemo";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/constants";
import { setCurrentCompanyId } from "@/lib/use-company";
import {
  startDemoSession,
  startLocalUserSession,
  ensureDemoSeed,
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  isDemoMode,
  getVisibleDemoCompanies,
  addDemoCompany,
} from "@/lib/demo/localStore";


import { findUserByEmailOrMobile, getLocalUsers, setLocalUsers } from "@/lib/demo/localUsers";
import { PWAInstallButton } from "@/components/erp/PWAInstallButton";

export const Route = createFileRoute("/login")({
  beforeLoad: (ctx: any) => {
    if (ctx.serverContext?.demoAuth || isDemoMode()) {
      if (import.meta.env.DEV) {
        console.log("[demo-auth] /login route redirected demo user to /app");
      }
      throw redirect({ to: "/app" });
    }
  },
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (overrideEmail?: string, overridePass?: string, allowDemo = false) => {
    const useEmail = overrideEmail ?? email;
    const usePass = overridePass ?? pass;
    setLoading(true);

    const isDemo =
      (useEmail === DEMO_EMAIL || useEmail === DEMO_USER_EMAIL) && usePass === DEMO_PASSWORD;

    // Demo login is fully local — skip Supabase, seed Chair King, pre-select it
    // so the orchestrator doesn't bounce through /companies.
    if (isDemo && allowDemo) {
      try {
        ensureDemoSeed();
        startDemoSession();
        setCurrentCompanyId(DEMO_COMPANY_ID, DEMO_USER_ID);
        try {
          const report = await seedDemoData();
          if (report.companyId) setCurrentCompanyId(report.companyId);
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
      // Hard reload so the route orchestrator re-evaluates auth state
      // freshly with the new demo session active in localStorage.
      if (typeof window !== "undefined") {
        window.location.replace("/app");
        return;
      }
      nav({ to: "/app", replace: true });
      return;
    }

    // Local user (created via /signup) — match by email OR mobile.
    const trimmedEmail = useEmail.trim();
    if (!trimmedEmail || !usePass) {
      setLoading(false);
      toast.error("Email and password are required");
      return;
    }

    const allUsers = getLocalUsers();
    const localUser = findUserByEmailOrMobile(trimmedEmail);
    if (import.meta.env.DEV) {
      console.log("[login] local users:", allUsers.length, "matched:", !!localUser, "pwd ok:", !!localUser && localUser.password === usePass);
    }

    if (localUser) {
      if (localUser.password !== usePass) {
        setLoading(false);
        toast.error("Invalid email or password");
        return;
      }
      try {
        // Ensure the user's company still exists (logout/clear may have wiped it).
        let companyId = localUser.companyId ?? null;
        const companies = getVisibleDemoCompanies(localUser.id);
        if (!companyId || !companies.some((c) => c.id === companyId)) {
          const fresh = addDemoCompany({
            name: `${localUser.fullName}'s Business`,
            owner_id: localUser.id,
            ownerUserId: localUser.id,
            isDemoCompany: false,
            email: localUser.email,
          });
          companyId = fresh.id;
          setLocalUsers(
            getLocalUsers().map((u) => (u.id === localUser.id ? { ...u, companyId: fresh.id } : u)),
          );
        }
        if (localUser.emailVerified === false) {
          setLoading(false);
          toast.error("Please verify your email before signing in.");
          return;
        }
        startLocalUserSession({
          id: localUser.id,
          email: localUser.email,
          name: localUser.fullName,
          fullName: localUser.fullName,
        });
        setCurrentCompanyId(companyId, localUser.id);
        toast.success("Signed in successfully");
      } catch (err) {
        if (import.meta.env.DEV) console.error("[login] local session error", err);
        toast.error("Could not start local session");
        setLoading(false);
        return;
      }
      setLoading(false);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("erpovo:cameFromLogin", "1");
        window.location.replace("/app");
        return;
      }
      nav({ to: "/app", replace: true });
      return;
    }

    let error: { message?: string } | null = null;
    try {
      const result = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: usePass,
      });
      error = result.error;
    } catch {
      error = { message: "Invalid email or password" };
    }

    if (error) {
      setLoading(false);
      toast.error("Invalid email or password");
      return;
    }

    setLoading(false);
    toast.success("Signed in successfully");
    if (typeof window !== "undefined") {
      sessionStorage.setItem("erpovo:cameFromLogin", "1");
      sessionStorage.removeItem("erpovo:adminLandedOnce");
    }
    nav({ to: "/app", replace: true });
  };



  const handleDemoLogin = async () => {
    setEmail(DEMO_EMAIL);
    setPass(DEMO_PASSWORD);
    await handleLogin(DEMO_EMAIL, DEMO_PASSWORD, true);
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
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin();
            }}
          >
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
                type="submit"
                variant="default"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleDemoLogin}
                disabled={loading}
              >
                {loading ? "Loading demo..." : "Use Demo Login"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center -mt-1">
                Demo: demo@erpovo.com / 123456 (local mode, no backend)
              </p>
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
          </form>
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
