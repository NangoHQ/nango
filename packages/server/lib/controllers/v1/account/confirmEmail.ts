import * as z from 'zod';

import db from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ConfirmEmail } from '@nangohq/types';

const logger = getLogger('Server.ConfirmEmail');

const validation = z
    .object({
        token: z.string().min(6)
    })
    .strict();

export const confirmEmail = asyncWrapper<ConfirmEmail>(async (req, res) => {
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

    const { token } = val.data;

    const tokenResponse = await userService.getUserByToken(token);

    if (tokenResponse.isErr()) {
        const error = tokenResponse.error;

        if (error.message === 'token_expired') {
            res.status(400).send({
                error: {
                    code: 'token_expired',
                    message: 'The token has expired.'
                }
            });
        } else if (error.message === 'user_not_found') {
            res.status(400).send({
                error: {
                    code: 'invalid_token',
                    message: 'The token is invalid.'
                }
            });
        } else {
            logger.error('Error validating user', error);
            res.status(500).send({
                error: { code: 'error_validating_user', message: 'There was a problem validating the user. Please reach out to support.' }
            });
        }

        return;
    }

    const user = tokenResponse.value;

    await userService.verifyUserEmail(user.id);

    let showHearAboutUs = false;
    const account = await accountService.getAccountById(db.knex, user.account_id);
    if (account) {
        showHearAboutUs = await accountService.shouldShowHearAboutUs(account);
    }

    res.status(200).send({ email: user.email, userId: user.id, accountId: user.account_id, showHearAboutUs });
});
