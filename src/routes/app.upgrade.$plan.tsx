import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPaymentMethods,
  listSubscriptionPlans,
  submitPaymentRequest,
} from "@/lib/billing.functions";
import { validateCoupon } from "@/lib/platform-coupons.functions";
import { PLAN_LIMITS, type PlanKey } from "@/lib/use-subscription";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import { useBillingAuthGuard, isUnauthorizedError } from "@/lib/billing-guard";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Upload, CheckCircle2, Tag, X } from "lucide-react";

export const Route = createFileRoute("/app/upgrade/$plan")({
  component: UpgradePage,
});

function UpgradePage() {
  const { plan } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const planKey = (plan === "gold" || plan === "pro" ? plan : "gold") as Exclude<PlanKey, "basic">;
  const meta = PLAN_LIMITS[planKey];
  const companyId = useCurrentCompanyId();
  const { isCloudMode, session, canCallBilling } = useBillingAuthGuard();

  const listFn = useServerFn(listPaymentMethods);
  const methodsQ = useQuery({
    queryKey: ["payment-methods", !!session?.access_token],
    enabled: isCloudMode && !!session?.access_token,
    retry: false,
    queryFn: async () => {
      try {
        return await listFn();
      } catch (e) {
        if (isUnauthorizedError(e)) return { methods: [] };
        return { methods: [] };
      }
    },
  });

  const plansFn = useServerFn(listSubscriptionPlans);
  const plansQ = useQuery({
    queryKey: ["subscription-plans", !!session?.access_token],
    enabled: isCloudMode && !!session?.access_token,
    retry: false,
    queryFn: async () => {
      try {
        return await plansFn();
      } catch (e) {
        if (isUnauthorizedError(e)) return { plans: [] };
        return { plans: [] };
      }
    },
  });

  const submitFn = useServerFn(submitPaymentRequest);
  const [method, setMethod] = useState<string>("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");
  const [transactionId, setTransactionId] = useState("");
  const [senderInfo, setSenderInfo] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const planRow = useMemo(
    () => plansQ.data?.plans.find((p) => p.key === planKey),
    [plansQ.data, planKey],
  );
  const price = useMemo(() => {
    if (planRow) {
      const v =
        billingPeriod === "monthly" ? Number(planRow.monthly_price) : Number(planRow.yearly_price);
      return v > 0 ? v : Number(planRow.price ?? meta.price);
    }
    return billingPeriod === "monthly" ? Math.round(meta.price / 10) : meta.price;
  }, [planRow, billingPeriod, meta.price]);

  const [amount, setAmount] = useState<string>("");
  const effectiveAmount = amount === "" ? String(price) : amount;

  // ---------- Coupon ----------
  const validateFn = useServerFn(validateCoupon);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    couponId: string | null;
    discount: number;
    total: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const baseAmount = Number(effectiveAmount) || 0;
  const discount = coupon?.discount ?? 0;
  const finalAmount = Math.max(0, baseAmount - discount);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    if (!canCallBilling) {
      setCouponError("Sign in to Cloud Mode before applying a coupon");
      return;
    }
    if (!companyId) {
      setCouponError("Select a company first");
      return;
    }
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await validateFn({
        data: {
          code: couponCode.trim().toUpperCase(),
          planKey,
          billingPeriod,
          companyId,
          amount: baseAmount,
        },
      });
      if (!res.valid) {
        setCoupon(null);
        setCouponError(res.reason ?? "Invalid coupon");
        return;
      }
      setCoupon({
        code: couponCode.trim().toUpperCase(),
        couponId: res.couponId ?? null,
        discount: res.discount ?? 0,
        total: res.total ?? baseAmount,
      });
      toast.success(`Coupon applied: -${res.discount} ${"USD"}`);
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setCouponLoading(false);
    }
  }

  function clearCoupon() {
    setCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  const selected = methodsQ.data?.methods.find((m) => m.method === method);

  const submit = useMutation({
    mutationFn: async () => {
      if (!canCallBilling) {
        throw new Error("Sign in to Cloud Mode before submitting a payment request");
      }
      if (!method || !transactionId || !senderInfo) {
        throw new Error("Please fill in all required fields");
      }
      let screenshotPath: string | null = null;
      if (file) {
        setUploading(true);
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Not signed in");
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("payment-screenshots")
          .upload(path, file, { upsert: false, contentType: file.type });
        setUploading(false);
        if (error) throw new Error(error.message);
        screenshotPath = path;
      }
      return submitFn({
        data: {
          plan: planKey,
          method,
          amount: finalAmount,
          transactionId,
          senderInfo,
          screenshotPath,
          companyId: companyId ?? null,
          planId: planRow?.id ?? null,
          billingPeriod,
          currency: "USD",
          note: note || null,
          couponId: coupon?.couponId ?? null,
          discountAmount: discount,
        },
      });
    },
    onSuccess: () => {
      toast.success("Payment request submitted! Admin will review shortly.");
      qc.invalidateQueries({ queryKey: ["my-payment-requests"] });
      navigate({ to: "/app/subscription" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={`Upgrade to ${meta.label}`}
        subtitle="Pay via one of the methods below, then submit your transaction details."
      />

      <div className="mb-4">
        <Link to="/app/subscription">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>
      </div>

      <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-5 mb-6">
        <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
          You are subscribing to
        </div>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-3xl font-bold">{meta.label}</span>
          <span className="text-2xl font-bold text-amber-700">${price}</span>
          <span className="text-sm text-muted-foreground">
            / {billingPeriod === "monthly" ? "month" : "year"}
          </span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {meta.max_companies >= 999999 ? "Unlimited" : meta.max_companies} companies ·{" "}
          {meta.max_devices} devices · all premium modules unlocked
        </div>

        <div className="mt-4 inline-flex rounded-md border bg-white/60 p-1 text-sm">
          {(["monthly", "yearly"] as const).map((bp) => (
            <button
              key={bp}
              type="button"
              onClick={() => {
                setBillingPeriod(bp);
                setAmount("");
              }}
              className={`px-3 py-1.5 rounded ${
                billingPeriod === bp ? "bg-amber-500 text-white" : "text-amber-900"
              }`}
            >
              {bp === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 mb-6">
        <h3 className="font-bold mb-3">1. Choose payment method</h3>
        {methodsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading methods…</div>
        ) : !methodsQ.data?.methods.length ? (
          <div className="text-sm text-muted-foreground">
            No payment methods configured yet. Please contact support.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {methodsQ.data.methods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.method)}
                className={`text-left border-2 rounded-lg px-3 py-3 transition-colors ${
                  method === m.method
                    ? "border-amber-500 bg-amber-50"
                    : "border-border hover:border-amber-300"
                }`}
              >
                <div className="font-semibold text-sm flex items-center gap-1">
                  {method === m.method && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                  {m.label}
                </div>
                {m.account_number && (
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {m.account_number}
                  </div>
                )}
                {m.account_name && (
                  <div className="text-[11px] text-muted-foreground">{m.account_name}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-4 bg-muted/40 rounded-lg p-3 text-sm">
            <div className="font-semibold mb-1">Instructions</div>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {selected.instructions ?? "Send payment and submit details below."}
            </p>
            {selected.account_number && (
              <div className="mt-2 font-mono text-xs">Account: {selected.account_number}</div>
            )}
            {selected.account_name && (
              <div className="text-xs">Account name: {selected.account_name}</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-xl p-5 mb-6 space-y-4">
        <h3 className="font-bold">2. Submit payment proof</h3>

        <div>
          <Label>Transaction ID *</Label>
          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="e.g. TXN123456"
          />
        </div>

        <div>
          <Label>Sender number / email *</Label>
          <Input
            value={senderInfo}
            onChange={(e) => setSenderInfo(e.target.value)}
            placeholder="Number or email you paid from"
          />
        </div>

        <div>
          <Label>Amount (USD) *</Label>
          <Input
            type="number"
            value={effectiveAmount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (coupon) clearCoupon();
            }}
          />
        </div>

        <div>
          <Label className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Coupon code (optional)
          </Label>
          {coupon ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
              <div>
                <span className="font-mono font-semibold">{coupon.code}</span>
                <span className="text-emerald-700 ml-2">−${discount.toFixed(2)} applied</span>
              </div>
              <button
                type="button"
                onClick={clearCoupon}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="font-mono uppercase"
              />
              <Button
                type="button"
                variant="outline"
                onClick={applyCoupon}
                disabled={couponLoading || !couponCode.trim()}
              >
                {couponLoading ? "Checking…" : "Apply"}
              </Button>
            </div>
          )}
          {couponError && <div className="text-xs text-rose-600 mt-1">{couponError}</div>}
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${baseAmount.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount</span>
              <span>−${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total payable</span>
            <span>${finalAmount.toFixed(2)} USD</span>
          </div>
        </div>

        <div>
          <Label>Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any extra info for admin"
          />
        </div>

        <div>
          <Label>Payment screenshot (optional)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="w-4 h-4 text-muted-foreground" />
          </div>
          {file && <div className="text-xs text-muted-foreground mt-1">{file.name}</div>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link to="/app/subscription">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || uploading || !method || !transactionId || !senderInfo}
          className="bg-amber-500 hover:bg-amber-600"
        >
          {submit.isPending || uploading ? "Submitting…" : "Submit payment request"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-4">
        Your plan will be activated automatically after admin approves your payment.
      </p>
    </div>
  );
}
