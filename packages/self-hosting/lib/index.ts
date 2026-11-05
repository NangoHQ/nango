export { migrate as migrateCloudDb } from './cloud/db/migrate.js';
export { CUSTOMERS_TABLE, INSTALLATION_KEYS_TABLE, INSTALLATION_LICENSES_TABLE, INSTALLATIONS_TABLE, SELF_HOSTING_SCHEMA } from './cloud/db/schema.js';
export { createCustomer, getCustomerByName } from './cloud/services/customer.service.js';
export { createInstallation, getInstallationByUuid } from './cloud/services/installation.service.js';
export { createInstallationKey, deleteInstallationKey, listInstallationKeys } from './cloud/services/installation-key.service.js';
export { createInstallationLicense, deactivateLicense, getActiveLicense } from './cloud/services/installation-license.service.js';
export type { RegistryDb } from './cloud/services/db.js';
