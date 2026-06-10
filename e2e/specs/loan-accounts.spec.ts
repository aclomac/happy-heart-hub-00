import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Loan Accounts",
  listRoute: "/app/cash",
  module: "loan_accounts",
  binModuleLabel: "Loan",
  seed: seeders.loan,
});
