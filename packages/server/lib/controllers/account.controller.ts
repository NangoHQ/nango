import type { Request, Response, NextFunction } from 'express';
import { accountService, errorManager, isCloud, getBaseUrl } from '@nangohq/shared';
import { getOauthCallbackUrl, getUserAndAccountFromSession } from '../utils/utils.js';

class AccountController {
    async getAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const account = (await getUserAndAccountFromSession(req)).account;

            if (!isCloud()) {
                account.callback_url = await getOauthCallbackUrl();
                account.secret_key = process.env['NANGO_SECRET_KEY'] || '(none)';
            }

            account.host = getBaseUrl();

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

            const account = (await getUserAndAccountFromSession(req)).account;

            await accountService.editAccountCallbackUrl(req.body['callback_url'], account.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async updateWebhookURL(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.body) {
                errorManager.errRes(res, 'missing_body');
                return;
            }

            if (!req.body['webhook_url']) {
                errorManager.errRes(res, 'missing_webhook_url');
                return;
            }

            const account = (await getUserAndAccountFromSession(req)).account;

            await accountService.editAccountWebhookUrl(req.body['webhook_url'], account.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
