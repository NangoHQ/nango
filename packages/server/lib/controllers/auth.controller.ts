import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import util from 'util';
import { resetPasswordSecret, getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import jwt from 'jsonwebtoken';
import EmailClient from '../clients/email.client.js';
import {
    User,
    userService,
    accountService,
    errorManager,
    ErrorSourceEnum,
    environmentService,
    analytics,
    AnalyticsTypes,
    isCloud,
    getBaseUrl,
    NangoError,
    createOnboardingProvider
} from '@nangohq/shared';

export interface WebUser {
    id: number;
    accountId: number;
    email: string;
    name: string;
}

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
                account = await environmentService.createAccount(`${name}'s Organization`);
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
            analytics.track(event, account.id, {}, isCloud() ? { email: email } : {});

            if (isCloud() && !joinedWithToken) {
                // On Cloud version, create default provider config to simplify onboarding.
                const env = await environmentService.getByEnvironmentName('dev');
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
                <p><a href="${getBaseUrl()}/reset-password/${token}">Reset password</a></p>
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
}

export default new AuthController();
