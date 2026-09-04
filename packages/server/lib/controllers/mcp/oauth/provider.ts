import { errors, interactionPolicy, Provider } from 'oidc-provider';

import { assertSafeOAuthUrl, userService } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';

import { ManagementMcpOAuthAdapter } from './adapter.js';
import { getManagementMcpOAuthConfig, isManagementMcpOAuthEnabled, MANAGEMENT_MCP_OAUTH_SCOPE } from './config.js';
import { revokeManagementMcpOAuthGrant } from './grant.js';

import type { Client, ClientMetadata, Configuration } from 'oidc-provider';

const logger = getLogger('Server.ManagementMcpOAuth.Provider');
let provider: Provider | null | undefined;

export function getManagementMcpOAuthProvider(): Provider | null {
    if (provider !== undefined) {
        return provider;
    }
    if (!isManagementMcpOAuthEnabled()) {
        provider = null;
        return provider;
    }

    const config = getManagementMcpOAuthConfig();
    const configuration: Configuration = {
        adapter: (model) => new ManagementMcpOAuthAdapter(model, config.storageKey),
        claims: {},
        clientAuthMethods: ['none'],
        clientDefaults: {
            application_type: 'native',
            grant_types: ['authorization_code', 'refresh_token'],
            id_token_signed_response_alg: 'ES256',
            response_types: ['code'],
            token_endpoint_auth_method: 'none'
        },
        cookies: {
            keys: config.cookieKeys,
            names: {
                session: '_nango_mcp_oauth_session',
                interaction: '_nango_mcp_oauth_interaction',
                resume: '_nango_mcp_oauth_resume',
                state: '_nango_mcp_oauth_state'
            },
            long: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, signed: true, path: '/' },
            short: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, signed: true, path: '/' }
        },
        features: {
            devInteractions: { enabled: false },
            clientIdMetadataDocument: {
                enabled: true,
                ack: 'draft-01',
                allowFetch: async (_ctx: unknown, clientId: string) => {
                    try {
                        await assertSafeOAuthUrl(clientId);
                        return true;
                    } catch {
                        recordOAuthEvent('cimd_metadata_fetch', 'failure');
                        return false;
                    }
                },
                allowClient: (_ctx: unknown, client: Client) => {
                    try {
                        validateRegisteredClient(client.metadata());
                        recordOAuthEvent('cimd_client_resolved', 'success');
                        return true;
                    } catch {
                        recordOAuthEvent('cimd_client_resolved', 'failure');
                        return false;
                    }
                },
                cacheDuration: { min: 30, max: 60 * 60 }
            },
            registration: {
                enabled: true,
                initialAccessToken: false,
                issueRegistrationAccessToken: false
            },
            registrationManagement: { enabled: false },
            resourceIndicators: {
                enabled: true,
                getResourceServerInfo: (_, resource) => {
                    if (resource !== config.resource) {
                        throw new errors.InvalidTarget('Only the management MCP resource is supported');
                    }
                    return {
                        scope: MANAGEMENT_MCP_OAUTH_SCOPE,
                        audience: config.resource,
                        accessTokenFormat: 'opaque',
                        accessTokenTTL: 60 * 60
                    };
                },
                defaultResource: (_, __, oneOf) => {
                    if (oneOf?.includes(config.resource)) {
                        return config.resource;
                    }
                    throw new errors.InvalidTarget('The management MCP resource parameter is required');
                },
                useGrantedResource: () => true
            },
            revocation: {
                enabled: true,
                allowedPolicy: (_, client, token) => token.clientId === client.clientId
            },
            userinfo: { enabled: false },
            introspection: { enabled: false },
            clientCredentials: { enabled: false },
            deviceFlow: { enabled: false },
            pushedAuthorizationRequests: { enabled: false },
            rpInitiatedLogout: { enabled: false },
            dPoP: { enabled: false },
            requestObjects: { enabled: false },
            claimsParameter: { enabled: false }
        } as NonNullable<Configuration['features']> & {
            clientIdMetadataDocument: {
                enabled: boolean;
                ack: string;
                allowFetch: (ctx: unknown, clientId: string) => Promise<boolean>;
                allowClient: (ctx: unknown, client: Client) => boolean | Promise<boolean>;
                cacheDuration: { min: number; max: number };
            };
        },
        enabledJWA: { idTokenSigningAlgValues: ['ES256'] },
        expiresWithSession: () => false,
        findAccount: async (_, subject) => {
            const userId = Number(subject);
            if (!Number.isSafeInteger(userId)) {
                return undefined;
            }
            const user = await userService.getUserById(userId);
            if (!user) {
                return undefined;
            }
            return {
                accountId: subject,
                claims: () => ({ sub: subject })
            };
        },
        formats: { bitsOfOpaqueRandomness: 256 },
        interactions: {
            policy: getCombinedInteractionPolicy(),
            url: (_, interaction) => {
                const url = new URL(config.interactionUrl);
                url.searchParams.set('interaction', interaction.uid);
                return url.toString();
            }
        },
        issueRefreshToken: (_, client) => client.grantTypeAllowed('refresh_token'),
        jwks: config.jwks,
        pkce: { required: () => true },
        responseTypes: ['code'],
        revokeGrantPolicy: () => true,
        rotateRefreshToken: true,
        scopes: [MANAGEMENT_MCP_OAUTH_SCOPE],
        routes: {
            authorization: '/authorize',
            jwks: '/jwks',
            registration: '/register',
            revocation: '/revoke',
            token: '/token'
        },
        subjectTypes: ['public'],
        ttl: {
            AccessToken: 60 * 60,
            AuthorizationCode: 60,
            Grant: 30 * 24 * 60 * 60,
            Interaction: 10 * 60,
            RefreshToken: 30 * 24 * 60 * 60,
            Session: 30 * 24 * 60 * 60
        }
    };

    provider = new Provider(config.issuer, configuration);
    provider.use(async (ctx, next) => {
        await next();
        if (ctx['oidc']?.route !== 'registration' || ctx.method !== 'POST' || ctx.status !== 201) {
            return;
        }

        const client = ctx['oidc'].entities.Client;
        if (!client) {
            return;
        }
        try {
            validateRegisteredClient(client.metadata());
        } catch (err) {
            await new ManagementMcpOAuthAdapter('Client', config.storageKey).destroy(client.clientId);
            ctx.status = 400;
            ctx.body = {
                error: 'invalid_client_metadata',
                error_description: err instanceof Error ? err.message : 'Invalid client metadata'
            };
        }
    });

    provider.on('grant.revoked', (_, grantId) => {
        recordOAuthEvent('grant_revoked', 'success');
        void revokeManagementMcpOAuthGrant(grantId).catch((err) => logger.error('Failed to mark an OAuth grant revoked', { err, grantId }));
    });
    provider.on('registration_create.success', (_, client) => {
        recordOAuthEvent('client_registered', 'success', { clientId: client.clientId });
    });
    provider.on('registration_create.error', (_, err) => {
        recordOAuthEvent('client_registered', 'failure', { error: err.name });
    });
    provider.on('interaction.started', (ctx, prompt) => {
        recordOAuthEvent('interaction_started', 'success', { clientId: ctx.oidc.client?.clientId, prompt: prompt.name });
    });
    provider.on('authorization.success', (ctx) => {
        recordOAuthEvent('authorization', 'success', { clientId: ctx.oidc.client?.clientId });
    });
    provider.on('authorization.error', (ctx, err) => {
        recordOAuthEvent('authorization', 'failure', { clientId: ctx.oidc.client?.clientId, error: err.name });
    });
    provider.on('grant.success', (ctx) => {
        const grantType = ctx.oidc.params?.['grant_type'];
        recordOAuthEvent(grantType === 'refresh_token' ? 'token_refreshed' : 'token_issued', 'success', {
            clientId: ctx.oidc.client?.clientId
        });
    });
    provider.on('server_error', (_, err) => {
        recordOAuthEvent('server_error', 'failure', { error: err.name });
        logger.error('oidc-provider request failed', { error: err.name, message: err.message });
    });

    return provider;
}

