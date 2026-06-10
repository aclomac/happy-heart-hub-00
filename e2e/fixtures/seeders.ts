import { randomUUID } from "node:crypto";
import { getAdminClient, trackSeededRecord } from "../fixtures/seed";
import { requireEnv } from "../helpers/env";

function uniq(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function ensureParty(companyId: string) {
  const admin = getAdminClient();
  const { data } = await admin
    .from("parties")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", "E2E Party%")
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  const ins = await admin
    .from("parties")
    .insert({
      company_id: companyId,
      name: `E2E Party ${randomUUID().slice(0, 4)}`,
      party_type: "customer",
    })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  trackSeededRecord("parties", ins.data!.id as string);
  return ins.data!.id as string;
}

async function ensureItem(companyId: string) {
  const admin = getAdminClient();
  const { data } = await admin
    .from("items")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", "E2E Item%")
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  const ins = await admin
    .from("items")
    .insert({
      company_id: companyId,
      name: `E2E Item ${randomUUID().slice(0, 4)}`,
      sale_price: 100,
      purchase_price: 80,
      stock_qty: 50,
    })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  trackSeededRecord("items", ins.data!.id as string);
  return ins.data!.id as string;
}

async function ensureBank(companyId: string) {
  const admin = getAdminClient();
  const { data } = await admin
    .from("bank_accounts")
    .select("id")
    .eq("company_id", companyId)
    .ilike("account_name", "E2E Bank%")
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  const ins = await admin
    .from("bank_accounts")
    .insert({
      company_id: companyId,
      account_name: `E2E Bank ${randomUUID().slice(0, 4)}`,
      balance: 10000,
    })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  trackSeededRecord("bank_accounts", ins.data!.id as string);
  return ins.data!.id as string;
}

async function insert(table: string, row: Record<string, unknown>) {
  const admin = getAdminClient();
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error) throw error;
  const id = data!.id as string;
  trackSeededRecord(table, id);
  return id;
}

export const seeders = {
  async sale() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const partyId = await ensureParty(companyId);
    const reference = uniq("INV-E2E");
    const id = await insert("sales", {
      company_id: companyId,
      party_id: partyId,
      doc_type: "invoice",
      reference_no: reference,
      total: 100,
      status: "posted",
    });
    return { id, reference };
  },

  async purchase() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const partyId = await ensureParty(companyId);
    const reference = uniq("BILL-E2E");
    const id = await insert("purchases", {
      company_id: companyId,
      party_id: partyId,
      doc_type: "bill",
      reference_no: reference,
      total: 200,
      status: "posted",
    });
    return { id, reference };
  },

  async expense() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("EXP-E2E");
    const id = await insert("expenses", {
      company_id: companyId,
      reference_no: reference,
      amount: 50,
      description: "E2E expense",
    });
    return { id, reference };
  },

  async paymentIn() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const partyId = await ensureParty(companyId);
    const reference = uniq("PI-E2E");
    const id = await insert("payments", {
      company_id: companyId,
      party_id: partyId,
      reference_no: reference,
      direction: "in",
      amount: 100,
    });
    return { id, reference };
  },

  async paymentOut() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const partyId = await ensureParty(companyId);
    const reference = uniq("PO-E2E");
    const id = await insert("payments", {
      company_id: companyId,
      party_id: partyId,
      reference_no: reference,
      direction: "out",
      amount: 75,
    });
    return { id, reference };
  },

  async item() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("ITEM-E2E");
    const id = await insert("items", {
      company_id: companyId,
      name: reference,
      sale_price: 10,
      purchase_price: 5,
      stock_qty: 0,
    });
    return { id, reference };
  },

  async party() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("PARTY-E2E");
    const id = await insert("parties", {
      company_id: companyId,
      name: reference,
      party_type: "customer",
    });
    return { id, reference };
  },

  async bank() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("BANK-E2E");
    const id = await insert("bank_accounts", {
      company_id: companyId,
      account_name: reference,
      balance: 0,
    });
    return { id, reference };
  },

  async mobileBanking() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("MB-E2E");
    const id = await insert("mobile_banking_accounts", {
      company_id: companyId,
      account_name: reference,
      provider: "Test",
      balance: 0,
    });
    return { id, reference };
  },

  async cheque() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const bankId = await ensureBank(companyId);
    const reference = uniq("CHQ-E2E");
    const id = await insert("cheques", {
      company_id: companyId,
      cheque_number: reference,
      bank_account_id: bankId,
      amount: 100,
      direction: "in",
    });
    return { id, reference };
  },

  async loan() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("LOAN-E2E");
    const id = await insert("loan_accounts", {
      company_id: companyId,
      lender_name: reference,
      principal_amount: 1000,
      outstanding_balance: 1000,
    });
    return { id, reference };
  },

  async salary() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("SAL-E2E");
    const id = await insert("salary_payments", {
      company_id: companyId,
      reference_no: reference,
      amount: 500,
    });
    return { id, reference };
  },

  async cashReconciliation() {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const reference = uniq("REC-E2E");
    const id = await insert("cash_reconciliations", {
      company_id: companyId,
      reference_no: reference,
      counted_amount: 100,
      system_amount: 100,
    });
    return { id, reference };
  },
};

