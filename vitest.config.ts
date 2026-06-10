import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      // Coverage is currently scoped to the modules that have direct unit
      // tests. As new specs land for additional helpers/components, expand
      // this `include` list (or drop it entirely) to widen the report.
      include: ["src/lib/active-query.ts"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/routeTree.gen.ts",
        "src/integrations/supabase/**",
        // UI-only and presentation modules excluded from coverage scope:
        "src/components/ui/**",
        "src/lib/pdf/**",
        "src/lib/i18n.tsx",
        "src/lib/mock-data.ts",
        "src/lib/error-page.ts",
        "src/lib/error-capture.ts",
        "src/lib/lovable-error-reporting.ts",
        "src/lib/device-fingerprint.ts",
        "src/lib/security-tests.ts",
        "src/**/*.functions.ts",
        "src/**/*.server.ts",
      ],
      // Safe initial thresholds — keep CI green while the unit/static suites
      // grow. Raise these values incrementally as coverage improves.
      thresholds: {
        lines: 40,
        functions: 35,
        branches: 30,
        statements: 40,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
