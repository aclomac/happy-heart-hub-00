import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Payment In",
  listRoute: "/app/payments-in",
  module: "payments",
  binModuleLabel: "Payment",
  seed: seeders.paymentIn,
});
