import db from '@nangohq/database';
import { getPlan } from '@nangohq/shared';
import { Err, Ok, flagHasPlan } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function hasRbac({ accountId, plan }: { accountId: DBPlan['account_id']; plan?: Pick<DBPlan, 'has_rbac'> | null }): Promise<Result<boolean>> {
    if (!flagHasPlan) {
        return Ok(true);
    }

    if (plan) {
        return Ok(plan.has_rbac);
    }

    const planRes = await getPlan(db.knex, { accountId });
    if (planRes.isErr()) {
        return Err(planRes.error);
    }

    return Ok(planRes.value.has_rbac);
}
