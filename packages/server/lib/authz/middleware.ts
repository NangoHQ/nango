import { flags } from '@nangohq/utils';

import { authorize } from './authorize.js';

import type { Role } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const authzMiddleware: RequestHandler = async (req, res, next) => {
    if (!flags.hasAuthRoles) {
        next();
        return;
    }

    // Authz only applies to session-authenticated (dashboard) users.
    // API key consumers have no user/role — skip enforcement.
    const user = res.locals['user'];
    if (!user) {
        next();
        return;
    }

    const role: Role = user.role;

    // Resolve the Express route pattern (e.g., /team/users/123 → /team/users/:id)
    const routePath = req.route?.path as string | undefined;
    if (!routePath) {
        next();
        return;
    }

    const method = req.method.toUpperCase();
    const allowed = await authorize(method, routePath, role, res.locals);

    if (!allowed) {
        res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
        return;
    }

    next();
};
