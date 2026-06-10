import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";
import { getAdminClient } from "../fixtures/seed";

describeRestoreLifecycle({
  label: "Expenses",
  listRoute: "/app/expenses",
  module: "expenses",
  binModuleLabel: "Expenses",
  seed: seeders.expense,
  blockedRestoreSetup: async (id) => {
    // Simulate a missing payment account dependency to trigger restore_blocked.
    const admin = getAdminClient();
    await admin
      .from("expenses")
      .update({ payment_account_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", id);
  },
});
