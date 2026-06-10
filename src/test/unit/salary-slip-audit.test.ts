import { describe, it, expect, vi, beforeEach } from "vitest";

const auditCalls: Array<Record<string, unknown>> = [];
const pdfCalls: Array<{ fn: string; arg: unknown }> = [];

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn((input: Record<string, unknown>) => {
    auditCalls.push(input);
    return Promise.resolve();
  }),
}));

vi.mock("@/lib/pdf/invoice-pdf", () => ({
  downloadInvoicePDF: vi.fn((d: unknown) => {
    pdfCalls.push({ fn: "download", arg: d });
    return Promise.resolve();
  }),
  printInvoicePDF: vi.fn((d: unknown) => {
    pdfCalls.push({ fn: "print", arg: d });
    return Promise.resolve();
  }),
  generateInvoicePDF: vi.fn(() => {
    return Promise.resolve({
      output: () => new Blob(["pdf"], { type: "application/pdf" }),
    });
  }),
}));

vi.mock("@/lib/pdf/build-salary-slip", () => ({
  buildSalarySlipData: vi.fn(() =>
    Promise.resolve({
      title: "SALARY SLIP",
      company: { name: "Acme" },
      party: { name: "Test Employee" },
      number: "SLIP-X",
      date: "2026-06-04",
      lines: [],
      subtotal: 0,
      total: 0,
    }),
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Provide URL.createObjectURL + window.open shims
beforeEach(() => {
  auditCalls.length = 0;
  pdfCalls.length = 0;
  (globalThis as { URL: typeof URL }).URL.createObjectURL = vi.fn(() => "blob:test");
  (globalThis as unknown as { window: { open: () => void } }).window = { open: vi.fn() };
});

describe("runSalarySlipPdfAction emits audit events with metadata", () => {
  const SOURCES = ["payroll_report", "employee_detail", "salary_payment", "drilldown"] as const;
  const ACTIONS = [
    { a: "pdf", event: "salary_slip.pdf_opened" },
    { a: "preview", event: "salary_slip.previewed" },
    { a: "print", event: "salary_slip.printed" },
  ] as const;

  for (const src of SOURCES) {
    for (const { a, event } of ACTIONS) {
      it(`source=${src} action=${a} -> ${event}`, async () => {
        const { runSalarySlipPdfAction } = await import("@/lib/pdf/salary-slip-actions");
        await runSalarySlipPdfAction({
          action: a,
          slipId: "slip-1",
          companyId: "co-1",
          source: src,
          employeeId: "emp-1",
          month: "2026-06",
        });
        expect(auditCalls).toHaveLength(1);
        const c = auditCalls[0];
        expect(c.action).toBe(event);
        expect(c.module).toBe("Salary");
        expect(c.entityType).toBe("salary_slip");
        expect(c.entityId).toBe("slip-1");
        expect(c.companyId).toBe("co-1");
        const meta = c.metadata as Record<string, unknown>;
        expect(meta.source).toBe(src);
        expect(meta.salary_slip_id).toBe("slip-1");
        expect(meta.employee_id).toBe("emp-1");
        expect(meta.month).toBe("2026-06");
        expect(meta.company_id).toBe("co-1");
      });
    }
  }
});
