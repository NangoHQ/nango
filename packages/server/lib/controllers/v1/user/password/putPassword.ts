import crypto from 'node:crypto';

import { z } from 'zod';

import { pbkdf2, userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { passwordSchema } from '../../account/signup.js';

import type { DBUser, PutUserPassword } from '@nangohq/types';

const validation = z
    .object({
        oldPassword: passwordSchema,
        newPassword: passwordSchema
    })
    .strict();

export const putUserPassword = asyncWrapper<PutUserPassword, never>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const user = res.locals['user'] as DBUser; // type is slightly wrong because we are not in an endpoint with an ?env=
    const body: PutUserPassword['Body'] = val.data;

    const oldHashedPassword = await pbkdf2(body.oldPassword, user.salt, 310000, 32, 'sha256');
    const actualHashedPassword = Buffer.from(user.hashed_password, 'base64');

    if (oldHashedPassword.length !== actualHashedPassword.length || !crypto.timingSafeEqual(actualHashedPassword, oldHashedPassword)) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Incorrect old password.' } });
        return;
    }

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await pbkdf2(body.newPassword, salt, 310000, 32, 'sha256')).toString('base64');

    await userService.update({ id: user.id, hashed_password: hashedPassword, salt });

    res.status(200).send({ success: true });
});
