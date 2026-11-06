import Provider, { errors, interactionPolicy } from 'oidc-provider';

import { createOAuthAdapter, OAUTH_GRANT_TTL_SECONDS } from './adapter.js';
import { allowCimdFetch, allowPublicCimdClient, CIMD_CACHE_MAX_SECONDS, CIMD_CACHE_MIN_SECONDS, CIMD_MAX_DOCUMENT_BYTES, secureCimdFetch } from './cimd.js';

import type { OAuthServerParsedConfig } from './config.js';
import type { Knex } from 'knex';
import type { Client, Configuration, KoaContextWithOIDC, ResourceServer } from 'oidc-provider';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 60;
const INTERACTION_TTL_SECONDS = 10 * 60;
const CLAUDE_CODE_CLIENT_ID = 'https://claude.ai/oauth/claude-code-client-metadata';
const CLAUDE_CODE_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export const OAUTH_ENDPOINT_PATH = '/oauth';
export const OAUTH_AUTHORIZATION_PATH = `${OAUTH_ENDPOINT_PATH}/authorize`;
export const OAUTH_TOKEN_PATH = `${OAUTH_ENDPOINT_PATH}/token`;
export const OAUTH_REVOCATION_PATH = `${OAUTH_ENDPOINT_PATH}/revoke`;
export const OAUTH_JWKS_PATH = `${OAUTH_ENDPOINT_PATH}/jwks`;
export const OAUTH_SESSION_END_PATH = `${OAUTH_ENDPOINT_PATH}/session/end`;
export const OAUTH_SESSION_END_CONFIRM_PATH = `${OAUTH_SESSION_END_PATH}/confirm`;
export const OAUTH_DISCOVERY_PATH = '/.well-known/oauth-authorization-server';

export interface OAuthResourceConfig {
    resource: string;
    scopes: readonly string[];
}

export interface CreateOAuthProviderOptions {
    knex: Knex;
    config: OAuthServerParsedConfig;
    resource: OAuthResourceConfig;
    userExists: (userId: string) => boolean | Promise<boolean>;
    // The consent page may be hosted separately from the OAuth endpoints.
    interactionUrl: (uid: string) => string;
}

