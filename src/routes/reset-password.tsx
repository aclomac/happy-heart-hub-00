import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirm: z.string().min(8).max(128),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [mode, setMode] = useState<"request" | "set">("set");
  const [requestEmail, setRequestEmail] = useState("");

  useEffect(() => {
    // Supabase recovery links land here with #type=recovery in the URL hash
    // and emit a PASSWORD_RECOVERY auth event. Without that event, treat the
    // page as a "request password reset" form instead.
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const hasRecovery = hash.includes("type=recovery");
      setMode(hasRecovery ? "set" : "request");
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryReady(true);
        setMode("set");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendReset = async () => {
    if (!requestEmail) {
      toast.error("Enter your email");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(requestEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check your inbox for the reset link.");
  };

  const submit = async () => {
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    nav({ to: "/login", replace: true });
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
            <div className="text-3xl font-bold">ERPOVO</div>
            <div className="text-sm opacity-70">Premium Business ERP</div>
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-4 leading-tight">Secure password reset</h1>
        <p className="text-base opacity-80 max-w-md">
          Choose a strong new password to keep your business data protected.
        </p>
      </div>
      <div className="w-full lg:w-[480px] bg-card flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {mode === "set" ? (
            <>
              <h2 className="text-2xl font-bold mb-1">Set a new password</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {recoveryReady
                  ? "Recovery link verified. Pick a new password."
                  : "Enter and confirm a new password for your account."}
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">New password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <Label className="text-xs">Confirm password</Label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                  />
                </div>
                <Button variant="default" className="w-full" onClick={submit} disabled={loading}>
                  {loading ? "Updating..." : "Update password"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                  onClick={() => setMode("request")}
                >
                  Don't have a reset link? Send one
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Forgot password</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter the email on your account and we'll send a reset link.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="you@business.com"
                  />
                </div>
                <Button variant="default" className="w-full" onClick={sendReset} disabled={loading}>
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </div>
            </>
          )}
          <div className="mt-6 text-sm text-center">
            <Link to="/login" className="text-primary font-medium hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
