import Provider, { errors } from 'oidc-provider';

import { createOAuthAdapter, OAUTH_GRANT_TTL_SECONDS } from './adapter.js';
import { allowCimdFetch, allowPublicCimdClient, CIMD_CACHE_MAX_SECONDS, CIMD_CACHE_MIN_SECONDS, CIMD_MAX_DOCUMENT_BYTES, secureCimdFetch } from './cimd.js';

import type { OAuthServerParsedConfig } from './config.js';
import type { Knex } from 'knex';
import type { Configuration, KoaContextWithOIDC, ResourceServer } from 'oidc-provider';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 60;
const INTERACTION_TTL_SECONDS = 10 * 60;

export const OAUTH_ENDPOINT_PATH = '/oauth';
export const OAUTH_AUTHORIZATION_PATH = `${OAUTH_ENDPOINT_PATH}/authorize`;
export const OAUTH_TOKEN_PATH = `${OAUTH_ENDPOINT_PATH}/token`;
export const OAUTH_REVOCATION_PATH = `${OAUTH_ENDPOINT_PATH}/revoke`;
export const OAUTH_JWKS_PATH = `${OAUTH_ENDPOINT_PATH}/jwks`;
export const OAUTH_DISCOVERY_PATH = '/.well-known/oauth-authorization-server';

export interface OAuthResourceConfig {
    resource: string;
    scopes: readonly string[];
}

export interface CreateOAuthProviderOptions {
    knex: Knex;
    config: OAuthServerParsedConfig;
    resources: readonly OAuthResourceConfig[];
    beforeGrantRevoked?: ((trx: Knex.Transaction, grantIdHash: Buffer) => Promise<void>) | undefined;
}

interface OAuthResourceRegistry {
    supportedScopes: readonly string[];
    get(resource: string): OAuthResourceConfig | undefined;
}

export function createOAuthProvider({ knex, config, resources, beforeGrantRevoked }: CreateOAuthProviderOptions): Provider {
    const registry = createResourceRegistry(resources);
    const allowedScopes = new Set(registry.supportedScopes);

    const configuration: Configuration = {
        adapter: createOAuthAdapter({ knex, encryptionKey: config.encryptionKey, beforeGrantRevoked }),
        claims: {},
        clientAuthMethods: ['none'],
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
                allowClient: (_ctx, client) => allowPublicCimdClient(client, allowedScopes),
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
                getResourceServerInfo: (ctx, resourceIndicator) => resourceServer(ctx, resourceIndicator, registry),
                useGrantedResource: () => false
            },
            revocation: { enabled: true },
            rpInitiatedLogout: { enabled: false },
            userinfo: { enabled: false }
        },
        fetch: secureCimdFetch,
        fetchResponseBodyLimits: { 'client_id metadata document': CIMD_MAX_DOCUMENT_BYTES },
        findAccount: (_ctx, accountId) => ({ accountId, claims: () => ({ sub: accountId }) }),
        formats: { bitsOfOpaqueRandomness: 256 },
        interactions: {
            url: (_ctx, interaction) => `${OAUTH_ENDPOINT_PATH}/interaction/${encodeURIComponent(interaction.uid)}`
        },
        issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
        jwks: config.jwks,
        pkce: { required: () => true },
        responseTypes: ['code'],
        // A Nango product grant spans every resource approved in the authorization. Revoking any
        // refresh or access token therefore revokes the complete provider grant as well.
        revokeGrantPolicy: () => true,
        rotateRefreshToken: (ctx) => validateRefreshResource(ctx, registry),
        routes: {
            authorization: OAUTH_AUTHORIZATION_PATH,
            jwks: OAUTH_JWKS_PATH,
            revocation: OAUTH_REVOCATION_PATH,
            token: OAUTH_TOKEN_PATH
        },
        scopes: registry.supportedScopes,
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

function createResourceRegistry(resources: readonly OAuthResourceConfig[]): OAuthResourceRegistry {
    if (resources.length === 0) {
        throw new Error('At least one OAuth resource must be configured');
    }

    const byResource = new Map<string, OAuthResourceConfig>();
    const supportedScopes = new Set<string>();
    for (const resource of resources) {
        validateResourceConfig(resource);
        if (byResource.has(resource.resource)) {
            throw new Error(`OAuth resource is configured more than once: ${resource.resource}`);
        }
        byResource.set(resource.resource, resource);
        for (const scope of resource.scopes) supportedScopes.add(scope);
    }

    return {
        supportedScopes: [...supportedScopes],
        get: (resource) => byResource.get(resource)
    };
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

function validateRefreshResource(ctx: KoaContextWithOIDC, registry: OAuthResourceRegistry): true {
    const requestedResource = ctx.oidc.params?.['resource'];
    if (typeof requestedResource !== 'string') {
        throw new errors.InvalidTarget('Exactly one resource parameter is required');
    }
    if (!registry.get(requestedResource)) {
        throw new errors.InvalidTarget('The requested resource is not supported');
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

function resourceServer(ctx: KoaContextWithOIDC, resourceIndicator: string, registry: OAuthResourceRegistry): ResourceServer {
    const requestedResource = ctx.oidc.params?.['resource'];
    const requested = Array.isArray(requestedResource) ? requestedResource : requestedResource ? [requestedResource] : [];
    if (!requested.includes(resourceIndicator)) {
        throw new errors.InvalidTarget('The resource parameter is required');
    }

    const resource = registry.get(resourceIndicator);
    if (!resource) {
        throw new errors.InvalidTarget('The requested resource is not supported');
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
