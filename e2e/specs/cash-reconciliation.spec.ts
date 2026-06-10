import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Cash Reconciliation",
  listRoute: "/app/cash",
  module: "cash_reconciliations",
  binModuleLabel: "Reconciliation",
  seed: seeders.cashReconciliation,
});
