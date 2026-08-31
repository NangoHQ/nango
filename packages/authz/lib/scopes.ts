import type { AccountApiKeyScope, ApiKeyScope, ConcreteAccountApiKeyScope, ConcreteApiKeyScope, WildcardsFor } from '@nangohq/types';

/**
 * Scopes issuable in environment API keys.
 */
export const PUBLIC_ENVIRONMENT_SCOPES = [
    // Integrations
    'environment:integrations:list',
    'environment:integrations:list_credentials',
    'environment:integrations:list_functions',
    'environment:integrations:read',
    'environment:integrations:read_credentials',
    'environment:integrations:create',
    'environment:integrations:update',
    'environment:integrations:delete',
    // Connections
    'environment:connections:list',
    'environment:connections:list_credentials',
    'environment:connections:read',
    'environment:connections:read_credentials',
    'environment:connections:create',
    'environment:connections:update',
    'environment:connections:delete',
    // Connect Sessions
    'environment:connect_sessions:write',
    // Agent Sessions
    'environment:agent_sessions:write',
    // Syncs
    'environment:syncs:read',
    'environment:syncs:execute',
    'environment:syncs:update',
    'environment:syncs:variant:create',
    'environment:syncs:variant:delete',
    // Functions
    'environment:functions:list',
    'environment:functions:read',
    'environment:functions:delete',
    'environment:functions:compile',
    'environment:functions:dryrun',
    'environment:functions:invocations',
    // Deploy
    'environment:deploy',
    // Records
    'environment:records:read',
    'environment:records:write',
    // Logs
    'environment:logs:read',
    // Actions
    'environment:actions:execute',
    // Proxy
    'environment:proxy',
    // Variables
    'environment:variables:read',
    // Webhooks
    'environment:webhook_signing_key:rotate',
    // MCP
    'environment:mcp'
] as const satisfies readonly ApiKeyScope[];

// Every concrete `ApiKeyScope` appears above.
true satisfies [Exclude<ConcreteApiKeyScope, (typeof PUBLIC_ENVIRONMENT_SCOPES)[number]>] extends [never] ? true : never;

/**
 * Scopes issuable in account API keys.
 */
export const PUBLIC_ACCOUNT_SCOPES = [
    // Environments
    'account:environments:create', // any environment
    'account:environments:delete',
    'account:environments:set_production',
    'account:environments:api_keys:create',
    'account:environments:api_keys:delete'
] as const satisfies readonly AccountApiKeyScope[];

true satisfies [Exclude<ConcreteAccountApiKeyScope, (typeof PUBLIC_ACCOUNT_SCOPES)[number]>] extends [never] ? true : never;

/**
 * Scopes that can't be issued to API keys. These only apply to roles.
 * When adding a public endpoint that requires one of these, move the scope to the public list. The time of moving is also
 * a good moment to reconsider its name.
 * Wildcards in API keys (eg. `environment:*`, `account:*`) don't expand to these. When moved to the public list, wildcard keys will start covering it.
 * Some scopes only make sense in roles (therefore in this list), like `environment:settings:read_secret` (environment keys shouldn't be able to read an environment keys secrets)
 */
export const PRIVATE_SCOPES = [
    // ── account namespace ──
    'account:team:update',
    'account:team:users:update',
    'account:team:users:delete',
    'account:invites:create',
    'account:invites:delete',
    'account:connect_ui:update',
    'account:billing:payment_methods:list',
    'account:billing:payment_methods:create',
    'account:billing:payment_methods:delete',
    'account:billing:spend_alert:read',
    'account:billing:spend_alert:update',
    'account:plan:update',
    'account:audit_trail:read',
    'account:api_keys:list',

    // ── environment namespace ──
    'environment:api_keys:list',
    'environment:api_keys:create',
    'environment:api_keys:update',
    'environment:api_keys:delete',
    'environment:settings:read',
    'environment:settings:update',
    'environment:variables:update',
    'environment:webhooks:update',

    // ── Don't promote ──
    // Issuing account keys from an account key is self-perpetuating.
    'account:api_keys:create',
    'account:api_keys:delete',
    // `environment:*` is the default on every key, so this would hand environment destruction to all of them.
    // The account-level equivalent is `account:environments:delete`.
    'environment:delete',
    // Hand back a credential stronger than the caller's, so whoever holds one could widen themselves.
    'environment:settings:read_secret'
] as const;

export type PrivateScope = (typeof PRIVATE_SCOPES)[number];

/** A scope a customer credential may hold. */
export type IssuableScope = (typeof PUBLIC_ENVIRONMENT_SCOPES)[number] | (typeof PUBLIC_ACCOUNT_SCOPES)[number];

/** One concrete scope, the kind a route requires. */
export type Scope = IssuableScope | PrivateScope;

/** A pattern matching many scopes in one namespace */
export type ScopeWildcard = WildcardsFor<'environment'> | WildcardsFor<'account'>;

/** One scope, or a pattern matching many. */
export type ScopeSelector = Scope | ScopeWildcard;

/** The concrete scopes a credential ends up holding, once wildcards are expanded. */
export const ISSUABLE_SCOPES: readonly IssuableScope[] = [...PUBLIC_ENVIRONMENT_SCOPES, ...PUBLIC_ACCOUNT_SCOPES];

const ISSUABLE = new Set<string>(ISSUABLE_SCOPES);

export function isIssuable(scope: Scope): scope is IssuableScope {
    return ISSUABLE.has(scope);
}

/**
 * The concrete issuable scopes matching `granted`
 */
export function expandIssuable(granted: readonly ScopeSelector[]): IssuableScope[] {
    return ISSUABLE_SCOPES.filter((scope) =>
        granted.some((selector) => selector === scope || (selector.endsWith(':*') && scope.startsWith(selector.slice(0, -1))))
    );
}

/**
 * Whether a string may appear in a key's `scopes` field: a public scope, or a wildcard over some.
 */
function isPublicSelector(value: unknown, namespace: 'environment:' | 'account:'): boolean {
    if (typeof value !== 'string' || !value.startsWith(namespace)) {
        return false;
    }
    if ((ISSUABLE_SCOPES as readonly string[]).includes(value)) {
        return true;
    }
    return value.endsWith(':*') && ISSUABLE_SCOPES.some((scope) => scope.startsWith(value.slice(0, -1)));
}

export function isEnvironmentScopeSelector(value: unknown): value is ApiKeyScope {
    return isPublicSelector(value, 'environment:');
}

export function isAccountScopeSelector(value: unknown): value is AccountApiKeyScope {
    return isPublicSelector(value, 'account:');
}
