import type { DBEnvironment } from '../environment/db.js';
import type { DBPlan } from '../plans/db.js';
import type { DBTeam } from '../team/db.js';

/**
 * Minimal auth context resolved for internal-secret callers (persist hot path).
 * Only the fields consumers actually read are fetched from the DB — adding a
 * field here means extending the query in accountService.getInternalAuthContext.
 */
export interface InternalAuthContext {
    account: Pick<DBTeam, 'id'>;
    environment: Pick<DBEnvironment, 'id' | 'name'>;
    plan: Pick<DBPlan, 'id' | 'name' | 'records_store'> | null;
}
