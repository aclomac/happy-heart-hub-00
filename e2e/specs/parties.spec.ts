import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Parties",
  listRoute: "/app/parties",
  module: "parties",
  binModuleLabel: "Part",
  seed: seeders.party,
});
