import type { DBEnvironment } from '../environment/db.js';
import type { DBPlan } from '../plans/db.js';
import type { DBTeam } from '../team/db.js';

/**
 * The context persist resolves when authenticating a request with an internal
 * secret key. Deliberately minimal: it holds only the fields persist actually
 * reads, fetched by a purpose-built query on the auth hot path — the Pick types
 * make unfetched fields impossible to reference. Adding a field here requires
 * extending the query in accountService.getPersistAuthContext.
 */
export interface PersistAuthContext {
    account: Pick<DBTeam, 'id'>;
    environment: Pick<DBEnvironment, 'id' | 'name'>;
    plan: Pick<DBPlan, 'id' | 'name' | 'records_store'> | null;
}
