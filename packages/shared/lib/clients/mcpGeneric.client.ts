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
 * Validates MCP server URL to prevent SSRF attacks
 * - Must use HTTPS protocol
 * - Cannot be localhost or private IP addresses
 * - Cannot be IP addresses (must be domain names)
 * @throws {Error} if validation fails
 */
function validateMcpServerUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid MCP server URL format');
    }

    // Must use HTTPS
    if (parsed.protocol !== 'https:') {
        throw new Error('MCP server URL must use HTTPS protocol');
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variations
    const localhostPatterns = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    if (localhostPatterns.some((pattern) => hostname === pattern || hostname.startsWith(pattern + '.'))) {
        throw new Error('MCP server URL cannot be localhost');
    }

    // Block IP addresses (both IPv4 and IPv6)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
    if (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname)) {
        throw new Error('MCP server URL cannot be an IP address, must be a domain name');
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    if (ipv4Pattern.test(hostname)) {
        const octets = hostname.split('.').map(Number);
        const octet0 = octets[0];
        const octet1 = octets[1];
        if (octet0 === 10 || (octet0 === 172 && octet1 !== undefined && octet1 >= 16 && octet1 <= 31) || (octet0 === 192 && octet1 === 168)) {
            throw new Error('MCP server URL cannot be a private IP address');
        }
    }

    // Block link-local addresses
    if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
        throw new Error('MCP server URL cannot be a link-local address');
    }
}

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
 * MCP Generic OAuth metadata discovery utility
 * Implements RFC9728 (Protected Resource Metadata Discovery) + RFC8414 (Authorization Server Metadata Discovery)
 */
export async function discoverMcpMetadata(
    mcpServerUrl: string,
    logCtx: LogContext
): Promise<{ success: boolean; metadata?: OAuthMetadata; resourceMetadata?: OAuthProtectedResourceMetadata; scopes?: string; error?: string }> {
    try {
        // Validate MCP server URL for security
        validateMcpServerUrl(mcpServerUrl);

        // RFC9728 - Protected Resource Metadata Discovery
        let resourceMetadata: OAuthProtectedResourceMetadata | null = null;
        let authServerUrl = new URL(mcpServerUrl);

        try {
            resourceMetadata = await discoverOAuthProtectedResourceMetadata(mcpServerUrl);

            if (resourceMetadata?.authorization_servers?.length && resourceMetadata.authorization_servers[0]) {
                authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
            }
        } catch {
            // RFC9728 resource metadata discovery is optional - if it fails,
            // we continue with the original MCP server URL as the authorization server
        }

        // RFC8414 - Authorization Server Metadata Discovery
        const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
        if (!metadata) {
            throw new Error('Failed to discover OAuth authorization server metadata');
        }

        // Validate discovered OAuth endpoints for security
        const endpointsToValidate = [
            { name: 'authorization_endpoint', url: metadata.authorization_endpoint },
            { name: 'token_endpoint', url: metadata.token_endpoint }
        ];

        // Also validate resource server endpoints if present
        if (resourceMetadata?.authorization_servers) {
            resourceMetadata.authorization_servers.forEach((server: string, index: number) => {
                endpointsToValidate.push({ name: `authorization_server_${index}`, url: server });
            });
        }

        for (const endpoint of endpointsToValidate) {
            if (endpoint.url) {
                try {
                    validateMcpServerUrl(endpoint.url);
                } catch (err) {
                    const errorMsg = `Discovered ${endpoint.name} failed security validation: ${err instanceof Error ? err.message : String(err)}`;
                    void logCtx.error(errorMsg, { endpoint: endpoint.name, url: endpoint.url });
                    throw new Error(errorMsg);
                }
            }
        }

        void logCtx.info('MCP metadata discovery successful', {
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
        void logCtx.error('MCP metadata discovery failed', { error: errorMessage });
        return { success: false, error: errorMessage };
    }
}

/**
 * Refresh MCP_OAUTH2_GENERIC credentials using stored connectionConfig
 */
export async function refreshMcpGenericCredentials({
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
        return {
            success: false,
            error: new NangoError('missing_oauth_metadata', {
                message: 'MCP_OAUTH2_GENERIC connection is missing required OAuth metadata. Please check the connection configuration.'
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
        void logCtx.error('Failed to parse/validate MCP_OAUTH2_GENERIC metadata', { error: String(err) });
        return {
            success: false,
            error: new NangoError('invalid_oauth_metadata', { error: String(err) }),
            response: null
        };
    }

    // Validate stored token endpoint for security
    if (metadata.token_endpoint) {
        try {
            validateMcpServerUrl(metadata.token_endpoint);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            void logCtx.error('Stored token_endpoint failed security validation', {
                error: errorMessage,
                endpoint: metadata.token_endpoint
            });
            return {
                success: false,
                error: new NangoError('invalid_token_endpoint', {
                    message: `Token endpoint security validation failed: ${errorMessage}`
                }),
                response: null
            };
        }
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
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
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
