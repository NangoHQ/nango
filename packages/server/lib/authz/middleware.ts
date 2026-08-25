import { resolve } from './resolve.js';
import { recordRoleDivergence } from './shadow.js';

import type { RequestLocals } from '../utils/express.js';
import type { Permission, Scope } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const envScope = (l: Partial<RequestLocals>): Scope => (l.environment?.is_production ? 'production' : 'non-production');

type ScopedPermission = Omit<Permission, 'scope'> & { scopedBy: (locals: Partial<RequestLocals>) => Scope };

export function can(permission: Permission | ScopedPermission): RequestHandler {
    return async (_req, res, next) => {
        const locals = res.locals as Partial<RequestLocals>;
        const perm: Permission =
            'scopedBy' in permission ? { action: permission.action, resource: permission.resource, scope: permission.scopedBy(locals) } : permission;

        const allowed = await resolve(locals, perm);
        recordRoleDivergence({ locals, permission: perm, legacy: allowed });

        if (!allowed) {
            res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
            return;
        }

        next();
    };
}
