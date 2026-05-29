// Home for the Function abstraction over `_nango_sync_configs` and `on_event_scripts`.
// Today only the read side (`listFunctions` / `getFunction`) lives here. The eventual roadmap
// is to consolidate write-side operations (deploy, deactivation, conflict detection) here too,
// so callers stop reaching into the underlying tables directly.

export { getFunction, listFunctions } from './service.js';
export { findActiveDeployedMeta } from './models/functions.js';
