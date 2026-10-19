import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { freePlan, getPlan, updatePlanByTeam } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { BillingCustomer, BillingSubscription, DBTeam, DBUser, Result } from '@nangohq/types';

/**
 * Creates a billing customer (if it doesn't exist) and links it to the account plan
 */
export async function linkBillingCustomer(account: DBTeam, user: DBUser): Promise<Result<BillingCustomer>> {
    const resUpsert = await billing.getOrCreateCustomer(account.id, { legalEntityName: account.name, email: user.email });
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
 * Creates a billing subscription (free) and links it to the account plan
 */
export async function linkBillingFreeSubscription(account: DBTeam): Promise<Result<BillingSubscription>> {
    const resPlan = await getPlan(db.knex, { accountId: account.id });
    if (resPlan.isErr()) {
        return Err(resPlan.error);
    }
    if (resPlan.value.orb_subscription_id) {
        return Err(new Error('billing_subscription_already_linked'));
    }

    const resCreate = await billing.createSubscription(account, freePlan.code ?? 'free');
    if (resCreate.isErr()) {
        return Err(resCreate.error);
    }

    const resUpdate = await updatePlanByTeam(db.knex, { account_id: account.id, orb_subscription_id: resCreate.value.id });
    if (resUpdate.isErr()) {
        return Err(resUpdate.error);
    }

    return Ok(resCreate.value);
}
