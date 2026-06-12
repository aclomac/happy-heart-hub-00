import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/companies" });
  },
  loader: async () => {
    const { data } = await supabase.rpc("get_public_platform_settings");
    const row = data?.[0];
    return { signupEnabled: row?.signup_enabled ?? true, brand: row?.platform_name ?? "ERPOVO" };
  },
  component: Signup,
});

function Signup() {
  const { signupEnabled, brand } = Route.useLoaderData();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: window.location.origin + "/companies",
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success("Account created!");
      nav({ to: "/companies" });
    } else {
      toast.success("Account created! Check your email to confirm, then sign in.");
      nav({ to: "/login" });
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
              <p className="text-sm text-muted-foreground mb-6">Personal ERP account for your business</p>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Md. Rahman"
                  />
                </div>
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
                  <Label className="text-xs">Mobile</Label>
                  <Input placeholder="+880 1XXX XXXXXX" />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button variant="default" className="w-full" onClick={onSubmit} disabled={loading}>
                  {loading ? "Creating..." : "Create Account"}
                </Button>
              </div>
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
