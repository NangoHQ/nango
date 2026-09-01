import { authorizes } from './resolve.js';

import type { RequestLocals } from '../utils/express.js';
import type { Scope } from '@nangohq/authz';
import type { RequestHandler } from 'express';

export function can(scope: Scope): RequestHandler {
    return (_req, res, next) => {
        if (!authorizes(res.locals as Partial<RequestLocals>, scope)) {
            res.status(403).json({ error: { code: 'forbidden', message: 'You do not have permission to perform this action' } });
            return;
        }

        next();
    };
}
