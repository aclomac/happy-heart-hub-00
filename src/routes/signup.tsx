import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLocalSignupAccount, validateSignupInput } from "@/lib/demo/signup";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) throw redirect({ to: "/companies" });
    } catch (e: any) {
      if (e?.to) throw e;
      // ignore — local mode doesn't require supabase auth
    }
  },
  loader: async () => {
    try {
      const { data } = await supabase.rpc("get_public_platform_settings");
      const row = data?.[0];
      return {
        signupEnabled: row?.signup_enabled ?? true,
        brand: row?.platform_name ?? "ERPOVO",
      };
    } catch {
      return { signupEnabled: true, brand: "ERPOVO" };
    }
  },
  component: Signup,
});

function Signup() {
  const { signupEnabled, brand } = Route.useLoaderData();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const onCreateAccount = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    const next = validateSignupInput({ fullName: name, email, mobile, password: pass });
    setErrs(next);
    if (Object.keys(next).length) {
      toast.error(Object.values(next)[0]);
      return;
    }

    setLoading(true);
    try {
      createLocalSignupAccount({
        fullName: name,
        email,
        mobile,
        password: pass,
      });
      toast.success("Account created successfully");
      if (typeof window !== "undefined") {
        window.location.replace("/app");
        return;
      }
      nav({ to: "/app", replace: true });
    } catch (err: any) {
      console.error("[signup] create account failed", err);
      const reason = err?.message ?? "unknown error";
      toast.error(reason === "Account already exists. Please sign in." ? reason : `Signup failed: ${reason}`);
    } finally {
      setLoading(false);
    }
  };


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
            <div className="text-3xl font-bold">{brand}</div>
            <div className="text-sm opacity-70">Premium Business ERP</div>
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-4 leading-tight">
          Personal ERP
          <br />
          for your business.
        </h1>
        <p className="text-base opacity-80 max-w-md">
          Local-first. All core features — sales, purchase, inventory, parties, reports.
        </p>
      </div>
      <div className="w-full lg:w-[480px] bg-card flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {!signupEnabled ? (
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold">Public signup is disabled</h2>
              <p className="text-sm text-muted-foreground">
                New accounts are currently invitation-only. Please contact our support team to
                request access.
              </p>
              <Link to="/contact">
                <Button variant="default" className="w-full">
                  Contact Support
                </Button>
              </Link>
              <div className="text-sm pt-2">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Create your local ERPOVO account</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Personal ERP account for your business
              </p>

              <form className="space-y-3" onSubmit={onCreateAccount} noValidate>
                <div>
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Md. Rahman"
                    autoComplete="name"
                  />
                  {errs.name && <p className="text-[11px] text-destructive mt-1">{errs.name}</p>}
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    autoComplete="email"
                  />
                  {errs.email && <p className="text-[11px] text-destructive mt-1">{errs.email}</p>}
                </div>
                <div>
                  <Label className="text-xs">Mobile No. (optional)</Label>
                  <Input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  {errs.password && (
                    <p className="text-[11px] text-destructive mt-1">{errs.password}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Local account stored on this device. No email verification required.
                </p>
              </form>
              <div className="mt-6 text-sm text-center">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
