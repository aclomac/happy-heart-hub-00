/**
 * Constants used by the demo data seeder. Bumping SEED_VERSION will cause the
 * orchestrator to re-scan and fill in any newly-added rows on next run
 * without duplicating existing data.
 */
export const DEMO_EMAIL = "demo@erpovo.com";
export const DEMO_PASSWORD = "123456";
export const DEMO_USER_ID = "demo-user-001";
export const DEMO_USER_EMAIL = "demo@erpovo.com";
export const DEMO_COMPANY_ID = "00000000-0000-0000-0000-0000000000c1";
export const DEMO_COMPANY_NAME = "Rahman Furniture House";
export const DEMO_COMPANY_NAME_BN = "রহমান ফার্নিচার হাউস";
// v3: also seeds `item_store_stock` rows so the inventory dashboard tile
// (Stock Value) and Inventory Report read the same per-warehouse stock that
// drives Items / Stock Summary, instead of falling back to 0 when storeStock
// is queried but empty.
export const SEED_VERSION = 6;
export const SEED_SOURCE = "demo_seed";
