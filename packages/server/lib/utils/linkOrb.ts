import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { updatePlanByTeam } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { BillingCustomer, BillingSubscription, DBTeam, DBUser, Result } from '@nangohq/types';

/**
 * Creates an Orb customer (if it doesn't exist) and links it to the account plan
 */
export async function linkOrbCustomer(account: DBTeam, user: DBUser): Promise<Result<BillingCustomer>> {
    const resUpsert = await billing.upsertCustomer(account, user);
    if (resUpsert.isErr()) {
        return Err(resUpsert.error);
    }

    const resUpdate = await updatePlanByTeam(db.knex, { account_id: account.id, orb_customer_id: resUpsert.value.id });
    if (resUpdate.isErr()) {
        return Err(resUpdate.error);
    }

    return Ok(resUpsert.value);
}

/**
 * Creates an Orb subscription (free) and links it to the account plan
 */
export async function linkOrbFreeSubscription(account: DBTeam): Promise<Result<BillingSubscription>> {
    const resCreate = await billing.createSubscription(account, 'free');
    if (resCreate.isErr()) {
        return Err(resCreate.error);
    }

    const resUpdate = await updatePlanByTeam(db.knex, { account_id: account.id, orb_subscription_id: resCreate.value.id });
    if (resUpdate.isErr()) {
        return Err(resUpdate.error);
    }

    return Ok(resCreate.value);
}
