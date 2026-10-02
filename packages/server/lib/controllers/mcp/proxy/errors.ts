import { getLogger } from '@nangohq/utils';

import { ProxyResponseFormatError } from '../../../services/mcpProxyResponse.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { McpProxyError } from '../../../services/mcpProxy.service.js';

const logger = getLogger('Server.MCP.Proxy');

export function proxyRequestErrorToMcp(error: McpProxyError): Error {
    if (error instanceof ProxyResponseFormatError) {
        return new PublicMcpError(error.message);
    }

    const code = error.code;
    switch (code) {
        case 'base_url_override_disabled':
        case 'base_url_override_not_allowed':
        case 'plan_limit':
        case 'unknown_integration':
        case 'connection_not_found':
        case 'connection_refresh_backoff':
        case 'credentials_refresh_failed':
        case 'proxy_request_failed':
            return new PublicMcpError(error.message);
        case 'internal_error':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ProxyService error code while proxying request', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
