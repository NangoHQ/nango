import type { Request, Response, NextFunction } from 'express';
import accountService from '../services/account.service.js';
import { getUserFromSession } from '../utils/utils.js';

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
}

export default new AccountController();
