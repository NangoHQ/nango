import type { Request, Response } from 'express';
import accountService from '../services/account.service.js';
import type { Account } from '../models.js';
import type { NextFunction } from 'express';
import analytics from '../utils/analytics.js';
import errorManager from '../utils/error.manager.js';

class AccountController {
    async createAccount(req: Request, res: Response, next: NextFunction) {
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

            if ((await accountService.getAccountByEmail(email)) != null) {
                errorManager.res(res, 'duplicate_account');
                return;
            }

            let account: Account | null = await accountService.createAccount(email);

            if (account == null) {
                throw new Error('account_creation_failure');
            }

            analytics.identify(account.id, account.email);
            analytics.track('server:account_created', account.id);
            res.status(200).send({ account: account });
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
