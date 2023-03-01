import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import userService from '../services/user.service.js';
import errorManager from '../utils/error.manager.js';
import accountService from '../services/account.service.js';
import util from 'util';
import analytics from '../utils/analytics.js';
import { isCloud } from '../utils/utils.js';

class AuthController {
    async signin(_: Request, res: Response, next: NextFunction) {
        try {
            res.status(200).send();
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
                errorManager.res(res, 'missing_body');
                return;
            }

            let email = req.body['email'];
            if (email == null) {
                errorManager.res(res, 'missing_email_param');
                return;
            }

            let name = req.body['name'];
            if (name == null) {
                errorManager.res(res, 'missing_name_param');
                return;
            }

            let password = req.body['password'];
            if (password == null) {
                errorManager.res(res, 'missing_password_param');
                return;
            }

            if ((await userService.getUserByEmail(email)) != null) {
                errorManager.res(res, 'duplicate_account');
                return;
            }

            let account = await accountService.createAccount(`${name}'s Organization`);

            if (account == null) {
                throw new Error('account_creation_failure');
            }

            let salt = crypto.randomBytes(16).toString('base64');
            let hashedPassword = (await util.promisify(crypto.pbkdf2)(password, salt, 310000, 32, 'sha256')).toString('base64');
            let user = await userService.createUser(email, name, hashedPassword, salt, account!.id);

            if (user == null) {
                throw new Error('user_creation_failure');
            }

            await accountService.editAccount(account!.id, account!.name, user.id);
            analytics.track('server:account_created', account.id, {}, isCloud() ? { email: email } : {});

            req.login(user, function (err) {
                if (err) {
                    return next(err);
                }

                res.status(200).send();
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new AuthController();
