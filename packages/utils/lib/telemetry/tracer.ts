import tracer from 'dd-trace';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

/**
 * `environment` is optional so account-level credentials, which resolve no environment, still tag
 * the account on their spans.
 */
export function tagTraceUser({
    account,
    environment,
    plan
}: {
    account: Pick<DBTeam, 'id'>;
    environment?: Pick<DBEnvironment, 'id'> | undefined;
    plan?: Pick<DBPlan, 'name'> | null;
}) {
    tracer.setUser({
        id: String(account.id),
        environmentId: environment ? String(environment.id) : undefined,
        paying: plan?.name !== 'free' ? 'paying' : 'free',
        plan: plan?.name
    });
}
