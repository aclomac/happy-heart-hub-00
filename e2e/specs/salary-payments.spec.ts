import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Salary Payments",
  listRoute: "/app/payroll",
  module: "salary_payments",
  binModuleLabel: "Salary",
  seed: seeders.salary,
});
