import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import crypto from 'crypto';
import util from 'util';
import { sendVerificationEmail } from '../../../helpers/email.js';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { userService, accountService } from '@nangohq/shared';
import type { Signup } from '@nangohq/types';

const logger = getLogger('Server.Signup');

const validation = z
    .object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string()
    })
    .strict();

export const signup = asyncWrapper<Signup>(async (req, res) => {
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

    const { email, password, name } = val.data;

    const existingUser = await userService.getUserByEmail(email);
    if (existingUser !== null) {
        if (!existingUser.email_verified) {
            res.status(400).send({
                error: {
                    code: 'email_not_verified',
                    message: 'A user already exists with this email address but the address is not verified.'
                }
            });
        } else {
            res.status(400).send({
                error: {
                    code: 'user_already_exists',
                    message: 'User with this email already exists'
                }
            });
        }
        return;
    }

    const account = await accountService.createAccount(`${name}'s Organization`);

    if (!account) {
        logger.error('Error creating account');
        res.status(500).send({ error: { code: 'error_creating_account', message: 'There was a problem creating the account. Please reach out to support.' } });
        return;
    }

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await util.promisify(crypto.pbkdf2)(password, salt, 310000, 32, 'sha256')).toString('base64');
    const user = await userService.createUser(email, name, hashedPassword, salt, account.id, false);

    if (!user) {
        logger.error('Error creating user');
        res.status(500).send({ error: { code: 'error_creating_user', message: 'There was a problem creating the user. Please reach out to support.' } });
        return;
    }

    if (!user.email_verification_token) {
        res.status(400).send({ error: { code: 'email_already_verified', message: 'Email address was already verified, please login.' } });
        return;
    }

    sendVerificationEmail(email, name, user.email_verification_token);

    res.status(200).send({ uuid: user.uuid });
});
