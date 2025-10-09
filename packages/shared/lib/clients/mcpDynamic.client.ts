import { discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationSchema, OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthorizationCode } from 'simple-oauth2';

import { NangoError } from '../utils/error.js';

import type { ServiceResponse } from '../models/Generic.js';
import type { OAuthClientInformation, OAuthMetadata, OAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { LogContext, LogContextStateless } from '@nangohq/logs';
import type { DBConnectionDecrypted, OAuth2Credentials } from '@nangohq/types';
import type { AccessToken } from 'simple-oauth2';

/**
 * Discovers OAuth scopes from server metadata, with preference for resource metadata scopes
 */
function discoverScopes(resourceMetadata?: OAuthProtectedResourceMetadata, metadata?: OAuthMetadata): string | undefined {
    const resourceScopes = resourceMetadata?.scopes_supported;
    const oauthScopes = metadata?.scopes_supported;
    const scopes = (resourceScopes?.length ? resourceScopes : oauthScopes) || [];
    return scopes.length > 0 ? scopes.join(' ') : undefined;
}

/**
 * MCP Dynamic OAuth metadata discovery utility
 * Implements RFC9728 (Protected Resource Metadata Discovery) + RFC8414 (Authorization Server Metadata Discovery)
 */
export async function discoverMcpMetadata(
    mcpServerUrl: string,
    logCtx?: LogContext | LogContextStateless
): Promise<{ success: boolean; metadata?: OAuthMetadata; resourceMetadata?: OAuthProtectedResourceMetadata; scopes?: string; error?: string }> {
    try {
        // RFC9728 - Protected Resource Metadata Discovery
        let resourceMetadata: OAuthProtectedResourceMetadata | null = null;
        let authServerUrl = new URL(mcpServerUrl);

        try {
            resourceMetadata = await discoverOAuthProtectedResourceMetadata(mcpServerUrl);

            if (resourceMetadata?.authorization_servers?.length && resourceMetadata.authorization_servers[0]) {
                authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
            }
        } catch (err) {
            await logCtx?.warn?.('Resource metadata discovery failed', { error: String(err) });
        }

        // RFC8414 - Authorization Server Metadata Discovery
        const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
        if (!metadata) {
            throw new Error('Failed to discover OAuth authorization server metadata');
        }

        await logCtx?.info?.('MCP metadata discovery successful', {
            tokenEndpoint: metadata.token_endpoint,
            authEndpoint: metadata.authorization_endpoint
        });

        const discoveredScopes = discoverScopes(resourceMetadata ?? undefined, metadata);

        return {
            success: true,
            metadata,
            ...(resourceMetadata && { resourceMetadata }),
            ...(discoveredScopes && { scopes: discoveredScopes })
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logCtx?.error?.('MCP metadata discovery failed', { error: errorMessage });
        return { success: false, error: errorMessage };
    }
}

/**
 * Refresh MCP_DYNAMIC credentials using stored connectionConfig
 */
export async function refreshCredentials({
    connection,
    logCtx
}: {
    connection: DBConnectionDecrypted;
    logCtx: LogContextStateless;
}): Promise<ServiceResponse<OAuth2Credentials>> {
    const connectionConfig = connection.connection_config;
    if (!connectionConfig) {
        return { success: false, error: new NangoError('missing_connection_config'), response: null };
    }

    const metadataStr = connectionConfig['oauth_metadata'] as string;
    const clientInfoStr = connectionConfig['oauth_client_info'] as string;
    const resourceUrl = connectionConfig['oauth_resource_url'] as string;
    const mcpServerUrl = connectionConfig['mcp_server_url'] as string;

    if (!metadataStr || !clientInfoStr || !mcpServerUrl) {
        await logCtx.error('MCP_DYNAMIC connection missing OAuth metadata - legacy connections not supported', {
            hasMetadata: !!metadataStr,
            hasClientInfo: !!clientInfoStr,
            hasMcpServerUrl: !!mcpServerUrl,
            connectionConfigKeys: Object.keys(connectionConfig)
        });
        return {
            success: false,
            error: new NangoError('legacy_mcp_connection_not_supported', {
                message:
                    'This MCP_DYNAMIC connection uses legacy format and is no longer supported. Please recreate the connection using the current SDK-based flow.'
            }),
            response: null
        };
    }

    let metadata: OAuthMetadata;
    let clientInformation: OAuthClientInformation;
    try {
        metadata = OAuthMetadataSchema.parse(JSON.parse(metadataStr));
        clientInformation = OAuthClientInformationSchema.parse(JSON.parse(clientInfoStr));
    } catch (err) {
        await logCtx.error('Failed to parse/validate MCP_DYNAMIC metadata', { error: String(err) });
        return {
            success: false,
            error: new NangoError('invalid_oauth_metadata', { error: String(err) }),
            response: null
        };
    }

    // Validate current credentials
    const currentCredentials = connection.credentials as OAuth2Credentials;
    if (!currentCredentials || !currentCredentials.refresh_token) {
        return {
            success: false,
            error: new NangoError('missing_refresh_token'),
            response: null
        };
    }

    // Use simple-oauth2 with the stored metadata (since MCP tokens are standard OAuth2)
    const oauth2ClientConfig = {
        client: {
            id: clientInformation.client_id,
            secret: '' // MCP uses PKCE, no client secret needed
        },
        auth: {
            tokenHost: new URL(metadata.token_endpoint).origin,
            tokenPath: new URL(metadata.token_endpoint).pathname
        },
        http: {
            headers: { 'User-Agent': 'Nango' }
        },
        options: {
            authorizationMethod: 'body' as const,
            bodyFormat: 'form' as const
        }
    };

    const client = new AuthorizationCode(oauth2ClientConfig);

    const oldAccessToken = client.createToken({
        access_token: currentCredentials.access_token,
        refresh_token: currentCredentials.refresh_token,
        expires_at: currentCredentials.expires_at
    });

    let rawNewAccessToken: AccessToken;
    try {
        rawNewAccessToken = await oldAccessToken.refresh({
            ...(resourceUrl && { resource: resourceUrl })
        });
        await logCtx.info('MCP_DYNAMIC refresh successful');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logCtx.error('MCP_DYNAMIC refresh failed', { error: errorMessage });
        return {
            success: false,
            error: new NangoError('refresh_token_external_error', { error: errorMessage }),
            response: null
        };
    }

    const refreshedCredentials: OAuth2Credentials = {
        type: 'OAUTH2',
        access_token: rawNewAccessToken.token['access_token'] as string,
        refresh_token: (rawNewAccessToken.token['refresh_token'] as string) || currentCredentials.refresh_token,
        expires_at: rawNewAccessToken.token['expires_at'] ? new Date(rawNewAccessToken.token['expires_at'] as string) : undefined,
        raw: rawNewAccessToken.token
    };

    return { success: true, error: null, response: refreshedCredentials };
}
