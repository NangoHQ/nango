import type { AgentSession } from '@nangohq/types';

/**
 * What an agent should do about a missing connection. Only worth telling it to connect the
 * integration when it has the tool to do so, otherwise the honest answer is that it cannot.
 */
export function connectRecovery(integrationId: string, session: AgentSession): string {
    if (!session.metaTools.nangoCreateConnection.enabled) {
        return 'Nothing you can do from here will connect it. Tell the user they need to connect it, and carry on with the tools you do have.';
    }

    return `Call nango_create_connection with integration '${integrationId}' to get a link the user can follow, then try again once they tell you they are done.`;
}
