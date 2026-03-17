import { flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { Permission, Scope } from './types.js';
import type { RequestLocals } from '../utils/express.js';
import type { RequestHandler } from 'express';

export const envScope = (l: RequestLocals): Scope => (l.environment?.is_production ? 'production' : 'non-production');

export function can(permission: Permission | ((locals: RequestLocals) => Permission)): RequestHandler {
    return async (_req, res, next) => {
        if (!flags.hasAuthRoles) {
            next();
            return;
        }

        const user = res.locals['user'];
        if (!user) {
            next();
            return;
        }

        const perm = typeof permission === 'function' ? permission(res.locals as RequestLocals) : permission;
        const allowed = await evaluator.evaluate({ role: user.role }, perm);

        if (!allowed) {
            res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
            return;
        }

        next();
    };
}
