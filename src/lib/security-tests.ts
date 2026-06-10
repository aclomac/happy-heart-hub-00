import { supabase } from "@/integrations/supabase/client";
import { mapApiError, type AuthzCode } from "@/lib/api-errors";

export type TestStatus = "pass" | "fail" | "skip" | "pending";

export type TestResult = {
  status: TestStatus;
  expected: string;
  actual: string;
  code?: AuthzCode;
};

export type SecurityTest = {
  id: string;
  group: TestGroup;
  name: string;
  run: (ctx: TestCtx) => Promise<TestResult>;
};

export type TestGroup =
  | "Company Access"
  | "Role Permission"
  | "Plan Limits"
  | "Device Limits"
  | "Payroll Lock"
  | "Expired Subscription"
  | "Direct API Protection";

export type TestCtx = {
  userId: string;
  ownedCompanyId: string | null;
  plan: "basic" | "gold" | "pro" | null;
  isExpired: boolean;
  maxCompanies: number;
  maxDevices: number;
  payrollEnabled: boolean;
};

const FAKE_COMPANY_ID = "00000000-0000-0000-0000-0000000f0001";
const FAKE_USER_ID = "00000000-0000-0000-0000-0000000f0002";

// ---- helpers ----------------------------------------------------------

// PostgREST query builders are PromiseLike, not Promise — accept anything awaitable
type AwaitableQuery<T> = PromiseLike<T>;

