import type { Request, Response, NextFunction } from 'express';
import { environmentService, errorManager, getBaseUrl } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class AccountController {
    async getAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const { environment } = await getUserAccountAndEnvironmentFromSession(req);

            // TODO KJG verify
            //if (!isCloud()) {
            //environment.callback_url = await getOauthCallbackUrl();
            //environment.secret_key = process.env['NANGO_SECRET_KEY'] || '(none)';
            //environment.websockets_path = getWebsocketsPath();
            //}

            res.status(200).send({ account: { ...environment, host: getBaseUrl() } });
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

            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;

            await environmentService.editCallbackUrl(req.body['callback_url'], environment.id);
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

            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;

            await environmentService.editWebhookUrl(req.body['webhook_url'], environment.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
