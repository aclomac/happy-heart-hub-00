import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Bank Accounts",
  listRoute: "/app/cash",
  module: "bank_accounts",
  binModuleLabel: "Bank",
  seed: seeders.bank,
});
