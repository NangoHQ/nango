import db from '@nangohq/database';

import { authorizes } from '../../../authz/resolve.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export async function getAuthorizedManagementMcpEnvironments({
    user,
    account,
    plan,
    environments
}: {
    user: DBUser;
    account: DBTeam;
    plan: DBPlan | null;
    environments?: DBEnvironment[] | undefined;
}): Promise<DBEnvironment[]> {
    const candidates =
        environments ??
        (await db.knex<DBEnvironment>('_nango_environments').select('*').where({ account_id: account.id, deleted: false }).orderBy('name', 'asc'));
    const locals: Partial<RequestLocals> = { user, account, plan };

    return candidates.filter((environment) => {
        locals.environment = environment;
        // This is the scope behind the dashboard's production-environment access gate.
        return authorizes(locals, 'environment:settings:read');
    });
}
