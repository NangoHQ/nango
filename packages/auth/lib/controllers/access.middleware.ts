import type { Request, Response, NextFunction } from 'express';
import accountService from '../services/account.service.js';
import type { Account } from '../models.js';
import { isCloud, setAccount } from '../utils/utils.js';

export class AccessMiddleware {
    async secret(req: Request, res: Response, next: NextFunction) {
        if (isCloud()) {
            let authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                res.status(401).send({ error: 'Authentication failed. The request is missing a valid secret key.' });
                return;
            }

            let secret = authorizationHeader.split('Bearer ').pop();

            if (!secret) {
                res.status(401).send({ error: 'Authentication failed. The Authorization header is malformed.' });
                return;
            }

            var account: Account | null;
            try {
                account = await accountService.getAccountBySecret(secret);
            } catch (_) {
                res.status(401).send({ error: 'Authentication failed. The Authorization header is malformed.' });
                return;
            }

            if (account == null) {
                res.status(401).send({ error: 'Authentication failed. The provided secret does not match any account.' });
                return;
            }

            setAccount(account.id, res);
            next();
        } else {
            const secretKey = process.env['NANGO_SECRET_KEY'];

            if (!secretKey) {
                next();
                return;
            }

            const authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                res.status(401).send({ error: 'Authentication failed. The request is missing a valid secret key.' });
                return;
            }

            const { providedUser } = this.fromBasicAuth(authorizationHeader);

            if (providedUser !== secretKey) {
                res.status(401).send({ error: 'Authentication failed. The provided secret key is invalid.' });
                return;
            }

            setAccount(0, res);
            next();
        }
    }

    async public(req: Request, res: Response, next: NextFunction) {
        if (isCloud()) {
            let publicKey = req.query['public_key'] as string;

            if (!publicKey) {
                res.status(401).send({ error: 'Authentication failed. The Authorization header is malformed.' });
                return;
            }

            let account: Account | null = await accountService.getAccountByPublicKey(publicKey);

            if (account == null) {
                res.status(401).send({ error: 'Authentication failed. The provided public key does not match any account.' });
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
            res.status(401).send({ error: 'This endpoint is only available for Nango Cloud.' });
            return;
        }

        const adminKey = process.env['NANGO_ADMIN_KEY'];

        if (!adminKey) {
            next();
            return;
        }

        let authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            res.status(401).send({ error: 'Authentication failed. The request is missing a valid admin secret key.' });
            return;
        }

        let candidateKey = authorizationHeader.split('Bearer ').pop();
        if (candidateKey !== adminKey) {
            res.status(401).send({ error: 'Authentication failed. The provided admin secret key is invalid.' });
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
