import type { Request, Response, NextFunction } from 'express';
import { isCloud, isBasicAuthEnabled, getLogger, metrics, stringifyError } from '@nangohq/utils';
import { LogActionEnum, ErrorSourceEnum, environmentService, errorManager, userService } from '@nangohq/shared';
import { NANGO_ADMIN_UUID } from '../controllers/account.controller.js';
import tracer from 'dd-trace';
import type { RequestLocals } from '../utils/express.js';

const logger = getLogger('AccessMiddleware');

const keyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const ignoreEnvPaths = ['/api/v1/meta', '/api/v1/user', '/api/v1/user/name', '/api/v1/users/:userId/suspend', '/api/v1/signin'];

export class AccessMiddleware {
    async secretKeyAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('secretKeyAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                return errorManager.errRes(res, 'missing_auth_header');
            }

            const secret = authorizationHeader.split('Bearer ').pop();

            if (!secret) {
                return errorManager.errRes(res, 'malformed_auth_header');
            }

            if (!keyRegex.test(secret)) {
                return errorManager.errRes(res, 'invalid_secret_key_format');
            }

            const result = await environmentService.getAccountAndEnvironmentBySecretKey(secret);
            if (!result) {
                res.status(401).send({ error: { code: 'unknown_user_account' } });
                return;
            }

            res.locals['authType'] = 'secretKey';
            res.locals['account'] = result.account;
            res.locals['environment'] = result.environment;
            tracer.setUser({ id: String(result.account.id), environmentId: String(result.environment.id) });
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_secret_key ${stringifyError(err)}`);
            return errorManager.errRes(res, 'malformed_auth_header');
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_SECRET_KEY, Date.now() - start);
            span.finish();
        }
    }

    /**
     * Inherit secretKeyAuth
     */
    adminKeyAuth(_: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        if (res.locals['account']?.uuid !== NANGO_ADMIN_UUID) {
            res.status(401).send({ error: { code: 'unauthorized' } });
            return;
        }

        res.locals['authType'] = 'adminKey';
        next();
    }

    async publicKeyAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('publicKeyAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const publicKey = req.query['public_key'] as string;

            if (!publicKey) {
                return errorManager.errRes(res, 'missing_public_key');
            }

            if (!keyRegex.test(publicKey)) {
                return errorManager.errRes(res, 'invalid_public_key');
            }

            const result = await environmentService.getAccountAndEnvironmentByPublicKey(publicKey);
            if (!result) {
                res.status(401).send({ error: { code: 'unknown_user_account' } });
                return;
            }

            res.locals['authType'] = 'publicKey';
            res.locals['account'] = result.account;
            res.locals['environment'] = result.environment;
            tracer.setUser({ id: String(result.account.id), environmentId: String(result.environment.id) });
            next();
        } catch (e) {
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.INTERNAL_AUTHORIZATION });
            return errorManager.errRes(res, 'unknown_account');
        } finally {
            metrics.duration(metrics.Types.AUTH_PUBLIC_KEY, Date.now() - start);
            span.finish();
        }
    }

    async sessionAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('sessionAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            if (!req.isAuthenticated()) {
                res.status(401).send({ error: { code: 'unauthorized' } });
                return;
            }

            if (ignoreEnvPaths.includes(req.route.path)) {
                next();
                return;
            }

            res.locals['authType'] = 'session';
            await fillLocalsFromSession(req, res, next);
        } finally {
            metrics.duration(metrics.Types.AUTH_SESSION, Date.now() - start);
            span.finish();
        }
    }

    async noAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        if (!req.isAuthenticated()) {
            const user = await userService.getUserById(process.env['LOCAL_NANGO_USER_ID'] ? parseInt(process.env['LOCAL_NANGO_USER_ID']) : 0);

            req.login(user!, function (err) {
                if (err) {
                    return next(err);
                }

                next();
            });
            return;
        }

        res.locals['authType'] = 'none';
        await fillLocalsFromSession(req, res, next);
    }

    async basicAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        // Already signed in.
        if (req.isAuthenticated()) {
            await fillLocalsFromSession(req, res, next);
            res.locals['authType'] = 'basic';
            return;
        }

        // Protected by basic auth: should be signed in.
        if (isBasicAuthEnabled) {
            res.status(401).send({ error: { code: 'unauthorized' } });
            return;
        }
    }

    admin(req: Request, res: Response, next: NextFunction) {
        if (!isCloud) {
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

/**
 * Fill res.locals with common information
 */
async function fillLocalsFromSession(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
    if (ignoreEnvPaths.includes(req.route.path)) {
        next();
        return;
    }

    try {
        const user = await userService.getUserById(req.user!.id);
        if (!user) {
            res.status(401).send({ error: { code: 'unknown_user' } });
            return;
        }

        const currentEnv = req.query['env'];
        if (typeof currentEnv !== 'string') {
            res.status(401).send({ error: { code: 'invalid_env' } });
            return;
        }

        const result = await environmentService.getAccountAndEnvironment({ accountId: user.account_id, envName: currentEnv });
        if (!result) {
            res.status(401).send({ error: { code: 'unknown_account_or_env' } });
            return;
        }

        res.locals['user'] = req.user!;
        res.locals['account'] = result.account;
        res.locals['environment'] = result.environment;
        next();
    } catch {
        res.status(401).send({ error: { code: 'unknown_key' } });
        return;
    }
}

export default new AccessMiddleware();
