/** Every wildcard in a namespace: `environment:*`, `environment:connections:*`, … */
export type WildcardsFor<Namespace extends string> = `${Namespace}:*` | `${Namespace}:${string}:*`;

export const API_KEY_SCOPES = [
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
] as const;

export type ConcreteApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** A scope, or a wildcard over scopes. Which wildcards resolve to something is checked at runtime. */
export type ApiKeyScope = ConcreteApiKeyScope | WildcardsFor<'environment'>;

export const ACCOUNT_API_KEY_SCOPES = [
    // Environments
    'account:environments:list',
    'account:environments:create',
    'account:environments:delete',
    'account:environments:set_production',
    'account:environments:api_keys:list',
    'account:environments:api_keys:read',
    'account:environments:api_keys:create',
    'account:environments:api_keys:delete'
] as const;

export type ConcreteAccountApiKeyScope = (typeof ACCOUNT_API_KEY_SCOPES)[number];

export type AccountApiKeyScope = ConcreteAccountApiKeyScope | WildcardsFor<'account'>;

export type CustomerKeyScope = ApiKeyScope | AccountApiKeyScope;
