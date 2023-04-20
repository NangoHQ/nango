import type { Request, Response, NextFunction } from 'express';
import accountService from '../services/account.service.js';
import { getUserAndAccountFromSession, isCloud, getOauthCallbackUrl } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

class AccountController {
    async getAccount(req: Request, res: Response, next: NextFunction) {
        try {
            let account = (await getUserAndAccountFromSession(req)).account;

            if (!isCloud()) {
                account.callback_url = await getOauthCallbackUrl();
                account.secret_key = process.env['NANGO_SECRET_KEY'] || '(none)';
            }

            res.status(200).send({ account: account });
        } catch (err) {
            next(err);
        }
    }

    async updateCallback(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (req.body['callback_url'] == null) {
                errorManager.errRes(res, 'missing_callback_url');
                return;
            }

            let account = (await getUserAndAccountFromSession(req)).account;

            await accountService.editAccountCallbackUrl(req.body['callback_url'], account.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
