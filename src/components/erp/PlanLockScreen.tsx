import { Link } from "@tanstack/react-router";
import {
  Lock,
  Crown,
  Check,
  Smartphone,
  Trash2,
  LogOut,
  AlertTriangle,
  History,
  LifeBuoy,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS, type PlanKey } from "@/lib/use-subscription";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { deleteDevice, resetDemoDevicesIfDemo, type DeviceRow } from "@/lib/device-fingerprint";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

export type LockReason = "plan" | "devices" | "companies" | "expired";

type Props = {
  module?: string;
  requiredPlan?: "gold" | "pro";
  reason?: LockReason;
  deviceCount?: number;
  maxDevices?: number;
  devices?: DeviceRow[];
  currentFingerprint?: string;
  onDevicesChanged?: () => void;
  currentPlan?: PlanKey;
  expiresAt?: string | null;
};

export function PlanLockScreen({
  module = "This feature",
  requiredPlan = "gold",
  reason = "plan",
  deviceCount = 0,
  maxDevices = 1,
  devices = [],
  currentFingerprint = "",
  onDevicesChanged,
  currentPlan = "basic",
  expiresAt = null,
}: Props) {
  const meta = PLAN_LIMITS[requiredPlan];
  const [busy, setBusy] = useState<string | null>(null);

  const handleDelete = async (d: DeviceRow) => {
    if (d.device_fingerprint === currentFingerprint) {
      toast.error("You cannot remove the current device. Sign out instead.");
      return;
    }
    setBusy(d.id);
    try {
      await deleteDevice(d.id);
      toast.success("Device removed");
      onDevicesChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove device");
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleResetDemo = async () => {
    setBusy("__demo__");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const did = await resetDemoDevicesIfDemo(uid);
      if (!did) {
        toast.error("Only available for the demo admin account.");
        return;
      }
      toast.success("Demo devices reset. Reloading…");
      onDevicesChanged?.();
      setTimeout(() => {
        window.location.href = "/app";
      }, 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset demo devices");
    } finally {
      setBusy(null);
    }
  };

  // ----- EXPIRED -----
  if (reason === "expired") {
    const planMeta = PLAN_LIMITS[currentPlan];
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center mb-5 shadow-lg shadow-rose-200">
          <AlertTriangle className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Your subscription has expired</h2>
        <div className="mt-2">
          <PlanStatusBadge size="md" asLink={false} plan={currentPlan} status="expired" />
        </div>
        <p className="text-muted-foreground mt-3 max-w-md">
          Renew your plan to regain access to sales, purchases, parties, items, reports, payroll,
          POS, and companies. Your data is safe — you can keep viewing your subscription and payment
          history at any time.
        </p>

        <div className="w-full mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card border rounded-xl p-4 text-left">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Current Plan
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="font-bold capitalize">{planMeta.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                EXPIRED
              </span>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-left">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Expired On</div>
            <div className="font-bold mt-1">
              {expiresAt ? new Date(expiresAt).toLocaleDateString() : "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-8 justify-center">
          <Link to="/app/upgrade/$plan" params={{ plan: "gold" }}>
            <Button
              size="lg"
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90"
            >
              <RefreshCcw className="w-4 h-4" />
              Renew Plan
            </Button>
          </Link>
          <Link to="/app/subscription">
            <Button size="lg" variant="outline">
              <History className="w-4 h-4" />
              View Payment History
            </Button>
          </Link>
          <a href="mailto:support@erpovo.com?subject=Subscription%20Help">
            <Button size="lg" variant="outline">
              <LifeBuoy className="w-4 h-4" />
              Contact Support
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // ----- DEVICES -----
  if (reason === "devices") {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-3xl mx-auto">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center mb-5 shadow-lg shadow-rose-200">
          <Smartphone className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Device limit exceeded</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Your current plan allows only <b>{maxDevices}</b> device{maxDevices === 1 ? "" : "s"}.
          Please logout from another device or upgrade your plan.
          <br />
          <span className="text-xs">Active devices: {deviceCount}</span>
        </p>

        <div className="w-full mt-8 bg-card border rounded-xl overflow-hidden text-left">
          <div className="px-4 py-3 border-b bg-muted/40 text-sm font-semibold">Your devices</div>
          <ul className="divide-y">
            {devices.map((d, idx) => {
              const isCurrent = d.device_fingerprint === currentFingerprint;
              const withinLimit = idx < Math.max(1, maxDevices);
              return (
                <li key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span className="truncate">{d.device_name || "Unknown device"}</span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">
                            THIS DEVICE
                          </span>
                        )}
                        {withinLimit ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                            BLOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last seen {new Date(d.last_seen_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === d.id || isCurrent}
                    onClick={() => handleDelete(d)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 mt-6 justify-center">
          <Link
            to="/app/upgrade/$plan"
            params={{
              plan: currentPlan === "pro" ? "pro" : currentPlan === "gold" ? "pro" : "gold",
            }}
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90"
            >
              <Crown className="w-4 h-4" />
              Upgrade Plan
            </Button>
          </Link>
          <Link to="/app/subscription">
            <Button size="lg" variant="outline">
              <Crown className="w-4 h-4" />
              Go to Subscription
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            onClick={handleResetDemo}
            disabled={busy === "__demo__"}
            title="Demo admin only — clears all other device sessions"
          >
            <RefreshCcw className="w-4 h-4" />
            Reset demo devices
          </Button>
          <Button size="lg" variant="outline" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>
    );
  }

  // ----- PLAN / COMPANIES (feature locked) -----
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-5 shadow-lg shadow-amber-200">
        <Lock className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Upgrade Required</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {module} is a {meta.label} feature.
      </p>
      <div className="mt-2">
        <PlanStatusBadge size="sm" plan={currentPlan} />
      </div>
      <p className="text-muted-foreground mt-2 max-w-md">
        This feature is not available in your current plan. Upgrade to unlock {module.toLowerCase()}
        , multi-user access, and advanced HR tools.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 max-w-2xl w-full">
        <div className="bg-card border-2 rounded-xl p-5 text-left">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-amber-500" />
            <span className="font-bold">Gold</span>
          </div>
          <div className="text-2xl font-bold">
            $60<span className="text-sm text-muted-foreground font-normal">/year</span>
          </div>
          <ul className="text-xs space-y-1.5 mt-3 text-muted-foreground">
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />2 companies
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />2 devices
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              Payroll + Employees
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              All business modules
            </li>
          </ul>
        </div>
        <div className="bg-card border-2 border-indigo-500 rounded-xl p-5 text-left relative">
          <span className="absolute -top-2.5 right-3 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">
            RECOMMENDED
          </span>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-indigo-600" />
            <span className="font-bold">Pro</span>
          </div>
          <div className="text-2xl font-bold">
            $100<span className="text-sm text-muted-foreground font-normal">/year</span>
          </div>
          <ul className="text-xs space-y-1.5 mt-3 text-muted-foreground">
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              Unlimited companies
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              10 devices
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              Everything in Gold
            </li>
            <li className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-500" />
              Priority support
            </li>
          </ul>
        </div>
      </div>
      <Link to="/app/upgrade/$plan" params={{ plan: requiredPlan }} className="mt-6">
        <Button
          variant="default"
          size="lg"
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90"
        >
          <Crown className="w-4 h-4" />
          Upgrade Plan
        </Button>
      </Link>
    </div>
  );
}
