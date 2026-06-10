import { describeRestoreLifecycle } from "../helpers/restore-lifecycle";
import { seeders } from "../fixtures/seeders";

describeRestoreLifecycle({
  label: "Items",
  listRoute: "/app/items",
  module: "items",
  binModuleLabel: "Item",
  seed: seeders.item,
});
