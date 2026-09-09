import { NangoError } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { ProxyResponseFormatError } from '../../../../services/mcpProxyResponse.js';
import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';

import type { McpProxyError } from '../../../../services/mcpProxy.service.js';
import type { ProxyServiceError } from '../../../../services/proxy.service.js';

const logger = getLogger('Server.MCP.AgentSession.Proxy');

const TRANSIENT_REFRESH_ERROR_TYPES = new Set(['refresh_token_external_error']);

export function proxyErrorToMcp({ error, integrationId }: { error: McpProxyError; integrationId: string }): Error {
    if (error instanceof ProxyResponseFormatError) {
        return new PublicMcpError(error.message, { code: error.code, integrationId });
    }

    const detail = endsSentence(error.message);
    const code = error.code;
    switch (code) {
        case 'base_url_override_disabled':
        case 'base_url_override_not_allowed':
            return new PublicMcpError(
                `Integration '${integrationId}' cannot be reached directly. Use one of this session's tools instead, or tell the user the request cannot be completed.`,
                { code: 'proxy_not_allowed', integrationId }
            );
        case 'plan_limit':
            return new PublicMcpError(
                `Integration '${integrationId}' cannot be reached right now, and trying again will not change that. Tell the user the request cannot be completed.`,
                { code: 'plan_limit', integrationId }
            );
        case 'unknown_integration':
            return new PublicMcpError(`${detail} Use one of this session's integrations.`, { code: 'unknown_integration', integrationId });
        case 'connection_refresh_backoff':
            return new PublicMcpError(`${detail} Try the call again in a moment, and tell the user only if it keeps failing.`, {
                code: 'temporarily_unavailable',
                integrationId
            });
        case 'connection_not_found':
            return new PublicMcpError(
                `${detail} No request to '${integrationId}' can be authenticated until then, so tell the user it needs to be reconnected.`,
                { code: 'integration_not_connected', integrationId }
            );
        case 'credentials_refresh_failed':
            return isTransientRefreshFailure(error)
                ? new PublicMcpError(`${detail} Try the call again in a moment, and tell the user only if it keeps failing.`, {
                      code: 'temporarily_unavailable',
                      integrationId
                  })
                : new PublicMcpError(
                      `${detail} No request to '${integrationId}' can be authenticated until then, so tell the user it needs to be reconnected.`,
                      { code: 'integration_not_connected', integrationId }
                  );
        case 'proxy_request_failed':
            return new PublicMcpError(`${detail} Read the failure before deciding whether to change the request, try once more, or tell the user.`, {
                code: 'provider_error',
                integrationId
            });
        case 'internal_error':
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ProxyService error code while proxying an agent session request', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}

function endsSentence(message: string): string {
    return /[.!?]$/.test(message) ? message : `${message}.`;
}

function isTransientRefreshFailure(error: ProxyServiceError): boolean {
    return error.cause instanceof NangoError && TRANSIENT_REFRESH_ERROR_TYPES.has(error.cause.type);
}