async function expectEmpty(
  q: AwaitableQuery<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const { data, error } = await q;
  if (error) {
    return { ok: true, detail: `RLS rejected: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { ok: true, detail: "0 rows (RLS hid the data)" };
  }
  return { ok: false, detail: `Got ${data.length} rows — RLS leak!` };
}

async function expectInsertBlocked(
  q: AwaitableQuery<{ error: { message?: string; code?: string } | null }>,
): Promise<{ ok: boolean; detail: string; code?: AuthzCode }> {
  const { error } = await q;
  if (!error) return { ok: false, detail: "Insert SUCCEEDED — RLS or trigger missing!" };
  const mapped = mapApiError(error);
  return { ok: true, detail: error.message ?? "blocked", code: mapped.code };
}

// ---- test definitions -------------------------------------------------

export const SECURITY_TESTS: SecurityTest[] = [
  // === Company Access ===================================================
  {
    id: "ca-parties-fake",
    group: "Company Access",
    name: "SELECT parties with random company_id → empty",
    run: async () => {
      const r = await expectEmpty(
        supabase.from("parties").select("id").eq("company_id", FAKE_COMPANY_ID),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "0 rows (RLS blocks)",
        actual: r.detail,
      };
    },
  },
  {
    id: "ca-items-fake",
    group: "Company Access",
    name: "SELECT items with random company_id → empty",
    run: async () => {
      const r = await expectEmpty(
        supabase.from("items").select("id").eq("company_id", FAKE_COMPANY_ID),
      );
      return { status: r.ok ? "pass" : "fail", expected: "0 rows", actual: r.detail };
    },
  },
  {
    id: "ca-sales-fake",
    group: "Company Access",
    name: "SELECT sales with random company_id → empty",
    run: async () => {
      const r = await expectEmpty(
        supabase.from("sales").select("id").eq("company_id", FAKE_COMPANY_ID),
      );
      return { status: r.ok ? "pass" : "fail", expected: "0 rows", actual: r.detail };
    },
  },
  {
    id: "ca-purchases-fake",
    group: "Company Access",
    name: "SELECT purchases with random company_id → empty",
    run: async () => {
      const r = await expectEmpty(
        supabase.from("purchases").select("id").eq("company_id", FAKE_COMPANY_ID),
      );
      return { status: r.ok ? "pass" : "fail", expected: "0 rows", actual: r.detail };
    },
  },
  {
    id: "ca-helper-fake",
    group: "Company Access",
    name: "has_company_access(me, fake) → false",
    run: async ({ userId }) => {
      const { data, error } = await supabase.rpc("has_company_access", {
        _user: userId,
        _company: FAKE_COMPANY_ID,
      });
      if (error) return { status: "fail", expected: "false", actual: `error: ${error.message}` };
      return {
        status: data === false ? "pass" : "fail",
        expected: "false",
        actual: String(data),
      };
    },
  },

  // === Role Permission ==================================================
  {
    id: "rp-owner-all",
    group: "Role Permission",
    name: "Owner: has_role_permission(sales.write) → true",
    run: async ({ userId, ownedCompanyId }) => {
      if (!ownedCompanyId) return { status: "skip", expected: "—", actual: "No owned company" };
      const { data, error } = await supabase.rpc("has_role_permission", {
        _user: userId,
        _company: ownedCompanyId,
        _key: "sales.write",
      });
      if (error) return { status: "fail", expected: "true", actual: error.message };
      return { status: data === true ? "pass" : "fail", expected: "true", actual: String(data) };
    },
  },
  {
    id: "rp-owner-payroll",
    group: "Role Permission",
    name: "Owner: has_role_permission(payroll.write) → true",
    run: async ({ userId, ownedCompanyId }) => {
      if (!ownedCompanyId) return { status: "skip", expected: "—", actual: "No owned company" };
      const { data, error } = await supabase.rpc("has_role_permission", {
        _user: userId,
        _company: ownedCompanyId,
        _key: "payroll.write",
      });
      if (error) return { status: "fail", expected: "true", actual: error.message };
      return { status: data === true ? "pass" : "fail", expected: "true", actual: String(data) };
    },
  },
  {
    id: "rp-noaccess-other",
    group: "Role Permission",
    name: "Non-member: has_role_permission on fake co → false",
    run: async ({ userId }) => {
      const { data, error } = await supabase.rpc("has_role_permission", {
        _user: userId,
        _company: FAKE_COMPANY_ID,
        _key: "sales.write",
      });
      if (error) return { status: "fail", expected: "false", actual: error.message };
      return {
        status: data === false ? "pass" : "fail",
        expected: "false",
        actual: String(data),
      };
    },
  },
  {
    id: "rp-stranger-noperm",
    group: "Role Permission",
    name: "Stranger user has_role_permission on my co → false",
    run: async ({ ownedCompanyId }) => {
      if (!ownedCompanyId) return { status: "skip", expected: "—", actual: "No owned company" };
      const { data, error } = await supabase.rpc("has_role_permission", {
        _user: FAKE_USER_ID,
        _company: ownedCompanyId,
        _key: "sales.write",
      });
      if (error) return { status: "fail", expected: "false", actual: error.message };
      return {
        status: data === false ? "pass" : "fail",
        expected: "false",
        actual: String(data),
      };
    },
  },

  // === Plan Limits ======================================================
  {
    id: "pl-max-companies",
    group: "Plan Limits",
    name: "user_max_companies matches plan",
    run: async ({ userId, plan, maxCompanies }) => {
      const { data, error } = await supabase.rpc("user_max_companies", { _user: userId });
      if (error) return { status: "fail", expected: String(maxCompanies), actual: error.message };
      const expected = plan === "pro" ? 999999 : maxCompanies;
      return {
        status: data === expected ? "pass" : "fail",
        expected: String(expected),
        actual: String(data),
      };
    },
  },
  {
    id: "pl-max-devices",
    group: "Plan Limits",
    name: "user_max_devices matches plan",
    run: async ({ userId, maxDevices }) => {
      const { data, error } = await supabase.rpc("user_max_devices", { _user: userId });
      if (error) return { status: "fail", expected: String(maxDevices), actual: error.message };
      return {
        status: data === maxDevices ? "pass" : "fail",
        expected: String(maxDevices),
        actual: String(data),
      };
    },
  },
  {
    id: "pl-active-sub",
    group: "Plan Limits",
    name: "has_active_subscription reflects state",
    run: async ({ userId, isExpired }) => {
      const { data, error } = await supabase.rpc("has_active_subscription", { _user: userId });
      if (error) return { status: "fail", expected: String(!isExpired), actual: error.message };
      return {
        status: data === !isExpired ? "pass" : "fail",
        expected: String(!isExpired),
        actual: String(data),
      };
    },
  },

  // === Device Limits ====================================================
  {
    id: "dl-current-count",
    group: "Device Limits",
    name: "current_device_count ≤ user_max_devices",
    run: async ({ userId, maxDevices }) => {
      const { data: cur, error } = await supabase.rpc("current_device_count", { _user: userId });
      if (error) return { status: "fail", expected: `≤ ${maxDevices}`, actual: error.message };
      const n = Number(cur);
      return {
        status: n <= maxDevices ? "pass" : "fail",
        expected: `≤ ${maxDevices}`,
        actual: String(n),
      };
    },
  },
  {
    id: "dl-device-fake-user",
    group: "Device Limits",
    name: "INSERT device for another user_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase
          .from("devices")
          .insert({ user_id: FAKE_USER_ID, device_fingerprint: "security-test-" + Date.now() }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects (different user_id)",
        actual: r.detail,
        code: r.code,
      };
    },
  },

  // === Payroll Lock =====================================================
  {
    id: "py-feature",
    group: "Payroll Lock",
    name: "has_feature_access(payroll) matches plan",
    run: async ({ userId, payrollEnabled }) => {
      const { data, error } = await supabase.rpc("has_feature_access", {
        _user: userId,
        _feature: "payroll",
      });
      if (error) return { status: "fail", expected: String(payrollEnabled), actual: error.message };
      return {
        status: data === payrollEnabled ? "pass" : "fail",
        expected: String(payrollEnabled),
        actual: String(data),
      };
    },
  },
  {
    id: "py-employees-basic",
    group: "Payroll Lock",
    name: "Basic plan: SELECT employees on own co → empty",
    run: async ({ plan, ownedCompanyId }) => {
      if (plan !== "basic" || !ownedCompanyId)
        return { status: "skip", expected: "—", actual: `plan=${plan}` };
      const r = await expectEmpty(
        supabase.from("employees").select("id").eq("company_id", ownedCompanyId),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "0 rows (payroll feature off)",
        actual: r.detail,
      };
    },
  },
  {
    id: "py-employees-insert-basic",
    group: "Payroll Lock",
    name: "Basic plan: INSERT employee → blocked",
    run: async ({ plan, ownedCompanyId }) => {
      if (plan !== "basic" || !ownedCompanyId)
        return { status: "skip", expected: "—", actual: `plan=${plan}` };
      const r = await expectInsertBlocked(
        supabase.from("employees").insert({
          company_id: ownedCompanyId,
          name: "_security_test_marker",
          base_salary: 0,
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "blocked by RLS",
        actual: r.detail,
        code: r.code,
      };
    },
  },

  // === Expired Subscription =============================================
  {
    id: "ex-write-blocked",
    group: "Expired Subscription",
    name: "Expired: INSERT party on own co → blocked",
    run: async ({ isExpired, ownedCompanyId }) => {
      if (!isExpired || !ownedCompanyId)
        return { status: "skip", expected: "—", actual: "subscription active" };
      const r = await expectInsertBlocked(
        supabase.from("parties").insert({
          company_id: ownedCompanyId,
          name: "_security_test_marker",
          type: "customer",
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects (expired)",
        actual: r.detail,
        code: r.code,
      };
    },
  },
  {
    id: "ex-sub-read",
    group: "Expired Subscription",
    name: "Expired: can still read own subscriptions row",
    run: async ({ userId }) => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("owner_id", userId);
      if (error) return { status: "fail", expected: "row visible", actual: error.message };
      return {
        status: (data?.length ?? 0) > 0 ? "pass" : "fail",
        expected: "≥ 1 row",
        actual: `${data?.length ?? 0} rows`,
      };
    },
  },

  // === Direct API Protection ============================================
  {
    id: "api-insert-fake-co",
    group: "Direct API Protection",
    name: "INSERT sale with fake company_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase.from("sales").insert({
          company_id: FAKE_COMPANY_ID,
          invoice_no: "SEC-TEST-" + Date.now(),
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects (no access)",
        actual: r.detail,
        code: r.code,
      };
    },
  },
  {
    id: "api-insert-item-fake",
    group: "Direct API Protection",
    name: "INSERT item with fake company_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase.from("items").insert({
          company_id: FAKE_COMPANY_ID,
          name: "_security_test_marker",
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects",
        actual: r.detail,
        code: r.code,
      };
    },
  },
  {
    id: "api-insert-party-fake",
    group: "Direct API Protection",
    name: "INSERT party with fake company_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase.from("parties").insert({
          company_id: FAKE_COMPANY_ID,
          name: "_security_test_marker",
          type: "customer",
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects",
        actual: r.detail,
        code: r.code,
      };
    },
  },
  {
    id: "api-insert-company-other-owner",
    group: "Direct API Protection",
    name: "INSERT company with other owner_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase.from("companies").insert({
          owner_id: FAKE_USER_ID,
          name: "_security_test_marker",
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects (owner_id mismatch)",
        actual: r.detail,
        code: r.code,
      };
    },
  },
  {
    id: "api-payment-req-other",
    group: "Direct API Protection",
    name: "INSERT payment_request with other user_id → blocked",
    run: async () => {
      const r = await expectInsertBlocked(
        supabase.from("payment_requests").insert({
          user_id: FAKE_USER_ID,
          plan: "gold",
          amount: 1,
          method: "test",
          transaction_id: "SEC-TEST",
          sender_info: "test",
        }),
      );
      return {
        status: r.ok ? "pass" : "fail",
        expected: "RLS rejects (user_id mismatch)",
        actual: r.detail,
        code: r.code,
      };
    },
  },
];

export const TEST_GROUPS: TestGroup[] = [
  "Company Access",
  "Role Permission",
  "Plan Limits",
  "Device Limits",
  "Payroll Lock",
  "Expired Subscription",
  "Direct API Protection",
];
