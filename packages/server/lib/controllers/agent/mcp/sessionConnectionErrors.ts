import { PublicMcpError } from '../../mcp/utils.js';

/**
 * A session's connections are fixed when it is resolved, so one deleted afterwards cannot be
 * replaced from inside the session, and reconnecting it is no way out either.
 */
export function connectionDeletedError(integrationId: string): PublicMcpError {
    return new PublicMcpError(
        `The connection this session uses for '${integrationId}' was deleted, so nothing on it can run and it cannot be reconnected here. Tell the user a new session is needed to use it again.`,
        { code: 'connection_deleted', integrationId }
    );
}
