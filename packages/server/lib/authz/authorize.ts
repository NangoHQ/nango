import { evaluator } from './evaluator.js';
import { resolveRoute } from './resolvers.js';

import type { RequestLocals } from '../utils/express.js';
import type { Role } from '@nangohq/types';

export async function authorize(method: string, path: string, role: Role, locals: RequestLocals): Promise<boolean> {
    const resolve = resolveRoute(method, path);
    if (!resolve) return true; // route not in registry → no restrictions

    const permission = resolve(locals);
    return evaluator.evaluate({ role }, permission);
}
