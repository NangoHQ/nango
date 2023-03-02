import type { Request, Response, NextFunction } from 'express';
import accountService from '../services/account.service.js';
import { getUserFromSession } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

class AccountController {
    async getAccount(req: Request, res: Response, next: NextFunction) {
        try {
            let user = await getUserFromSession(req);

            if (user == null) {
                throw new Error('user_not_found');
            }

            let account = await accountService.getAccountById(user.account_id);

            if (account == null) {
                throw new Error('account_not_found');
            }

            res.status(200).send({ account: account });
        } catch (err) {
            next(err);
        }
    }

    async updateCallback(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                errorManager.res(res, 'missing_body');
                return;
            }

            if (req.body['callback_url'] == null) {
                errorManager.res(res, 'missing_callback_url');
                return;
            }

            let user = await getUserFromSession(req);

            if (user == null) {
                throw new Error('user_not_found');
            }

            await accountService.editAccountCallbackUrl(req.body['callback_url'], user.account_id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
