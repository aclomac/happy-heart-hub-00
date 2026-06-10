import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Purchase Bills",
  listRoute: "/app/purchases",
  module: "purchases",
  binModuleLabel: "Purchases",
  seed: seeders.purchase,
});
