import type { Request, Response, NextFunction } from 'express';
import {
    LogActionEnum,
    ErrorSourceEnum,
    environmentService,
    isCloud,
    setAccount,
    setEnvironmentId,
    isBasicAuthEnabled,
    errorManager,
    userService
} from '@nangohq/shared';
import tracer from '../tracer.js';

export class AccessMiddleware {
    async secretKeyAuth(req: Request, res: Response, next: NextFunction) {
        const authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            return errorManager.errRes(res, 'missing_auth_header');
        }

        const secret = authorizationHeader.split('Bearer ').pop();

        if (!secret) {
            return errorManager.errRes(res, 'malformed_auth_header');
        }

        if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(secret)) {
            return errorManager.errRes(res, 'invalid_secret_key_format');
        }

        let accountId: number | null;
        let environmentId: number | null;
        try {
            const result = await environmentService.getAccountIdAndEnvironmentIdBySecretKey(secret);
            accountId = result?.accountId as number;
            environmentId = result?.environmentId as number;
        } catch (_) {
            return errorManager.errRes(res, 'malformed_auth_header');
        }

        if (accountId == null) {
            return errorManager.errRes(res, 'unknown_account');
        }

        setAccount(accountId, res);
        setEnvironmentId(environmentId, res);
        tracer.setUser({ id: accountId.toString(), environmentId: environmentId.toString() });
        next();
    }

    async publicKeyAuth(req: Request, res: Response, next: NextFunction) {
        const publicKey = req.query['public_key'] as string;

        if (!publicKey) {
            return errorManager.errRes(res, 'missing_public_key');
        }

        if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(publicKey)) {
            return errorManager.errRes(res, 'invalid_public_key');
        }

        let accountId: number | null | undefined;
        let environmentId: number | null | undefined;
        try {
            const result = await environmentService.getAccountIdAndEnvironmentIdByPublicKey(publicKey);
            accountId = result?.accountId as number;
            environmentId = result?.environmentId as number;
        } catch (e) {
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.INTERNAL_AUTHORIZATION });
            return errorManager.errRes(res, 'unknown_account');
        }

        if (accountId == null) {
            return errorManager.errRes(res, 'unknown_account');
        }

        setAccount(accountId, res);
        setEnvironmentId(environmentId, res);
        tracer.setUser({ id: accountId.toString(), environmentId: environmentId.toString() });
        next();
    }

    async sessionAuth(req: Request, res: Response, next: NextFunction) {
        if (!req.isAuthenticated()) {
            res.status(401).send({ error: 'Not authenticated.' });
            return;
        }

        next();
    }

    async noAuth(req: Request, _: Response, next: NextFunction) {
        if (!req.isAuthenticated()) {
            const user = await userService.getUserById(process.env['LOCAL_NANGO_USER_ID'] ? parseInt(process.env['LOCAL_NANGO_USER_ID']) : 0);

            req.login(user!, function (err) {
                if (err) {
                    return next(err);
                }

                next();
            });
        } else {
            next();
        }
    }

    async basicAuth(req: Request, res: Response, next: NextFunction) {
        // Already signed in.
        if (req.isAuthenticated()) {
            next();
            return;
        }

        // Protected by basic auth: should be signed in.
        if (isBasicAuthEnabled()) {
            res.status(401).send({ error: 'Not authenticated.' });
            return;
        }
    }

    admin(req: Request, res: Response, next: NextFunction) {
        if (!isCloud()) {
            return errorManager.errRes(res, 'only_nango_cloud');
        }

        const adminKey = process.env['NANGO_ADMIN_KEY'];

        if (!adminKey) {
            return errorManager.errRes(res, 'admin_key_configuration');
        }

        const authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            return errorManager.errRes(res, 'missing_auth_header');
        }

        const candidateKey = authorizationHeader.split('Bearer ').pop();
        if (candidateKey !== adminKey) {
            return errorManager.errRes(res, 'invalid_admin_key');
        }

        next();
    }
}

export default new AccessMiddleware();
