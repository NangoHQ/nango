import type { ApiKeyScope } from '@nangohq/types';

export const apiKeyScopes = [
    'environment:*',
    // Integrations
    'environment:integrations:list',
    'environment:integrations:list_credentials',
    'environment:integrations:read',
    'environment:integrations:read_credentials',
    'environment:integrations:write',
    'environment:integrations:*',
    // Connections
    'environment:connections:list',
    'environment:connections:list_credentials',
    'environment:connections:read',
    'environment:connections:read_credentials',
    'environment:connections:write',
    'environment:connections:*',
    // Connect Sessions
    'environment:connect_sessions:write',
    // Syncs
    'environment:syncs:read',
    'environment:syncs:execute',
    'environment:syncs:manage',
    'environment:syncs:*',
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
    // Config
    'environment:config:read',
    'environment:config:*',
    // MCP
    'environment:mcp'
] as const satisfies readonly ApiKeyScope[];