/**
 * Idempotent salary slip fixture for E2E smoke tests.
 *
 * Creates (or reuses) a stable employee, attendance rows for the current
 * payroll month, one salary slip, and one linked salary payment. Re-running
 * the helper does NOT duplicate any rows — it looks up existing fixture
 * records by stable code/period/reference.
 */
export async function ensureSalarySlipFixture(opts?: {
  companyId?: string;
  /** When true, seeds Bangla employee name + Bangla note for smoke coverage. */
  bangla?: boolean;
}): Promise<{
  employeeId: string;
  slipId: string;
  paymentId: string;
  periodMonth: string;
}> {
  const admin = getAdminClient();
  const companyId = opts?.companyId ?? requireEnv("E2E_COMPANY_ID");

  const EMP_CODE = opts?.bangla ? "E2E-SLIP-EMP-BN" : "E2E-SLIP-EMP";
  const EMP_NAME = opts?.bangla ? "রহিম উদ্দিন (E2E)" : "E2E Salary Slip Employee";
  const PAY_REF = opts?.bangla ? "E2E-SLIP-PAY-BN" : "E2E-SLIP-PAY";
  const SLIP_NOTE = opts?.bangla
    ? "[e2e-seed] বাংলা স্যালারি স্লিপ"
    : "[e2e-seed] salary slip fixture";

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 1) Employee (stable by code+company)
  let employeeId: string;
  {
    const { data } = await admin
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", EMP_CODE)
      .maybeSingle();
    if (data?.id) {
      employeeId = data.id as string;
    } else {
      const ins = await admin
        .from("employees")
        .insert({
          company_id: companyId,
          code: EMP_CODE,
          name: EMP_NAME,
          designation: "QA Engineer",
          phone: "+8801700000000",
          pay_type: "fixed",
          salary_type: "fixed",
          base_salary: 25000,
          is_active: true,
          notes: SLIP_NOTE,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      employeeId = ins.data!.id as string;
      trackSeededRecord("employees", employeeId);
    }
  }

  // 2) Attendance rows for current month (idempotent via unique (employee_id,date))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const attRows: Array<Record<string, unknown>> = [];
  for (let d = 1; d <= Math.min(daysInMonth, 26); d++) {
    attRows.push({
      company_id: companyId,
      employee_id: employeeId,
      date: `${periodMonth}-${String(d).padStart(2, "0")}`,
      status: "present",
    });
  }
  await admin
    .from("attendance")
    .upsert(attRows, { onConflict: "employee_id,date", ignoreDuplicates: true });

  // 3) Salary slip (stable by employee_id+period_month unique constraint)
  let slipId: string;
  {
    const { data } = await admin
      .from("salary_slips")
      .select("id")
      .eq("company_id", companyId)
      .eq("employee_id", employeeId)
      .eq("period_month", periodMonth)
      .maybeSingle();
    if (data?.id) {
      slipId = data.id as string;
    } else {
      const gross = 25000;
      const net = gross;
      const ins = await admin
        .from("salary_slips")
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          period_month: periodMonth,
          days_present: 26,
          days_total: daysInMonth,
          gross,
          bonus: 0,
          deductions: 0,
          advance: 0,
          net,
          due: net / 2,
          status: "partial",
          notes: SLIP_NOTE,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      slipId = ins.data!.id as string;
      trackSeededRecord("salary_slips", slipId);
    }
  }

  // 4) Linked salary payment (stable by reference_no)
  let paymentId: string;
  {
    const { data } = await admin
      .from("employee_payments")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_no", PAY_REF)
      .maybeSingle();
    if (data?.id) {
      paymentId = data.id as string;
    } else {
      const ins = await admin
        .from("employee_payments")
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          amount: 12500,
          payment_date: `${periodMonth}-15`,
          method: "cash",
          reference_no: PAY_REF,
          notes: `[e2e-seed] partial salary for ${periodMonth}`,
          status: "posted",
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      paymentId = ins.data!.id as string;
      trackSeededRecord("employee_payments", paymentId);
    }
  }

  return { employeeId, slipId, paymentId, periodMonth };
}
