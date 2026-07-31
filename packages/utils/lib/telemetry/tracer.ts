import tracer from 'dd-trace';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

export function tagTraceUser({
    account,
    environment,
    plan
}: {
    account: Pick<DBTeam, 'id'>;
    // Absent for account-plane credentials, which are not bound to any environment.
    environment?: Pick<DBEnvironment, 'id'> | undefined;
    plan?: Pick<DBPlan, 'name'> | null;
}) {
    tracer.setUser({
        id: String(account.id),
        ...(environment ? { environmentId: String(environment.id) } : {}),
        paying: plan?.name !== 'free' ? 'paying' : 'free',
        plan: plan?.name
    });
}
