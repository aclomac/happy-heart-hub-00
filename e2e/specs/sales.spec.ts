import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Sale Invoices",
  listRoute: "/app/sales",
  module: "sales",
  binModuleLabel: "Sales",
  seed: seeders.sale,
});
