/**
 * Race-condition hardening for Sale Invoice numbering.
 *
 * These tests verify the saveSaleInvoice() behavior layer in isolation, with
 * a hand-built supabase mock that lets each test arm the next `.insert()`
 * to fail with a Postgres unique-violation (code 23505) — the exact error
 * Postgres raises when the partial unique index
 * `sales_company_doc_invoice_no_active_uidx` rejects a colliding insert.
 *
 * Soft-delete invariant: the duplicate guard intentionally ignores
 * soft-deleted invoices (matches the DB partial index, which is
 * `WHERE deleted_at IS NULL`). That contract is asserted here so it
 * isn't broken accidentally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type Row = Record<string, unknown> & { id?: string };

let salesRows: Row[] = [];
let auditCalls: Array<{ action: string; metadata: Record<string, unknown> }> = [];
let nextInsertErrors: Array<{ code?: string; message?: string } | null> = [];
let nextNumber = 1;

const STATIC_SERIES = { prefix: "INV-", start: 1, padding: 4 };

vi.mock("@/integrations/supabase/client", () => {
  let _id = 1000;
  const nextId = () => `id-${_id++}`;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (table: string): any => {
    const filters: Array<(r: Row) => boolean> = [];
    const filter = () =>
      (table === "sales" ? salesRows : []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api,
      order: () => api,
      delete: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        return api;
      },
      like: (col: string, val: unknown) => {
        const pat = String(val).replace("%", "");
        filters.push((r) => String(r[col] ?? "").startsWith(pat));
        return api;
      },
      maybeSingle: () => Promise.resolve({ data: filter()[0] ?? null, error: null }),
      single: () => {
        const r = filter()[0];
        return Promise.resolve(
          r ? { data: r, error: null } : { data: null, error: { message: "not found" } },
        );
      },
      then: (onF: any) => Promise.resolve({ data: filter(), error: null }).then(onF),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: async () => {
            const err = nextInsertErrors.shift() ?? null;
            if (err) return { data: null, error: err };
            if (table === "sales") {
              const inserted: Row = { id: nextId(), deleted_at: null, ...values };
              salesRows.push(inserted);
              return { data: inserted, error: null };
            }
            return { data: { id: nextId() }, error: null };
          },
        }),
        then: (onF: any) => Promise.resolve({ data: null, error: null }).then(onF),
      }),
    };
    return api;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "log_audit_event") {
          auditCalls.push({
            action: String(args._action),
            metadata: (args._metadata as Record<string, unknown>) || {},
          });
        }
        return { data: null, error: null };
      },
    },
  };
});

vi.mock("@/lib/sale-invoice-settings", async () => {
  return {
    loadInvoiceSeries: async () => STATIC_SERIES,
    nextSaleInvoiceNumber: async () => {
      const n = ++nextNumber;
      return `INV-${String(n).padStart(4, "0")}`;
    },
  };
});

vi.mock("@/lib/cash-ledger", () => ({
  postOnce: vi.fn(async () => undefined),
  reverseOnce: vi.fn(async () => undefined),
}));

beforeEach(() => {
  salesRows = [];
  auditCalls = [];
  nextInsertErrors = [];
  nextNumber = 1;
});
afterEach(() => vi.clearAllMocks());

const baseInput = () => ({
  company_id: "co-1",
  invoice_no: "INV-0001",
  invoice_date: "2026-01-01",
  due_date: null,
  party_id: null,
  subtotal: 100,
  discount: 0,
  tax: 0,
  delivery_charge: 0,
  labor_cost: 0,
  total: 100,
  paid: 0,
  balance: 100,
  status: "unpaid" as const,
  notes: null,
  payment_method: "cash" as const,
  bank_account_id: null,
  doc_type: "invoice" as const,
  reference_sale_id: null,
  po_no: null,
  po_date: null,
  billing_name: null,
  affect_stock: -1 as const,
  payment_direction: null,
  receivable_sign: 1 as const,
  items: [],
});

describe("Sale Invoice number — race hardening", () => {
  it("manual duplicate invoice_no is blocked with clear error", async () => {
    salesRows.push({
      id: "x",
      company_id: "co-1",
      doc_type: "invoice",
      invoice_no: "INV-0001",
      deleted_at: null,
    });
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    await expect(saveSaleInvoice(baseInput(), {})).rejects.toThrow("Duplicate invoice number");
    expect(auditCalls.some((a) => a.action === "sale_invoice.duplicate_number_blocked")).toBe(true);
  });

  it("manual entry does NOT auto-retry even if collision happens", async () => {
    salesRows.push({
      id: "x",
      company_id: "co-1",
      doc_type: "invoice",
      invoice_no: "INV-0001",
      deleted_at: null,
    });
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    await expect(saveSaleInvoice(baseInput(), { autoNumber: false })).rejects.toThrow(
      "Duplicate invoice number",
    );
    expect(
      auditCalls.find((a) => a.action === "sale_invoice.number_collision_retry"),
    ).toBeUndefined();
  });

  it("auto-numbered invoice retries on DB unique-violation collision", async () => {
    // Preflight passes (no rows in salesRows), but DB insert fails once with
    // 23505 → engine must compute next number and retry, then succeed.
    nextInsertErrors.push({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    const input = { ...baseInput(), invoice_no: "INV-0001" };
    const id = await saveSaleInvoice(input, { autoNumber: true });
    expect(id).toMatch(/^id-/);
    // On retry, invoice_no advanced to next number from series mock
    expect(input.invoice_no).toBe("INV-0002");
    const retryAudits = auditCalls.filter(
      (a) => a.action === "sale_invoice.number_collision_retry",
    );
    expect(retryAudits.length).toBeGreaterThanOrEqual(1);
    expect(retryAudits[0].metadata.retry_count).toBe(1);
    expect(retryAudits[0].metadata.stage).toBe("db");
    // Final generated-number audit fires once on success
    expect(auditCalls.some((a) => a.action === "sale_invoice.number_generated")).toBe(true);
  });

  it("auto-numbered invoice gives up after DUP_RETRY_MAX collisions", async () => {
    for (let i = 0; i < 10; i++) {
      nextInsertErrors.push({ code: "23505", message: "duplicate key" });
    }
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    await expect(saveSaleInvoice(baseInput(), { autoNumber: true })).rejects.toThrow(
      "Duplicate invoice number",
    );
    expect(auditCalls.some((a) => a.action === "sale_invoice.duplicate_number_blocked")).toBe(true);
  });

  it("simultaneous invoice saves do not duplicate (each retries independently)", async () => {
    // Two concurrent saves with the same starting invoice_no. The second one
    // hits the unique-violation on insert and retries.
    nextInsertErrors.push(null); // first insert OK
    nextInsertErrors.push({ code: "23505", message: "duplicate key" }); // second hits collision
    nextInsertErrors.push(null); // retry succeeds
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    const a = saveSaleInvoice({ ...baseInput() }, { autoNumber: true });
    const b = saveSaleInvoice({ ...baseInput() }, { autoNumber: true });
    const ids = await Promise.all([a, b]);
    expect(new Set(ids).size).toBe(2);
    expect(auditCalls.some((a) => a.action === "sale_invoice.number_collision_retry")).toBe(true);
  });

  it("soft-deleted invoice with same number does NOT block a new save", async () => {
    salesRows.push({
      id: "old",
      company_id: "co-1",
      doc_type: "invoice",
      invoice_no: "INV-0001",
      deleted_at: "2026-01-01T00:00:00Z",
    });
    const { saveSaleInvoice } = await import("@/lib/sale-invoices");
    await expect(saveSaleInvoice(baseInput(), {})).resolves.toMatch(/^id-/);
  });

  it("ships a Bangla translation for the duplicate error toast", () => {
    const src = readFileSync(resolve(__dirname, "../../lib/i18n.tsx"), "utf8");
    expect(src).toContain("একই ইনভয়েস নম্বর আছে");
  });

  it("DB partial unique index protects active rows only (migration shape)", () => {
    // Static check: the migration must add a UNIQUE index on
    // (company_id, doc_type, invoice_no) WHERE deleted_at IS NULL.
    const migs = readdirSync(resolve(__dirname, "../../../supabase/migrations"));
    const matching = migs.filter((m) => /\.sql$/.test(m));
    const found = matching.some((m) => {
      const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations", m), "utf8");
      return /CREATE\s+UNIQUE\s+INDEX[\s\S]*sales[\s\S]*company_id[\s\S]*doc_type[\s\S]*invoice_no[\s\S]*WHERE\s+deleted_at\s+IS\s+NULL/i.test(
        sql,
      );
    });
    expect(found).toBe(true);
  });
});
