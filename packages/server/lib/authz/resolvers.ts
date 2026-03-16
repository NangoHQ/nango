import type { Permission } from './types.js';
import type { RequestLocals } from '../utils/express.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ResolverFn = (locals: RequestLocals) => Permission;

const isProd = (l: RequestLocals): boolean => l.environment?.is_production ?? false;

function routeKey(method: string, path: string): string {
    const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    return `${method}\t${normalized}`;
}

function buildResolvers(entries: [HttpMethod, string, ResolverFn][]): Map<string, ResolverFn> {
    const map = new Map<string, ResolverFn>();
    for (const [method, path, fn] of entries) {
        map.set(routeKey(method, path), fn);
    }
    return map;
}

export function resolveRoute(method: string, path: string): ResolverFn | undefined {
    return resolvers.get(routeKey(method, path));
}

const resolvers = buildResolvers([
    // ─── Admin-only (not environment-scoped) ────────────────
    ['PUT', '/team', () => ({ action: 'write', resource: 'team', isProduction: null })],
    ['DELETE', '/team/users/:id', () => ({ action: 'delete', resource: 'team_member', isProduction: null })],
    ['POST', '/invite', () => ({ action: 'write', resource: 'invite', isProduction: null })],
    ['DELETE', '/invite', () => ({ action: 'delete', resource: 'invite', isProduction: null })],
    ['PUT', '/connect-ui-settings', () => ({ action: 'write', resource: 'connect_ui_settings', isProduction: null })],
    ['GET', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', isProduction: null })],
    ['POST', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', isProduction: null })],
    ['DELETE', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', isProduction: null })],
    ['POST', '/plans/change', () => ({ action: 'write', resource: 'plan', isProduction: null })],
    ['POST', '/plans/trial/extension', () => ({ action: 'write', resource: 'plan', isProduction: null })],
    ['POST', '/environments', () => ({ action: 'create', resource: 'environment', isProduction: null })],

    // ─── Environment-scoped (isProduction from res.locals) ──
    ['DELETE', '/environments', (l) => ({ action: 'delete', resource: 'environment', isProduction: isProd(l) })],
    ['PATCH', '/environments', (l) => ({ action: 'write', resource: 'environment', isProduction: isProd(l) })],
    ['POST', '/environment/rotate-key', (l) => ({ action: 'write', resource: 'environment_key', isProduction: isProd(l) })],
    ['POST', '/environment/revert-key', (l) => ({ action: 'write', resource: 'environment_key', isProduction: isProd(l) })],
    ['POST', '/environment/activate-key', (l) => ({ action: 'write', resource: 'environment_key', isProduction: isProd(l) })],
    ['POST', '/environments/variables', (l) => ({ action: 'write', resource: 'environment_variable', isProduction: isProd(l) })],
    ['PATCH', '/environments/webhook', (l) => ({ action: 'write', resource: 'webhook', isProduction: isProd(l) })],
    ['POST', '/integrations', (l) => ({ action: 'write', resource: 'integration', isProduction: isProd(l) })],
    ['PATCH', '/integrations/:providerConfigKey', (l) => ({ action: 'write', resource: 'integration', isProduction: isProd(l) })],
    ['DELETE', '/integrations/:providerConfigKey', (l) => ({ action: 'delete', resource: 'integration', isProduction: isProd(l) })],
    ['POST', '/connections', (l) => ({ action: 'write', resource: 'connection', isProduction: isProd(l) })],
    ['DELETE', '/connections/:connectionId', (l) => ({ action: 'delete', resource: 'connection', isProduction: isProd(l) })],
    ['POST', '/connections/:connectionId/refresh', (l) => ({ action: 'write', resource: 'connection', isProduction: isProd(l) })],
    ['POST', '/connect/sessions', (l) => ({ action: 'write', resource: 'connection', isProduction: isProd(l) })],
    ['POST', '/flows/pre-built/deploy', (l) => ({ action: 'write', resource: 'flow', isProduction: isProd(l) })],
    ['PUT', '/flows/pre-built/upgrade', (l) => ({ action: 'write', resource: 'flow', isProduction: isProd(l) })],
    ['PATCH', '/flows/:id/enable', (l) => ({ action: 'write', resource: 'flow', isProduction: isProd(l) })],
    ['PATCH', '/flows/:id/disable', (l) => ({ action: 'write', resource: 'flow', isProduction: isProd(l) })],
    ['PATCH', '/flows/:id/frequency', (l) => ({ action: 'write', resource: 'flow', isProduction: isProd(l) })],

    // ─── Sync commands (production_support can execute, development_full_access denied on prod) ──
    ['POST', '/sync/command', (l) => ({ action: 'write', resource: 'sync_command', isProduction: isProd(l) })],

    // ─── Read operations (only denied for development_full_access on production) ──
    ['GET', '/integrations', (l) => ({ action: 'read', resource: 'integration', isProduction: isProd(l) })],
    ['GET', '/integrations/:providerConfigKey', (l) => ({ action: 'read', resource: 'integration', isProduction: isProd(l) })],
    ['GET', '/connections', (l) => ({ action: 'read', resource: 'connection', isProduction: isProd(l) })],
    ['GET', '/connections/count', (l) => ({ action: 'read', resource: 'connection', isProduction: isProd(l) })],
    ['GET', '/connections/:connectionId', (l) => ({ action: 'read', resource: 'connection', isProduction: isProd(l) })],
    ['GET', '/environments/current', (l) => ({ action: 'read', resource: 'environment', isProduction: isProd(l) })],
    ['GET', '/logs/operations/:id', (l) => ({ action: 'read', resource: 'log', isProduction: isProd(l) })],
    ['POST', '/logs/operations', (l) => ({ action: 'read', resource: 'log', isProduction: isProd(l) })],
    ['POST', '/logs/messages', (l) => ({ action: 'read', resource: 'log', isProduction: isProd(l) })],
    ['POST', '/logs/filters', (l) => ({ action: 'read', resource: 'log', isProduction: isProd(l) })],
    ['POST', '/logs/insights', (l) => ({ action: 'read', resource: 'log', isProduction: isProd(l) })]
]);
