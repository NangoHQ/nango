import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import userService from '../services/user.service.js';
import errorManager from '../utils/error.manager.js';
import accountService from '../services/account.service.js';
import util from 'util';
import analytics from '../utils/analytics.js';
import { isCloud, resetPasswordSecret, getBaseUrl, getUserAndAccountFromSesstion } from '../utils/utils.js';
import jwt from 'jsonwebtoken';
import Mailgun from 'mailgun.js';
import type { User } from '../models.js';
import formData from 'form-data';
import { NangoError } from '../utils/error.js';
import configService from '../services/config.service.js';

export interface WebUser {
    id: number;
    accountId: number;
    email: string;
    name: string;
}

class AuthController {
    async signin(req: Request, res: Response, next: NextFunction) {
        try {
            let user = (await getUserAndAccountFromSesstion(req)).user;
            let webUser: WebUser = {
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

            let email = req.body['email'];
            if (email == null) {
                errorManager.errRes(res, 'missing_email_param');
                return;
            }

            let name = req.body['name'];
            if (name == null) {
                errorManager.errRes(res, 'missing_name_param');
                return;
            }

            let password = req.body['password'];
            if (password == null) {
                errorManager.errRes(res, 'missing_password_param');
                return;
            }

            if ((await userService.getUserByEmail(email)) != null) {
                errorManager.errRes(res, 'duplicate_account');
                return;
            }

            let account = await accountService.createAccount(`${name}'s Organization`);

            if (account == null) {
                throw new NangoError('account_creation_failure');
            }

            let salt = crypto.randomBytes(16).toString('base64');
            let hashedPassword = (await util.promisify(crypto.pbkdf2)(password, salt, 310000, 32, 'sha256')).toString('base64');
            let user = await userService.createUser(email, name, hashedPassword, salt, account!.id);

            if (user == null) {
                throw new NangoError('user_creation_failure');
            }

            await accountService.editAccount(account!.id, account!.name, user.id);
            analytics.track('server:account_created', account.id, {}, isCloud() ? { email: email } : {});

            if (isCloud()) {
                // On Cloud version, create default provider config to simplify onboarding.
                // Harder to do on the self-hosted version because we don't know what OAuth callback to use.
                await configService.createDefaultProviderConfig(account.id);
            }

            req.login(user, function (err) {
                if (err) {
                    return next(err);
                }

                let webUser: WebUser = {
                    id: user!.id,
                    accountId: user!.account_id,
                    email: user!.email,
                    name: user!.name
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

            let user = await userService.getUserByEmail(email);

            if (user == null) {
                errorManager.errRes(res, 'unkown_user');
                return;
            }

            const resetToken = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });

            user.reset_password_token = resetToken;
            await userService.editUser(user);

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
                        errorManager.errRes(res, 'unkown_password_reset_token');
                        return;
                    }

                    let user = await userService.getUserByResetPasswordToken(token);

                    if (!user) {
                        errorManager.errRes(res, 'unkown_password_reset_token');
                        return;
                    }

                    let hashedPassword = (await util.promisify(crypto.pbkdf2)(password, user.salt, 310000, 32, 'sha256')).toString('base64');

                    user.hashed_password = hashedPassword;
                    user.reset_password_token = undefined;
                    await userService.editUser(user);

                    res.status(200).json();
                });
            }
        } catch (error) {
            next(error);
        }
    }

    async sendResetPasswordEmail(user: User, token: string) {
        try {
            const mailgun = new Mailgun(formData);
            const mg = mailgun.client({
                username: 'api',
                key: process.env['MAILGUN_API_KEY']!
            });

            mg.messages
                .create('email.nango.dev', {
                    from: 'Nango <support@nango.dev>',
                    to: [user.email],
                    subject: 'Nango password reset',
                    html: `
                <p><b>Reset your password</b></p>
                <p>Someone requested a password reset.</p>
                <p><a href="${getBaseUrl()}/reset-password/${token}">Reset password</a></p>
                <p>If you didn't initiate this request, please contact us immediately at support@nango.dev</p>
                `
                })
                .catch((e: Error) => {
                    errorManager.report(e, { userId: user.id });
                });
        } catch (e) {
            errorManager.report(e, { userId: user.id });
        }
    }
}

export default new AuthController();
