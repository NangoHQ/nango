export const API_KEY_SCOPES = [
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
    'environment:integrations:functions:list',
    'environment:integrations:functions:read',
    'environment:integrations:functions:delete',
    'environment:integrations:functions:*',
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
    'environment:functions:compile',
    'environment:functions:dryrun',
    'environment:functions:*',
    // Deploy
    'environment:deploy',
    // Records
    'environment:records:read',
    'environment:records:write',
    'environment:records:*',
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

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ALL_SCOPES: string[] = [...API_KEY_SCOPES];
