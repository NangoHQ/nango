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
    'environment:integrations:write', // legacy: covers create + update + delete
    'environment:integrations:*',
    // Connections
    'environment:connections:list',
    'environment:connections:list_credentials',
    'environment:connections:read',
    'environment:connections:read_credentials',
    'environment:connections:create',
    'environment:connections:update',
    'environment:connections:delete',
    'environment:connections:write', // legacy: covers create + update + delete
    'environment:connections:*',
    // Connect Sessions
    'environment:connect_sessions:write',
    // Syncs
    'environment:syncs:read',
    'environment:syncs:execute',
    'environment:syncs:update',
    'environment:syncs:variant:create',
    'environment:syncs:variant:delete',
    'environment:syncs:manage', // legacy: covers update + variant:create + variant:delete
    'environment:syncs:*',
    // Functions
    'environment:functions:compile',
    // Deploy
    'environment:deploy',
    // Dryrun
    'environment:dryrun',
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
    // Config (legacy: covers variables:read + integrations:list_functions)
    'environment:config:read',
    'environment:config:*',
    // MCP
    'environment:mcp'
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ALL_SCOPES: string[] = [...API_KEY_SCOPES];
