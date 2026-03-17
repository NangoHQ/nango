import type { Permission, Scope } from './types.js';
import type { RequestLocals } from '../utils/express.js';

export type ResolverFn = (locals: RequestLocals) => Permission;

export const envScope = (l: RequestLocals): Scope => (l.environment?.is_production ? 'production' : 'non-production');

function routeKey(method: string, path: string): string {
    const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
    return `${method}\t${normalized}`;
}

const resolvers = new Map<string, ResolverFn>();

export function registerPermission(method: string, path: string, permission: Permission | ResolverFn): void {
    const fn = typeof permission === 'function' ? permission : () => permission;
    resolvers.set(routeKey(method, path), fn);
}

export function resolveRoute(method: string, path: string): ResolverFn | undefined {
    return resolvers.get(routeKey(method, path));
}
