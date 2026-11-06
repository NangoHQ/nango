import type { AgentSession } from '@nangohq/types';

/** The sentence an agent is given about a missing connection, telling it what to do next. */
export function notConnectedGuidance(integrationId: string, session: AgentSession): string {
    if (!session.metaTools.nangoCreateConnection.enabled) {
        return 'Tell the user they need to connect it, and carry on with the tools you do have.';
    }

    return `Call nango_create_connection with integration '${integrationId}' to get a link the user can follow, then try again once they tell you they are done.`;
}
