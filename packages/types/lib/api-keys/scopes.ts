// Scopes are split by plane. The prefix is the plane tag, and `hasScope`'s prefix matching keeps the
// two families isolated: `environment:*` never matches `account:...` and vice versa. Keep them apart
// so an environment key can never be granted an account capability.
export const ENVIRONMENT_API_KEY_SCOPES = [
    'environment:*',
    // Integrations
    'environment:integrations:list',
    'environment:integrations:list_credentials',
    'environment:integrations:list_functions',
    'environment:integrations:read',
    'environment:integrations:read_credentials',
    'environment:integrations:create',
    'environment:integrations:update',
    'environment:integrations:delete',
    'environment:integrations:*',
    // Connections
    'environment:connections:list',
    'environment:connections:list_credentials',
    'environment:connections:read',
    'environment:connections:read_credentials',
    'environment:connections:create',
    'environment:connections:update',
    'environment:connections:delete',
    'environment:connections:*',
    // Connect Sessions
    'environment:connect_sessions:write',
    // Syncs
    'environment:syncs:read',
    'environment:syncs:execute',
    'environment:syncs:update',
    'environment:syncs:variant:create',
    'environment:syncs:variant:delete',
    'environment:syncs:*',
    // Functions
    'environment:functions:list',
    'environment:functions:read',
    'environment:functions:delete',
    'environment:functions:compile',
    'environment:functions:dryrun',
    'environment:functions:*',
    // Deploy
    'environment:deploy',
    // Records
    'environment:records:read',
    'environment:records:write',
    'environment:records:*',
    // Logs
    'environment:logs:read',
    // Actions
    'environment:actions:execute',
    'environment:actions:*',
    // Proxy
    'environment:proxy',
    // Variables
    'environment:variables:read',
    // MCP
    'environment:mcp'
] as const;

export type EnvironmentApiKeyScope = (typeof ENVIRONMENT_API_KEY_SCOPES)[number];

export const ACCOUNT_API_KEY_SCOPES = [
    'account:*',
    // Team
    'account:team:read'
] as const;

export type AccountApiKeyScope = (typeof ACCOUNT_API_KEY_SCOPES)[number];

export type ApiKeyScope = EnvironmentApiKeyScope | AccountApiKeyScope;
