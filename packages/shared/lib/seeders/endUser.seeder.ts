import type { DBEnvironment, DBTeam, EndUser } from '@nangohq/types';
import { createEndUser as createEndUserOriginal } from '../services/endUser.service.js';
import db from '@nangohq/database';
import { nanoid } from '@nangohq/utils';

export async function createEndUser({ account, environment }: { account: DBTeam; environment: DBEnvironment }): Promise<EndUser> {
    const id = nanoid();
    const endUser = await createEndUserOriginal(db.knex, {
        accountId: account.id,
        environmentId: environment.id,
        endUserId: id,
        email: `${id}@example.com`,
        organization: { organizationId: nanoid() }
    });
    if (endUser.isErr()) {
        throw new Error('failed_to_create_end_user');
    }
    return endUser.value;
}
