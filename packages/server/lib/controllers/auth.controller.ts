import type { Request, Response, NextFunction } from 'express';
import { WorkOS } from '@workos-inc/node';
import crypto from 'crypto';
import util from 'util';
import { resetPasswordSecret, getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import jwt from 'jsonwebtoken';
import EmailClient from '../clients/email.client.js';
import type { User } from '@nangohq/shared';
import { isCloud, baseUrl, basePublicUrl, getLogger, isOk, resultErr, resultOk, type Result } from '@nangohq/utils';
import {
    userService,
    accountService,
    errorManager,
    ErrorSourceEnum,
    environmentService,
    analytics,
    AnalyticsTypes,
    NangoError,
    createOnboardingProvider
} from '@nangohq/shared';

export interface WebUser {
    id: number;
    accountId: number;
    email: string;
    name: string;
}

const logger = getLogger('Server.AuthController');

interface InviteAccountBody {
    accountId: number;
}
interface InviteAccountState extends InviteAccountBody {
    token: string;
}

let workos: WorkOS | null = null;
if (process.env['WORKOS_API_KEY'] && process.env['WORKOS_CLIENT_ID']) {
    workos = new WorkOS(process.env['WORKOS_API_KEY']);
} else {
    if (isCloud) {
        throw new NangoError('workos_not_configured');
    }
}

const allowedProviders = ['GoogleOAuth'];

const parseState = (state: string): Result<InviteAccountState, Error> => {
    try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString('ascii')) as InviteAccountState;
        return resultOk(parsed);
    } catch {
        const error = new Error('Invalid state');
        return resultErr(error);
    }
};

const createAccountIfNotInvited = async (name: string, state?: string): Promise<number | null> => {
    if (!state) {
        const account = await accountService.createAccount(`${name}'s Organization`);
        if (!account) {
            throw new NangoError('account_creation_failure');
        }
        return account.id;
    }

    const parsedState: Result<InviteAccountState> = parseState(state);

    if (isOk(parsedState)) {
        const { accountId, token } = parsedState.res;
        const validToken = await userService.getInvitedUserByToken(token);
        if (validToken) {
            await userService.markAcceptedInvite(token);
        }
        return accountId;
    }

    return null;
};

