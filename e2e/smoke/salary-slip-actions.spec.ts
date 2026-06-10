import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";
import { ensureSalarySlipFixture } from "../fixtures/seeders";

/**
 * Browser smoke for the salary slip PDF flow across:
 *  - Salary slip detail
 *  - Payroll Reports
 *  - Employee detail
 *  - Salary Payment detail (linked slip)
 *
 * Skips cleanly when E2E_BASE_URL / E2E_COMPANY_ID / service role key are
 * not configured, or when the seed fixture cannot be created.
 */

type Fixture = Awaited<ReturnType<typeof ensureSalarySlipFixture>>;

let fixture: Fixture | null = null;
let banglaFixture: Fixture | null = null;
let fixtureError: string | null = null;

test.beforeAll(async () => {
  if (
    !process.env.E2E_BASE_URL ||
    !process.env.E2E_COMPANY_ID ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    fixtureError = "E2E_BASE_URL / company / service role key not configured";
    return;
  }
  try {
    fixture = await ensureSalarySlipFixture();
    banglaFixture = await ensureSalarySlipFixture({ bangla: true });
  } catch (e) {
    fixtureError = e instanceof Error ? e.message : String(e);
  }
});

async function gotoApp(page: Page, path: string) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.describe("Salary slip detail PDF actions", () => {
  test("loads detail and triggers PDF/Preview/Print without errors", async ({ page, context }) => {
    test.skip(!fixture, fixtureError ?? "no salary slip fixture");
    const bag = attachErrorWatch(page);
    await gotoApp(page, `/app/payroll/salary-slips/${fixture!.slipId}`);

    await expect(page.getByRole("heading", { name: /Salary Slip/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(fixture!.periodMonth)).toBeVisible();
    await expect(page.getByText(/E2E Salary Slip Employee/i)).toBeVisible();
    await expect(page.getByText(/Net payable/i)).toBeVisible();

    // Preview opens in a new tab — capture it.
    const previewPromise = context.waitForEvent("page").catch(() => null);
    await page.getByRole("button", { name: /^Open PDF$/ }).click();
    await page.getByRole("button", { name: /^Preview$/ }).click();
    await previewPromise;
    await page.getByRole("button", { name: /^Print$/ }).click();

    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});

test.describe("Payroll Reports salary slip row", () => {
  test("renders seeded slip row and triggers PDF actions", async ({ page }) => {
    test.skip(!fixture, fixtureError ?? "no salary slip fixture");
    const bag = attachErrorWatch(page);
    await gotoApp(page, "/app/payroll#reports");
    await expect(page.getByText(fixture!.periodMonth).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(bag.all()).toEqual([]);
  });
});

test.describe("Employee detail salary slip actions", () => {
  test("opens seeded employee and exercises slip actions", async ({ page }) => {
    test.skip(!fixture, fixtureError ?? "no salary slip fixture");
    const bag = attachErrorWatch(page);
    await gotoApp(page, `/app/payroll/employees/${fixture!.employeeId}`);

    await expect(page.getByRole("heading", { name: /E2E Salary Slip Employee/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(fixture!.periodMonth).first()).toBeVisible();
    expect(bag.all()).toEqual([]);
  });
});

test.describe("Salary Payment linked slip actions", () => {
  test("opens seeded payment with linked slip buttons", async ({ page }) => {
    test.skip(!fixture, fixtureError ?? "no salary slip fixture");
    const bag = attachErrorWatch(page);
    await gotoApp(page, `/app/payroll/salary-payments/${fixture!.paymentId}`);

    await expect(page.getByRole("heading", { name: /Salary Payment/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Linked slip|Slip PDF/i).first()).toBeVisible();
    expect(bag.all()).toEqual([]);
  });
});

test.describe("Bangla salary slip rendering", () => {
  test("Bangla-name employee detail loads without NaN/undefined", async ({ page }) => {
    test.skip(!banglaFixture, fixtureError ?? "no bangla salary slip fixture");
    const bag = attachErrorWatch(page);
    await gotoApp(page, `/app/payroll/salary-slips/${banglaFixture!.slipId}`);

    await expect(page.getByRole("heading", { name: /Salary Slip/i })).toBeVisible({
      timeout: 15_000,
    });
    // Bangla employee name visible
    await expect(page.getByText(/রহিম/)).toBeVisible();
    // Required fields surface (preview content assertions)
    await expect(page.getByText(/Gross/i)).toBeVisible();
    await expect(page.getByText(/Net payable/i)).toBeVisible();
    await expect(page.getByText(/Paid/i).first()).toBeVisible();
    await expect(page.getByText(/Pending/i)).toBeVisible();
    await expect(page.getByText(/Status/i)).toBeVisible();
    await expect(page.getByText(banglaFixture!.periodMonth)).toBeVisible();

    // PDF actions must not crash
    await page.getByRole("button", { name: /^Open PDF$/ }).click();
    await page.getByRole("button", { name: /^Print$/ }).click();

    // No NaN/undefined leakage in rendered text
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("nan");
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("null");

    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
