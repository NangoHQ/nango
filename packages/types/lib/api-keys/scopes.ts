export const API_KEY_SCOPES = [
    'environment:integrations:list',
    'environment:integrations:list_credentials',
    'environment:integrations:read',
    'environment:integrations:read_credentials',
    'environment:integrations:write',
    'environment:connections:list',
    'environment:connections:list_credentials',
    'environment:connections:read',
    'environment:connections:read_credentials',
    'environment:connections:write',
    'environment:connect_sessions:write',
    'environment:syncs:read',
    'environment:syncs:execute',
    'environment:syncs:manage',
    'environment:deploy',
    'environment:records:read',
    'environment:records:write',
    'environment:actions:execute',
    'environment:proxy',
    'environment:config:read',
    'environment:mcp'
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ALL_SCOPES: string[] = [...API_KEY_SCOPES];
