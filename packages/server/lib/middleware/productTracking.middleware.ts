import { withProductTrackingContext } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

/**
 * Give every posthog event emitted while handling a request the account, environment and user of that
 * request, so no call site has to pass them. The plan rides on the account group, not on events.
 *
 * Mounted before auth, so the locals are read when an event is emitted and not here.
 */
export function productTrackingMiddleware(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
    withProductTrackingContext(
        () => ({
            team: res.locals['account'],
            environment: res.locals['environment'],
            user: res.locals['user'],
            plan: res.locals['plan'],
            impersonated: req.session?.debugMode === true
        }),
        next
    );
}
