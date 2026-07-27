import tracer from 'dd-trace';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

export function tagTraceUser({
    account,
    environment,
    plan
}: {
    account: Pick<DBTeam, 'id'>;
    environment: Pick<DBEnvironment, 'id'>;
    plan?: Pick<DBPlan, 'name'> | null;
}) {
    tracer.setUser({
        id: String(account.id),
        environmentId: String(environment.id),
        paying: plan?.name !== 'free' ? 'paying' : 'free',
        plan: plan?.name
    });
}
