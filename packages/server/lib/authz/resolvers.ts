import type { Permission, Scope } from './types.js';
import type { RequestLocals } from '../utils/express.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ResolverFn = (locals: RequestLocals) => Permission;

const envScope = (l: RequestLocals): Scope => (l.environment?.is_production ? 'production' : 'non-production');

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
    // ─── Admin-only (global scope) ──────────────────────────
    ['PUT', '/team', () => ({ action: 'write', resource: 'team', scope: 'global' })],
    ['DELETE', '/team/users/:id', () => ({ action: 'delete', resource: 'team_member', scope: 'global' })],
    ['POST', '/invite', () => ({ action: 'write', resource: 'invite', scope: 'global' })],
    ['DELETE', '/invite', () => ({ action: 'delete', resource: 'invite', scope: 'global' })],
    ['PUT', '/connect-ui-settings', () => ({ action: 'write', resource: 'connect_ui_settings', scope: 'global' })],
    ['GET', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', scope: 'global' })],
    ['POST', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', scope: 'global' })],
    ['DELETE', '/stripe/payment_methods', () => ({ action: '*', resource: 'billing', scope: 'global' })],
    ['POST', '/plans/change', () => ({ action: 'write', resource: 'plan', scope: 'global' })],
    ['POST', '/plans/trial/extension', () => ({ action: 'write', resource: 'plan', scope: 'global' })],
    ['POST', '/environments', () => ({ action: 'create', resource: 'environment', scope: 'global' })],

    // ─── Environment-scoped (scope from res.locals) ─────────
    ['DELETE', '/environments', (l) => ({ action: 'delete', resource: 'environment', scope: envScope(l) })],
    ['PATCH', '/environments', (l) => ({ action: 'write', resource: 'environment', scope: envScope(l) })],
    ['POST', '/environment/rotate-key', (l) => ({ action: 'write', resource: 'environment_key', scope: envScope(l) })],
    ['POST', '/environment/revert-key', (l) => ({ action: 'write', resource: 'environment_key', scope: envScope(l) })],
    ['POST', '/environment/activate-key', (l) => ({ action: 'write', resource: 'environment_key', scope: envScope(l) })],
    ['POST', '/environments/variables', (l) => ({ action: 'write', resource: 'environment_variable', scope: envScope(l) })],
    ['PATCH', '/environments/webhook', (l) => ({ action: 'write', resource: 'webhook', scope: envScope(l) })],
    ['POST', '/integrations', (l) => ({ action: 'write', resource: 'integration', scope: envScope(l) })],
    ['PATCH', '/integrations/:providerConfigKey', (l) => ({ action: 'write', resource: 'integration', scope: envScope(l) })],
    ['DELETE', '/integrations/:providerConfigKey', (l) => ({ action: 'delete', resource: 'integration', scope: envScope(l) })],
    ['POST', '/connections', (l) => ({ action: 'write', resource: 'connection', scope: envScope(l) })],
    ['DELETE', '/connections/:connectionId', (l) => ({ action: 'delete', resource: 'connection', scope: envScope(l) })],
    ['POST', '/connections/:connectionId/refresh', (l) => ({ action: 'write', resource: 'connection', scope: envScope(l) })],
    ['POST', '/connect/sessions', (l) => ({ action: 'write', resource: 'connection', scope: envScope(l) })],
    ['POST', '/flows/pre-built/deploy', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) })],
    ['PUT', '/flows/pre-built/upgrade', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) })],
    ['PATCH', '/flows/:id/enable', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) })],
    ['PATCH', '/flows/:id/disable', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) })],
    ['PATCH', '/flows/:id/frequency', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) })],

    // ─── Sync commands (production_support can execute, development_full_access denied on prod) ──
    ['POST', '/sync/command', (l) => ({ action: 'write', resource: 'sync_command', scope: envScope(l) })],

    // ─── Read operations (only denied for development_full_access on production) ──
    ['GET', '/integrations', (l) => ({ action: 'read', resource: 'integration', scope: envScope(l) })],
    ['GET', '/integrations/:providerConfigKey', (l) => ({ action: 'read', resource: 'integration', scope: envScope(l) })],
    ['GET', '/connections', (l) => ({ action: 'read', resource: 'connection', scope: envScope(l) })],
    ['GET', '/connections/count', (l) => ({ action: 'read', resource: 'connection', scope: envScope(l) })],
    ['GET', '/connections/:connectionId', (l) => ({ action: 'read', resource: 'connection', scope: envScope(l) })],
    ['GET', '/environments/current', (l) => ({ action: 'read', resource: 'environment', scope: envScope(l) })],
    ['GET', '/logs/operations/:id', (l) => ({ action: 'read', resource: 'log', scope: envScope(l) })],
    ['POST', '/logs/operations', (l) => ({ action: 'read', resource: 'log', scope: envScope(l) })],
    ['POST', '/logs/messages', (l) => ({ action: 'read', resource: 'log', scope: envScope(l) })],
    ['POST', '/logs/filters', (l) => ({ action: 'read', resource: 'log', scope: envScope(l) })],
    ['POST', '/logs/insights', (l) => ({ action: 'read', resource: 'log', scope: envScope(l) })]
]);
