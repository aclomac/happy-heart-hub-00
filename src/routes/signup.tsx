import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  addLocalUser,
  clearOtp,
  generateOtp,
  isValidBdMobile,
  isValidEmail,
  normalizeMobile,
  sendOtpSms,
  userExists,
  validatePassword,
  verifyOtp,
} from "@/lib/demo/localUsers";
import {
  startDemoSession,
  ensureDemoSeed,
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
} from "@/lib/demo/localStore";
import { setCurrentCompanyId } from "@/lib/use-company";

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

type Step = "form" | "otp";

function Signup() {
  const { signupEnabled, brand } = Route.useLoaderData();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const [otp, setOtp] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [otpSentAt, setOtpSentAt] = useState<number>(0);

  // For production, use server-side authentication and real SMS OTP provider.
  const sendOtp = async () => {
    const code = generateOtp(mobile);
    setDemoOtp(code);
    setOtpSentAt(Date.now());
    try {
      await sendOtpSms(mobile, code);
    } catch {
      /* ignore in demo */
    }
  };

  const onCreateAccount = async () => {
    // Step 1 validation
    if (!name.trim()) return toast.error("Full Name is required");
    if (!isValidEmail(email)) return toast.error("Please enter a valid email");
    if (!isValidBdMobile(mobile))
      return toast.error("Enter a valid BD mobile (01XXXXXXXXX or +8801XXXXXXXXX)");
    if (!validatePassword(pass))
      return toast.error("Password must be at least 8 characters");
    if (userExists(email, mobile))
      return toast.error("Account already exists. Please sign in.");

    setLoading(true);
    try {
      await sendOtp();
      setStep("otp");
      toast.success("OTP generated (demo mode)");
    } catch (e: any) {
      toast.error(`Could not send OTP: ${e?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const onResendOtp = async () => {
    if (Date.now() - otpSentAt < 10_000) {
      return toast.message("Please wait a few seconds before resending");
    }
    await sendOtp();
    setOtp("");
    toast.success("New OTP generated");
  };

  const onVerifyAndCreate = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit OTP");
    if (!verifyOtp(mobile, otp)) return toast.error("Invalid OTP");

    setLoading(true);
    try {
      // double-check uniqueness in case another tab created the user
      if (userExists(email, mobile)) {
        toast.error("Account already exists. Please sign in.");
        setLoading(false);
        return;
      }
      addLocalUser({
        fullName: name.trim(),
        email: email.trim(),
        mobile: normalizeMobile(mobile),
        password: pass,
        mobileVerified: true,
        companyId: DEMO_COMPANY_ID,
      });
      ensureDemoSeed();
      startDemoSession();
      setCurrentCompanyId(DEMO_COMPANY_ID, DEMO_USER_ID);
      clearOtp();
      toast.success("Account created successfully");
      if (typeof window !== "undefined") {
        window.location.replace("/app");
        return;
      }
      nav({ to: "/app", replace: true });
    } catch (e: any) {
      toast.error(`Could not create account: ${e?.message ?? "unknown error"}`);
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
          ) : step === "form" ? (
            <>
              <h2 className="text-2xl font-bold mb-1">Create your local ERPOVO account</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Personal ERP account for your business
              </p>

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
                  <Input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="01XXXXXXXXX or +8801XXXXXXXXX"
                  />
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
                <Button
                  variant="default"
                  className="w-full"
                  onClick={onCreateAccount}
                  disabled={loading}
                >
                  {loading ? "Sending OTP..." : "Create Account"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Real SMS sending requires SMS API integration. Demo mode verifies locally.
                </p>
              </div>
              <div className="mt-6 text-sm text-center">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Sign In
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Verify Mobile Number</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the OTP sent to {mobile}
              </p>

              {demoOtp && (
                <div className="mb-4 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                  <div className="font-mono font-semibold text-primary">
                    Demo OTP: {demoOtp}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Fixed test OTP <span className="font-mono">123456</span> also works.
                    Real SMS not connected.
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">6-digit OTP</Label>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </div>
                <Button
                  variant="default"
                  className="w-full"
                  onClick={onVerifyAndCreate}
                  disabled={loading}
                >
                  {loading ? "Verifying..." : "Verify & Create Account"}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onResendOtp}
                    disabled={loading}
                    type="button"
                  >
                    Resend OTP
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setStep("form");
                      setOtp("");
                      setDemoOtp("");
                      clearOtp();
                    }}
                    type="button"
                  >
                    Change mobile
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
