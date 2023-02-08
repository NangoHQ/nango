import type { Request, Response } from 'express';
import accountService from '../services/account.service.js';
import type { Account } from '../models.js';
import type { NextFunction } from 'express';
import analytics from '../utils/analytics.js';

class AccountController {
    async createAccount(req: Request, res: Response, next: NextFunction) {
        try {
            if (req.body == null) {
                res.status(400).send({ error: `Missing request body.` });
                return;
            }

            let email = req.body['email'];
            if (email == null) {
                res.status(400).send({ error: `Missing param email.` });
                return;
            }

            if ((await accountService.getAccountByEmail(email)) != null) {
                res.status(400).send({ error: `Email already exists.` });
                return;
            }

            let account: Account | null = await accountService.createAccount(email);

            if (account == null) {
                res.status(400).send({ error: `Account creating failed for an unknown reason.` });
                return;
            }

            analytics.track('server:account_created', account.id);
            res.status(200).send({ account: account });
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
