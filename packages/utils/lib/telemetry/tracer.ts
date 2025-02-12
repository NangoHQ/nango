import type { DBEnvironment, DBTeam } from '@nangohq/types';
import tracer from 'dd-trace';

export function tagTraceUser({ account, environment }: { account: DBTeam; environment: DBEnvironment }) {
    tracer.setUser({
        id: String(account.id),
        environmentId: String(environment.id),
        paying: account.is_capped ? 'free' : 'paying'
    });
}
