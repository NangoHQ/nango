import * as z from 'zod';

import { NangoError, userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { loginOrStartPendingMfa } from './mfa/login.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { PostSignin } from '@nangohq/types';
import type { RequestHandler, Response } from 'express';

const validation = z
    .object({
        email: z.string().email(),
        password: z.string().min(8).max(64)
    })
    .strict();

export const validateSigninRequest: RequestHandler = (req, res, next) => {
    const emptyQuery = requireEmptyQuery(req);

    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    next();
};

export const signin = asyncWrapper<PostSignin>(async (req, res: Response<any, RequestLocals>, next) => {
    const candidate = res.locals.user;
    if (!candidate) {
        next(new Error('signin: expected authenticated user on res.locals'));
        return;
    }

    // Same gate as legacy getUserFromSession: excludes suspended users and matches DB truth (not stale passport user).
    const user = await userService.getUserById(candidate.id, true);
    if (!user) {
        res.status(401).send({
            error: { code: 'unauthorized', message: new NangoError('user_not_found').message }
        });
        return;
    }

    if (user.suspended) {
        req.session.destroy(() => {
            res.status(400).send({ error: { code: 'user_suspended' } });
        });
        return;
    }

    if (await loginOrStartPendingMfa(req, user, '/')) {
        res.status(200).send({ data: { mfaRequired: true } });
        return;
    }

    res.status(200).send({ user: userToAPI(user) });
});
