import type { Request, Response, NextFunction } from 'express';
import accountService from '../services/account.service.js';
import type { Account } from '../models.js';
import { isCloud, setAccount } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

export class AccessMiddleware {
    async secret(req: Request, res: Response, next: NextFunction) {
        if (isCloud()) {
            let authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                errorManager.res(res, 'missing_auth_header');
                return;
            }

            let secret = authorizationHeader.split('Bearer ').pop();

            if (!secret) {
                errorManager.res(res, 'malformed_auth_header');
                return;
            }

            var account: Account | null;
            try {
                account = await accountService.getAccountBySecretKey(secret);
            } catch (_) {
                errorManager.res(res, 'malformed_auth_header');
                return;
            }

            if (account == null) {
                errorManager.res(res, 'unkown_account');
                return;
            }

            setAccount(account.id, res);
            next();
        } else {
            setAccount(0, res);

            const secretKey = process.env['NANGO_SECRET_KEY'];

            if (!secretKey) {
                next();
                return;
            }

            const authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                errorManager.res(res, 'missing_auth_header');
                return;
            }

            const { providedUser } = this.fromBasicAuth(authorizationHeader);

            if (providedUser !== secretKey) {
                errorManager.res(res, 'invalid_secret_key');
                return;
            }

            next();
        }
    }

    async public(req: Request, res: Response, next: NextFunction) {
        if (isCloud()) {
            let publicKey = req.query['public_key'] as string;

            if (!publicKey) {
                errorManager.res(res, 'missing_public_key');
                return;
            }

            let account: Account | null = await accountService.getAccountByPublicKey(publicKey);

            if (account == null) {
                errorManager.res(res, 'unkown_account');
                return;
            }

            setAccount(account.id, res);
            next();
        } else {
            setAccount(0, res);
            next();
        }
    }

    admin(req: Request, res: Response, next: NextFunction) {
        if (!isCloud()) {
            errorManager.res(res, 'only_nango_cloud');
            return;
        }

        const adminKey = process.env['NANGO_ADMIN_KEY'];

        if (!adminKey) {
            errorManager.res(res, 'admin_key_configuration');
            return;
        }

        let authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            errorManager.res(res, 'missing_auth_header');
            return;
        }

        let candidateKey = authorizationHeader.split('Bearer ').pop();
        if (candidateKey !== adminKey) {
            errorManager.res(res, 'invalid_admin_key');
            return;
        }

        next();
    }

    private fromBasicAuth(authorizationHeader: string) {
        const basicAsBase64 = authorizationHeader.split('Basic ').pop() || '';
        const basicAsBuffer = Buffer.from(basicAsBase64, 'base64');
        const basicAsString = basicAsBuffer.toString('utf-8');

        const providedCredentials = basicAsString.split(':');
        const providedUser: string = providedCredentials.shift() || '';
        const providedPassword: string = providedCredentials.shift() || '';

        return { providedUser, providedPassword };
    }
}

export default new AccessMiddleware();
