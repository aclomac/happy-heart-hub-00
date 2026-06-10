import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Mobile Banking Accounts",
  listRoute: "/app/cash",
  module: "mobile_banking_accounts",
  binModuleLabel: "Mobile",
  seed: seeders.mobileBanking,
});
