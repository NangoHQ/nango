import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { analytics, userService, AnalyticsTypes } from '@nangohq/shared';
import type { ValidateEmailAndLogin } from '@nangohq/types';
import { userToAPI } from '../../../formatters/user.js';

const logger = getLogger('Server.ValidateEmailAndLogin');

const validation = z
    .object({
        token: z.string().min(6)
    })
    .strict();

export const validateEmailAndLogin = asyncWrapper<ValidateEmailAndLogin>(async (req, res) => {
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
                    message: 'The token has expired. An email has been sent with a new token.'
                }
            });
        } else {
            logger.error('Error validating user');
            res.status(500).send({
                error: { code: 'error_validating_user', message: 'There was a problem validating the user. Please reach out to support.' }
            });
        }

        return;
    }

    const user = tokenResponse.value;

    await userService.verifyUserEmail(user.id);

    const { account_id, email } = user;

    void analytics.track(AnalyticsTypes.ACCOUNT_CREATED, account_id, {}, { email });

    req.login(user, function (err) {
        if (err) {
            logger.error('Error logging in user');
            res.status(500).send({ error: { code: 'error_logging_in', message: 'There was a problem logging in the user. Please reach out to support.' } });
            return;
        }

        res.status(200).send({ user: userToAPI(user) });
    });
});
