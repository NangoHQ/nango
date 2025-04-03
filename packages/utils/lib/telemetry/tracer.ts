import tracer from 'dd-trace';

import type { DBEnvironment, DBTeam } from '@nangohq/types';

export function tagTraceUser({ account, environment }: { account: DBTeam; environment: DBEnvironment }) {
    tracer.setUser({
        id: String(account.id),
        environmentId: String(environment.id),
        // TODO: use plan
        paying: account.is_capped ? 'free' : 'paying'
    });
}