function recordOAuthEvent(event: string, outcome: 'success' | 'failure', details: Record<string, string | undefined> = {}): void {
    const safeDetails = Object.fromEntries(Object.entries(details).filter((entry): entry is [string, string] => entry[1] !== undefined));
    metrics.increment(metrics.Types.MCP_OAUTH_EVENT, 1, { event, outcome });
    logger.info('Management MCP OAuth event', { event, outcome, ...safeDetails });
}

function getCombinedInteractionPolicy(): interactionPolicy.DefaultPolicy {
    const policy = interactionPolicy.base();
    const login = policy.get('login');
    const consent = policy.get('consent');
    if (!login || !consent) {
        throw new Error('oidc-provider default login and consent policies are required');
    }
    for (const check of consent.checks) {
        // Existing Nango grants are reusable; initial resource-scope checks still require consent.
        if (check.reason === 'native_client_prompt') {
            continue;
        }
        login.checks.add(
            new interactionPolicy.Check(
                check.reason,
                check.description,
                check.error,
                async (ctx) => (ctx['oidc'].entities.Grant ? await check.check(ctx) : interactionPolicy.Check.NO_NEED_TO_PROMPT),
                check.details
            )
        );
    }
    policy.remove('consent');
    return policy;
}

function validateRegisteredClient(metadata: ClientMetadata): void {
    const serialized = JSON.stringify(metadata);
    if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) {
        throw new errors.InvalidClientMetadata('Client metadata is too large');
    }
    if (metadata.token_endpoint_auth_method !== 'none') {
        throw new errors.InvalidClientMetadata('Only public clients are supported');
    }
    if (!sameMembers(metadata.grant_types ?? [], ['authorization_code', 'refresh_token'])) {
        throw new errors.InvalidClientMetadata('Only authorization_code and refresh_token grants are supported');
    }
    if (!sameMembers(metadata.response_types ?? [], ['code'])) {
        throw new errors.InvalidClientMetadata('Only the code response type is supported');
    }
    if (!metadata.redirect_uris || metadata.redirect_uris.length === 0 || metadata.redirect_uris.length > 10) {
        throw new errors.InvalidClientMetadata('Between one and ten redirect URIs are required');
    }
    for (const redirect of metadata.redirect_uris) {
        assertSafeRedirectUri(redirect);
    }
}

function assertSafeRedirectUri(value: string): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new errors.InvalidRedirectUri('Redirect URI is invalid');
    }
    if (url.username || url.password || url.hash) {
        throw new errors.InvalidRedirectUri('Redirect URI cannot include credentials or a fragment');
    }
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
        throw new errors.InvalidRedirectUri('Redirect URI must use HTTPS or loopback HTTP');
    }
}

function sameMembers(actual: string[], expected: string[]): boolean {
    return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

export function resetManagementMcpOAuthProviderForTests(): void {
    provider = undefined;
}