class AuthController {
    async signin(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { user } = response;

            const webUser: WebUser = {
                id: user.id,
                accountId: user.account_id,
                email: user.email,
                name: user.name
            };
            res.status(200).send({ user: webUser });
        } catch (err) {
            next(err);
        }
    }

    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    next(err);
                }

                res.status(200).send();
            });
        } catch (err) {
            next(err);
        }
    }

    async signup(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            const email = req.body['email'];
            if (email == null) {
                errorManager.errRes(res, 'missing_email_param');
                return;
            }

            const name = req.body['name'];
            if (name == null) {
                errorManager.errRes(res, 'missing_name_param');
                return;
            }

            const password = req.body['password'];
            if (password == null) {
                errorManager.errRes(res, 'missing_password_param');
                return;
            }

            if ((await userService.getUserByEmail(email)) != null) {
                errorManager.errRes(res, 'duplicate_account');
                return;
            }

            let account;
            let joinedWithToken = false;

            if (req.body['account_id'] != null) {
                const token = req.body['token'];
                const validToken = userService.getInvitedUserByToken(token);
                if (!validToken) {
                    errorManager.errRes(res, 'invalid_invite_token');
                    return;
                }
                account = await accountService.getAccountById(Number(req.body['account_id']));
                joinedWithToken = true;
            } else {
                account = await accountService.createAccount(`${name}'s Organization`);
            }

            if (account == null) {
                throw new NangoError('account_creation_failure');
            }

            const salt = crypto.randomBytes(16).toString('base64');
            const hashedPassword = (await util.promisify(crypto.pbkdf2)(password, salt, 310000, 32, 'sha256')).toString('base64');
            const user = await userService.createUser(email, name, hashedPassword, salt, account.id);

            if (user == null) {
                throw new NangoError('user_creation_failure');
            }

            const event = joinedWithToken ? AnalyticsTypes.ACCOUNT_JOINED : AnalyticsTypes.ACCOUNT_CREATED;
            void analytics.track(event, account.id, {}, isCloud ? { email: email } : {});

            if (isCloud && !joinedWithToken) {
                // On Cloud version, create default provider config to simplify onboarding.
                const env = await environmentService.getByEnvironmentName(account.id, 'dev');
                if (env) {
                    await createOnboardingProvider({ envId: env.id });
                }
            }

            if (joinedWithToken) {
                await userService.markAcceptedInvite(req.body['token']);
            }

            req.login(user, function (err) {
                if (err) {
                    return next(err);
                }

                const webUser: WebUser = {
                    id: user.id,
                    accountId: user.account_id,
                    email: user.email,
                    name: user.name
                };
                res.status(200).send({ user: webUser });
            });
        } catch (err) {
            next(err);
        }
    }

    async forgotPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const { email } = req.body;

            if (email == null) {
                errorManager.errRes(res, 'missing_email_param');
                return;
            }

            const user = await userService.getUserByEmail(email);

            if (user == null) {
                errorManager.errRes(res, 'unknown_user');
                return;
            }

            const resetToken = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });

            user.reset_password_token = resetToken;
            await userService.editUserPassword(user);

            this.sendResetPasswordEmail(user, resetToken);

            res.status(200).json();
        } catch (error) {
            next(error);
        }
    }

    async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const { password, token } = req.body;

            if (!token && !password) {
                errorManager.errRes(res, 'missing_password_reset_token');
                return;
            }

            if (token) {
                jwt.verify(token, resetPasswordSecret(), async (error: any, _: any) => {
                    if (error) {
                        errorManager.errRes(res, 'unknown_password_reset_token');
                        return;
                    }

                    const user = await userService.getUserByResetPasswordToken(token);

                    if (!user) {
                        errorManager.errRes(res, 'unknown_password_reset_token');
                        return;
                    }

                    const hashedPassword = (await util.promisify(crypto.pbkdf2)(password, user.salt, 310000, 32, 'sha256')).toString('base64');

                    user.hashed_password = hashedPassword;
                    user.reset_password_token = undefined;
                    await userService.editUserPassword(user);

                    res.status(200).json();
                });
            }
        } catch (error) {
            next(error);
        }
    }

    async sendResetPasswordEmail(user: User, token: string) {
        try {
            const emailClient = EmailClient.getInstance();
            emailClient
                ?.send(
                    user.email,
                    'Nango password reset',
                    `<p><b>Reset your password</b></p>
                <p>Someone requested a password reset.</p>
                <p><a href="${baseUrl}/reset-password/${token}">Reset password</a></p>
                <p>If you didn't initiate this request, please contact us immediately at support@nango.dev</p>`
                )
                .catch((e: Error) => {
                    errorManager.report(e, { source: ErrorSourceEnum.PLATFORM, userId: user.id, operation: 'user' });
                });
        } catch (e) {
            errorManager.report(e, { userId: user.id, source: ErrorSourceEnum.PLATFORM, operation: 'user' });
        }
    }

    async invitation(req: Request, res: Response, next: NextFunction) {
        try {
            const token = req.query['token'] as string;

            if (!token) {
                res.status(400).send({ error: 'Token is missing' });
                return;
            }

            const invitee = await userService.getInvitedUserByToken(token);

            if (!invitee) {
                errorManager.errRes(res, 'duplicate_account');
                return;
            }

            res.status(200).send(invitee);
        } catch (error) {
            next(error);
        }
    }

    getManagedLogin(req: Request, res: Response, next: NextFunction) {
        try {
            const provider = req.query['provider'] as string;

            if (!provider || !allowedProviders.includes(provider)) {
                errorManager.errRes(res, 'invalid_provider');
                return;
            }

            if (!workos) {
                errorManager.errRes(res, 'workos_not_configured');
                return;
            }

            const oAuthUrl = workos?.userManagement.getAuthorizationUrl({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                provider,
                redirectUri: `${basePublicUrl}/api/v1/login/callback`
            });

            res.send({ url: oAuthUrl });
        } catch (err) {
            next(err);
        }
    }

    getManagedLoginWithInvite(req: Request, res: Response, next: NextFunction) {
        try {
            const provider = req.query['provider'] as string;

            if (!provider || !allowedProviders.includes(provider)) {
                errorManager.errRes(res, 'invalid_provider');
                return;
            }

            const token = req.params['token'] as string;

            const body: InviteAccountBody = req.body as InviteAccountBody;

            if (!body || body.accountId === undefined) {
                errorManager.errRes(res, 'missing_params');
                return;
            }

            if (!provider || !token) {
                errorManager.errRes(res, 'missing_params');
                return;
            }

            if (!workos) {
                errorManager.errRes(res, 'workos_not_configured');
                return;
            }

            const accountId = body.accountId;

            const inviteParams: InviteAccountState = {
                accountId,
                token
            };

            const oAuthUrl = workos?.userManagement.getAuthorizationUrl({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                provider,
                redirectUri: `${basePublicUrl}/api/v1/login/callback`,
                state: Buffer.from(JSON.stringify(inviteParams)).toString('base64')
            });

            res.send({ url: oAuthUrl });
        } catch (err) {
            next(err);
        }
    }

    async loginCallback(req: Request, res: Response, next: NextFunction) {
        try {
            const { code, state } = req.query;

            if (!workos) {
                const error = new NangoError('workos_not_configured');
                logger.error(error);
                res.redirect(`${basePublicUrl}`);
                return;
            }

            if (!code) {
                const error = new NangoError('missing_managed_login_callback_code');
                logger.error(error);
                res.redirect(`${basePublicUrl}`);
                return;
            }

            const { user: authorizedUser, organizationId } = await workos.userManagement.authenticateWithCode({
                clientId: process.env['WORKOS_CLIENT_ID'] || '',
                code: code as string
            });

            const existingUser = await userService.getUserByEmail(authorizedUser.email);

            if (existingUser) {
                req.login(existingUser, function (err) {
                    if (err) {
                        return next(err);
                    }
                    res.redirect(`${basePublicUrl}/`);
                });

                return;
            }

            const name =
                authorizedUser.firstName || authorizedUser.lastName
                    ? `${authorizedUser.firstName || ''} ${authorizedUser.lastName || ''}`
                    : authorizedUser.email.split('@')[0];

            let accountId: number | null = null;

            if (organizationId) {
                // in this case we have a pre registered organization with workos
                // let's make sure it exists in our system
                const organization = await workos.organizations.getOrganization(organizationId);

                const account = await accountService.getOrCreateAccount(organization.name);

                if (!account) {
                    throw new NangoError('account_creation_failure');
                }
                accountId = account.id;
            } else {
                if (!name) {
                    throw new NangoError('missing_name_for_account_creation');
                }

                accountId = await createAccountIfNotInvited(name, state as string);

                if (!accountId) {
                    throw new NangoError('account_creation_failure');
                }
            }

            const user = await userService.createUser(authorizedUser.email, name as string, '', '', accountId);
            if (!user) {
                throw new NangoError('user_creation_failure');
            }

            req.login(user, function (err) {
                if (err) {
                    return next(err);
                }
                res.redirect(`${basePublicUrl}/`);
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new AuthController();
