import { flags } from '@nangohq/utils';

import { authorize } from './authorize.js';
import { evaluator } from './evaluator.js';

import type { Role } from '@nangohq/types';
import type { RequestHandler } from 'express';

export const authzMiddleware: RequestHandler = (req, res, next) => {
    if (!flags.hasAuthRoles) {
        res.locals['authz'] = {
            canReadCredentials: true,
            canReadProdSecrets: true,
            canAccessProdEnvironments: true
        };
        next();
        return;
    }

    // Authz only applies to session-authenticated (dashboard) users.
    // API key consumers have no user/role — skip enforcement and set permissive defaults.
    const user = res.locals['user'];
    if (!user) {
        res.locals['authz'] = {
            canReadCredentials: true,
            canReadProdSecrets: true,
            canAccessProdEnvironments: true
        };
        next();
        return;
    }

    const role: Role = user.role ?? 'administrator';

    // Resolve the Express route pattern (e.g., /team/users/123 → /team/users/:id)
    const routePath = req.route?.path as string | undefined;
    if (!routePath) {
        next();
        return;
    }

    const method = req.method.toUpperCase();
    const allowed = authorize(method, routePath, role, res.locals);

    if (!allowed) {
        res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
        return;
    }

    // Populate authz locals for Category 3 (service-layer) enforcement
    const isProduction = res.locals['environment']?.is_production ?? false;
    res.locals['authz'] = {
        canReadCredentials: isProduction ? evaluator.evaluate({ role }, { action: 'read', resource: 'connection_credential', isProduction: true }) : true,
        canReadProdSecrets: isProduction ? evaluator.evaluate({ role }, { action: 'read', resource: 'secret_key', isProduction: true }) : true,
        canAccessProdEnvironments: evaluator.evaluate({ role }, { action: 'read', resource: 'environment', isProduction: true })
    };

    next();
};
