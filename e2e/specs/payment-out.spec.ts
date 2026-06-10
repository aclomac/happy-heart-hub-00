import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Payment Out",
  listRoute: "/app/payment-out",
  module: "payments",
  binModuleLabel: "Payment",
  seed: seeders.paymentOut,
});
