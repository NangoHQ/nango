import { flagHasPlan, flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { RequestLocals } from '../utils/express.js';
import type { Permission, Scope } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const envScope = (l: RequestLocals): Scope => (l.environment?.is_production ? 'production' : 'non-production');

type ScopedPermission = Omit<Permission, 'scope'> & { scopedBy: (locals: RequestLocals) => Scope };

export function can(permission: Permission | ScopedPermission): RequestHandler {
    return async (_req, res, next) => {
        if (!flags.hasAuthRoles) {
            next();
            return;
        }

        const { plan, user } = res.locals as RequestLocals;

        if (flagHasPlan && (!plan || !plan.has_rbac)) {
            next();
            return;
        }

        if (!user) {
            next();
            return;
        }

        const perm: Permission =
            'scopedBy' in permission
                ? { action: permission.action, resource: permission.resource, scope: permission.scopedBy(res.locals as RequestLocals) }
                : permission;
        const allowed = await evaluator.evaluate(user.role, perm);

        if (!allowed) {
            res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
            return;
        }

        next();
    };
}