export function createOAuthProvider({ knex, config, resource, userExists, interactionUrl }: CreateOAuthProviderOptions): Provider {
    validateResourceConfig(resource);
    const allowedScopes = new Set(resource.scopes);
    const authorizationPolicy = requireDashboardAuthentication();

    const configuration: Configuration = {
        adapter: createOAuthAdapter({ knex, encryptionKey: config.encryptionKey }),
        claims: {},
        clientAuthMethods: ['none'],
        clientDefaults: { application_type: 'web' },
        clients: [],
        cookies: {
            keys: config.cookieKeys,
            names: {
                session: 'nango_oauth_session',
                interaction: 'nango_oauth_interaction',
                resume: 'nango_oauth_resume'
            },
            long: { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https:'), path: OAUTH_ENDPOINT_PATH },
            short: { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https:'), path: OAUTH_ENDPOINT_PATH }
        },
        features: {
            backchannelLogout: { enabled: false },
            clientIdMetadataDocument: {
                enabled: true,
                ack: 'draft-02',
                // oidc-provider 9.12 keeps a bounded, per-provider LRU with a logical capacity of 100 and coalesces concurrent fetches.
                allowFetch: async (_ctx, clientId) => await allowCimdFetch(clientId),
                allowClient: (_ctx, client) => allowCimdClient(client, allowedScopes),
                cacheDuration: { min: CIMD_CACHE_MIN_SECONDS, max: CIMD_CACHE_MAX_SECONDS }
            },
            devInteractions: { enabled: false },
            dPoP: { enabled: false },
            pushedAuthorizationRequests: { enabled: false },
            registration: { enabled: false },
            registrationManagement: { enabled: false },
            resourceIndicators: {
                enabled: true,
                defaultResource: () => {
                    throw new errors.InvalidTarget('The resource parameter is required');
                },
                getResourceServerInfo: (ctx, resourceIndicator) => resourceServer(ctx, resourceIndicator, resource),
                useGrantedResource: () => false
            },
            revocation: {
                enabled: true,
                // oidc-provider calls this for POST /oauth/revoke after authenticating the
                // client and finding the submitted token. In practice, the client is the MCP
                // application asking to disconnect, and the token is the access or refresh
                // credential Nango previously issued to that application. Public clients have
                // no secret, so one application may revoke only its own tokens.
                allowedPolicy: (_ctx, client, token) => token.clientId === client.clientId
            },
            rpMetadataChoices: { enabled: true },
            rpInitiatedLogout: { enabled: false },
            userinfo: { enabled: false }
        },
        fetch: secureCimdFetch,
        fetchResponseBodyLimits: { 'client_id metadata document': CIMD_MAX_DOCUMENT_BYTES },
        findAccount: async (_ctx, accountId) => {
            // oidc-provider calls its authenticated principal an account; Nango uses a user id.
            if (!(await userExists(accountId))) {
                return undefined;
            }
            return { accountId, claims: () => ({ sub: accountId }) };
        },
        formats: { bitsOfOpaqueRandomness: 256 },
        interactions: {
            policy: authorizationPolicy,
            url: (_ctx, interaction) => interactionUrl(interaction.uid)
        },
        issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
        jwks: config.jwks,
        pkce: { required: () => true },
        responseTypes: ['code'],
        revokeGrantPolicy: () => true,
        rotateRefreshToken: (ctx) => validateRefreshResource(ctx, resource),
        routes: {
            authorization: OAUTH_AUTHORIZATION_PATH,
            end_session: OAUTH_SESSION_END_PATH,
            jwks: OAUTH_JWKS_PATH,
            revocation: OAUTH_REVOCATION_PATH,
            token: OAUTH_TOKEN_PATH
        },
        scopes: resource.scopes,
        sectorIdentifierUriValidate: () => false,
        ttl: {
            AccessToken: ACCESS_TOKEN_TTL_SECONDS,
            AuthorizationCode: AUTHORIZATION_CODE_TTL_SECONDS,
            Grant: OAUTH_GRANT_TTL_SECONDS,
            Interaction: INTERACTION_TTL_SECONDS,
            RefreshToken: OAUTH_GRANT_TTL_SECONDS,
            Session: OAUTH_GRANT_TTL_SECONDS
        }
    };

    const provider = new Provider(config.baseUrl, configuration);
    provider.proxy = true;
    installOAuthOnlyMiddleware(provider);
    return provider;
}

function allowCimdClient(client: Client, allowedScopes: ReadonlySet<string>): boolean {
    if (!allowPublicCimdClient(client, allowedScopes)) return false;

    if (client.clientId === CLAUDE_CODE_CLIENT_ID && client.applicationType !== 'native') {
        // Claude Code's metadata omits application_type and registers portless loopback callbacks,
        // but the CLI selects an ephemeral callback port. Keep the standards-compliant `web`
        // default for every other client and remove this carve-out when Anthropic fixes:
        // https://github.com/anthropics/claude-code/issues/37747
        allowClaudeCodeLoopbackPort(client);
    }
    return true;
}

function allowClaudeCodeLoopbackPort(client: Client): void {
    const standardRedirectUriAllowed = client.redirectUriAllowed.bind(client);
    client.redirectUriAllowed = (redirectUri) =>
        standardRedirectUriAllowed(redirectUri) ||
        (client.redirectUris ?? []).some((registeredRedirectUri) => sameClaudeCodeLoopbackRedirectExceptPort(redirectUri, registeredRedirectUri));
}

function sameClaudeCodeLoopbackRedirectExceptPort(requestedValue: string, registeredValue: string): boolean {
    let requested: URL;
    let registered: URL;
    try {
        requested = new URL(requestedValue);
        registered = new URL(registeredValue);
    } catch {
        return false;
    }

    return (
        requested.protocol === 'http:' &&
        registered.protocol === 'http:' &&
        CLAUDE_CODE_LOOPBACK_HOSTS.has(requested.hostname) &&
        requested.hostname === registered.hostname &&
        requested.port !== '' &&
        registered.port === '' &&
        requested.username === '' &&
        requested.password === '' &&
        requested.pathname === registered.pathname &&
        requested.search === registered.search &&
        requested.hash === '' &&
        registered.hash === ''
    );
}

function requireDashboardAuthentication(): interactionPolicy.DefaultPolicy {
    const policy = interactionPolicy.base();
    const loginPrompt = policy.get('login');
    const consentPrompt = policy.get('consent');
    if (!loginPrompt || !consentPrompt) {
        throw new Error('OAuth interaction policy is unavailable');
    }

    loginPrompt.checks.add(
        new interactionPolicy.Check('dashboard_session', 'A current Nango dashboard session is required', (ctx) => {
            // Every authorization request must return to Nango so the interaction
            // controller can verify the current dashboard session. A completed login
            // result means that check already happened for this authorization request.
            return ctx.oidc.result?.login ? interactionPolicy.Check.NO_NEED_TO_PROMPT : interactionPolicy.Check.REQUEST_PROMPT;
        })
    );
    // oidc-provider normally asks native clients to consent on every authorization.
    // Nango can safely reuse an unchanged grant because the login prompt above still
    // revalidates the current dashboard user before any authorization code is issued.
    consentPrompt.checks.remove('native_client_prompt');
    return policy;
}

function installOAuthOnlyMiddleware(provider: Provider): void {
    provider.use(async (ctx, next) => {
        const requestedScope = ctx.query['scope'];
        if (typeof requestedScope === 'string' && requestedScope.split(' ').some((scope) => scope === 'openid' || scope === 'offline_access')) {
            ctx.status = 400;
            ctx.body = {
                error: 'invalid_scope',
                error_description: 'OpenID Connect scopes are not supported'
            };
            return;
        }

        await next();

        if (ctx.status !== 200 || !ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) {
            return;
        }

        const body = ctx.body as Record<string, unknown>;
        if (body['issuer'] !== provider.issuer || !Array.isArray(body['scopes_supported'])) {
            return;
        }

        body['authorization_endpoint'] = provider.urlFor('authorization');
        body['token_endpoint'] = provider.urlFor('token');
        body['revocation_endpoint'] = provider.urlFor('revocation');
        body['jwks_uri'] = provider.urlFor('jwks');
        body['scopes_supported'] = body['scopes_supported'].filter((scope) => scope !== 'openid' && scope !== 'offline_access');
        delete body['claims_parameter_supported'];
        delete body['claims_supported'];
        delete body['claim_types_supported'];
        delete body['id_token_signing_alg_values_supported'];
        delete body['subject_types_supported'];
    });
}

function validateRefreshResource(ctx: KoaContextWithOIDC, resource: OAuthResourceConfig): true {
    const requestedResource = ctx.oidc.params?.['resource'];
    if (requestedResource !== resource.resource) {
        throw new errors.InvalidTarget('Exactly one resource parameter is required');
    }

    const refreshToken = ctx.oidc.entities.RefreshToken;
    const grant = ctx.oidc.entities.Grant;
    if (!refreshToken || !grant) {
        throw new Error('Refresh token resource validation ran before the token and grant were loaded');
    }
    if (!refreshToken.resourceIndicators.has(requestedResource) || !grant.getResourceScope(requestedResource)) {
        throw new errors.InvalidTarget('The requested resource was not granted');
    }
    return true;
}

function resourceServer(ctx: KoaContextWithOIDC, resourceIndicator: string, resource: OAuthResourceConfig): ResourceServer {
    const requestedResource = ctx.oidc.params?.['resource'];
    const requested = Array.isArray(requestedResource) ? requestedResource : requestedResource ? [requestedResource] : [];
    if (requested.length !== 1 || requested[0] !== resource.resource || resourceIndicator !== resource.resource) {
        throw new errors.InvalidTarget('Exactly one supported resource parameter is required');
    }
    return {
        scope: resource.scopes.join(' '),
        audience: resource.resource,
        accessTokenFormat: 'opaque',
        accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS
    };
}

function validateResourceConfig(resource: OAuthResourceConfig): void {
    let parsed: URL;
    try {
        parsed = new URL(resource.resource);
    } catch {
        throw new Error(`OAuth resource must be an absolute URL: ${resource.resource}`);
    }
    if (parsed.hash || parsed.href !== resource.resource) {
        throw new Error(`OAuth resource must be a canonical absolute URL without a fragment: ${resource.resource}`);
    }
    validateScopes(resource.scopes, `OAuth resource ${resource.resource}`);
}

function validateScopes(scopes: readonly string[], owner: string): void {
    if (scopes.length === 0 || scopes.some((scope) => scope.length === 0 || /\s/.test(scope))) {
        throw new Error(`${owner} must define non-empty OAuth scopes without whitespace`);
    }
    if (new Set(scopes).size !== scopes.length) {
        throw new Error(`${owner} must not define duplicate OAuth scopes`);
    }
}
