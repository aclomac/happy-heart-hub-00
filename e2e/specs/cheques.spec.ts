import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";
import { getAdminClient } from "../fixtures/seed";

describeRestoreLifecycle({
  label: "Cheques",
  listRoute: "/app/cash",
  module: "cheques",
  binModuleLabel: "Cheque",
  seed: seeders.cheque,
  blockedRestoreSetup: async (id) => {
    const admin = getAdminClient();
    await admin
      .from("cheques")
      .update({ bank_account_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", id);
  },
});
