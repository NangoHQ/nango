import tracer from 'dd-trace';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

export function tagTraceUser({ account, environment, plan }: { account: DBTeam; environment: DBEnvironment; plan?: DBPlan | null }) {
    tracer.setUser({
        id: String(account.id),
        environmentId: String(environment.id),
        paying: plan?.name !== 'free-v1' && plan?.name !== 'free-v2' ? 'paying' : 'free',
        plan: plan?.name
    });
}
