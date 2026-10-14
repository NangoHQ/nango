import type { AgentSession } from '@nangohq/types';

export const PLAYGROUND_USER_TAG_KEY = 'nango/playground_user';

// The owner is read from the create-connection tags, so those tags must stay per user.
export function sessionOwner(session: Pick<AgentSession, 'metaTools'>): string | undefined {
    return session.metaTools.nangoCreateConnection.tags[PLAYGROUND_USER_TAG_KEY];
}

export function isPlaygroundSession(session: Pick<AgentSession, 'metaTools'>): boolean {
    return sessionOwner(session) !== undefined;
}
