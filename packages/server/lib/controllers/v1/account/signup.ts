import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import crypto from 'crypto';
import util from 'util';
import { sendVerificationEmail } from '../../../helpers/email.js';
import { isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { userService, accountService, getInvitation, analytics, AnalyticsTypes, acceptInvitation } from '@nangohq/shared';
import type { DBTeam, PostSignup } from '@nangohq/types';

export const passwordSchema = z
    .string()
    .min(8)
    .max(64)
    .refine((value) => {
        return value.match(/[A-Z]+/) && value.match(/[0-9]/) && value.match(/[^a-zA-Z0-9]/);
    }, 'Password should be least 8 characters with uppercase, a number and a special character');

const validation = z
    .object({
        email: z.string().email(),
        password: passwordSchema,
        name: z.string(),
        token: z.string().uuid().optional()
    })
    .strict();

const disabled = true;
export const signup = asyncWrapper<PostSignup>(async (req, res) => {
    if (disabled) {
        res.status(400).send({ error: { code: 'server_error' } });
        return;
    }

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

    const { email, password, name, token }: PostSignup['Body'] = val.data;

    const existingUser = await userService.getUserByEmail(email);
    if (existingUser) {
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

    let account: DBTeam | null;
    if (token) {
        // Invitation signup
        const validToken = await getInvitation(token);
        if (!validToken) {
            res.status(400).send({ error: { code: 'invalid_invite_token', message: 'The token used was found to be invalid.' } });
            return;
        }

        account = await accountService.getAccountById(validToken.account_id);
        if (!account) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to get team' } });
            return;
        }
        void analytics.track(AnalyticsTypes.ACCOUNT_JOINED, account.id, {}, isCloud ? { email } : {});

        await acceptInvitation(token);
    } else {
        // Regular account
        account = await accountService.createAccount(`${name}'s Organization`);
        if (!account) {
            res.status(500).send({
                error: { code: 'error_creating_account', message: 'There was a problem creating the account. Please reach out to support.' }
            });
            return;
        }
    }

    // Create user
    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await util.promisify(crypto.pbkdf2)(password, salt, 310000, 32, 'sha256')).toString('base64');
    const user = await userService.createUser(email, name, hashedPassword, salt, account.id, false);
    if (!user) {
        res.status(500).send({ error: { code: 'error_creating_user', message: 'There was a problem creating the user. Please reach out to support.' } });
        return;
    }

    // Ask for email validation if not coming from an invitation
    if (!token) {
        if (!user.email_verification_token) {
            res.status(400).send({ error: { code: 'email_already_verified', message: 'Email address was already verified, please login.' } });
            return;
        }

        sendVerificationEmail(email, name, user.email_verification_token);

        // We don't login because we want to enforce email validation
        res.status(200).send({ data: { uuid: user.uuid, verified: false } });
        return;
    }

    // Login directly if we are coming from an invitation
    req.login(user, function (err) {
        if (err) {
            res.status(500).send({ error: { code: 'server_error', message: 'There was a problem logging in the user. Please reach out to support.' } });
            return;
        }

        res.status(200).send({ data: { uuid: user.uuid, verified: true } });
    });
});
