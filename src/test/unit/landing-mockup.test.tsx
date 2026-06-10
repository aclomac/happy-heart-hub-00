import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroMockup } from "@/components/landing/HeroMockup";
import fs from "node:fs";
import path from "node:path";

// Mock Recharts to avoid issues with window/document in static rendering
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div className="recharts-responsive-container">{children}</div>
  ),
  BarChart: ({ children }: any) => <div className="recharts-bar-chart">{children}</div>,
  Bar: () => <div className="recharts-bar" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

function html(ui: React.ReactElement) {
  return renderToStaticMarkup(ui);
}

describe("Landing Hero Mockup", () => {
  it("HeroMockup renders with dashboard elements", () => {
    const out = html(<HeroMockup />);
    expect(out).toContain("আজকের বিক্রি / Today&#x27;s Sales");
    expect(out).toContain("৳ 42,500");
    expect(out).toContain("কম স্টক");
    expect(out).toContain("অনলাইন অর্ডার");
    expect(out).toContain("Total Sales");
    expect(out).toContain("সাম্প্রতিক লেনদেন");
    expect(out).toContain("Rahman Furniture House");
    expect(out).toContain("Quick POS Sale");
  });

  it("placeholder '[App Dashboard Mockup]' is removed from landing page", () => {
    // Correctly resolve the path relative to the project root in the sandbox
    const src = fs.readFileSync("src/routes/index.tsx", "utf8");
    expect(src).not.toContain("[App Dashboard Mockup]");
    expect(src).toContain("<HeroMockup");
  });

  it("floating cards are present in the markup", () => {
    const out = html(<HeroMockup />);
    expect(out).toContain("আজকের বিক্রি / Today&#x27;s Sales");
    expect(out).toContain("কম স্টক");
    expect(out).toContain("অনলাইন অর্ডার");
    expect(out).toContain("বকেয়া টাকা");
    expect(out).toContain("POS চালু");
  });
});
