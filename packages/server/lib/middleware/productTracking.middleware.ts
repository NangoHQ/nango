import { withProductTrackingContext } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

/**
 * Give every posthog event emitted while handling a request the account and environment of that
 * request, so no call site has to pass them. The plan rides on the account group, not on events.
 *
 * Mounted before auth, so the locals are read when an event is emitted and not here.
 *
 * The request's user is deliberately left out: only session auth resolves one, so stamping it would
 * attribute the same event to a person or to the account depending on how the caller authenticated.
 */
export function productTrackingMiddleware(_req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
    withProductTrackingContext(
        () => ({
            team: res.locals['account'],
            environment: res.locals['environment']
        }),
        next
    );
}
