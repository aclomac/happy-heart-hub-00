import { cleanupSeedData } from "./seed";

export default async function globalTeardown() {
  if (process.env.E2E_SKIP_TEARDOWN === "1") return;
  try {
    await cleanupSeedData();
  } catch (err) {
    // Teardown errors should never fail the run — just surface them.
    console.warn("[e2e] cleanup failed:", err);
  }
}
