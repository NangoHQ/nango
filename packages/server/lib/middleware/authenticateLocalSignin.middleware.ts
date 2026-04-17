import passport from 'passport';

import type { RequestLocals } from '../utils/express.js';
import type { DBUser } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

interface LocalAuthInfo {
    message?: string;
    code?: string;
}

/**
 * Passport local strategy with `{ session: false }`. On success, sets `res.locals.user`
 * to the authenticated row from {@link userService.getUserByEmail}.
 *
 * Passport types the verify callback user as `Express.User`, but our `LocalStrategy`
 * passes a full {@link DBUser}. We assert that here so downstream handlers see a
 * consistent type (see {@link RequestLocals.user}).
 */
export function authenticateLocalSignin(req: Request, res: Response<any, RequestLocals>, next: NextFunction): void {
    passport.authenticate('local', { session: false }, (err: unknown, user: Express.User | false | null, info?: LocalAuthInfo) => {
        if (err) {
            next(err);
            return;
        }

        if (!user) {
            if (info?.code === 'email_not_verified') {
                res.status(400).send({ error: { code: 'email_not_verified' } });
                return;
            }

            res.status(401).send({ error: { code: 'unauthorized', message: info?.message || 'Unauthorized' } });
            return;
        }

        res.locals.user = user as DBUser;
        next();
    })(req, res, next);
}
