import type { Request, Response, NextFunction } from 'express';
import type { Result } from '@nangohq/utils';
import { isCloud, isBasicAuthEnabled, getLogger, metrics, stringifyError, Err, Ok, stringTimingSafeEqual } from '@nangohq/utils';
import { LogActionEnum, ErrorSourceEnum, environmentService, errorManager, userService } from '@nangohq/shared';
import db from '@nangohq/database';
import * as connectSessionService from '../services/connectSession.service.js';
import { NANGO_ADMIN_UUID } from '../controllers/account.controller.js';
import tracer from 'dd-trace';
import type { RequestLocals } from '../utils/express.js';
import type { ConnectSession, DBEnvironment, DBTeam, EndUser } from '@nangohq/types';
import { connectSessionTokenSchema, connectSessionTokenPrefix } from '../helpers/validation.js';
import { envs } from '../env.js';

const logger = getLogger('AccessMiddleware');

const keyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const ignoreEnvPaths = ['/api/v1/environments', '/api/v1/meta', '/api/v1/user', '/api/v1/user/name', '/api/v1/signin', '/api/v1/invite/:id'];

export class AccessMiddleware {
    private async validateSecretKey(secret: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
        }>
    > {
        if (!keyRegex.test(secret)) {
            return Err('invalid_secret_key_format');
        }
        const result = await environmentService.getAccountAndEnvironmentBySecretKey(secret);
        if (!result) {
            return Err('unknown_user_account');
        }
        return Ok(result);
    }

    async secretKeyAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('secretKeyAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                errorManager.errRes(res, 'missing_auth_header');
                return;
            }

            const secret = authorizationHeader.split('Bearer ').pop();

            if (!secret) {
                errorManager.errRes(res, 'malformed_auth_header');
                return;
            }
            const result = await this.validateSecretKey(secret);
            if (result.isErr()) {
                errorManager.errRes(res, result.error.message);
                return;
            }

            res.locals['authType'] = 'secretKey';
            res.locals['account'] = result.value.account;
            res.locals['environment'] = result.value.environment;
            tracer.setUser({ id: String(result.value.account.id), environmentId: String(result.value.environment.id) });
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_secret_key ${stringifyError(err)}`);
            span.setTag('error', err);
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

    private async validatePublicKey(publicKey: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
        }>
    > {
        if (!keyRegex.test(publicKey)) {
            return Err('invalid_secret_key_format');
        }
        const result = await environmentService.getAccountAndEnvironmentByPublicKey(publicKey);
        if (!result) {
            return Err('unknown_user_account');
        }
        return Ok(result);
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

            res.locals['authType'] = 'session';

            await fillLocalsFromSession(req, res, next);
        } finally {
            metrics.duration(metrics.Types.AUTH_SESSION, Date.now() - start);
            span.finish();
        }
    }

    async noAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        res.locals['authType'] = 'none';
        if (!req.isAuthenticated()) {
            const user = await userService.getUserById(process.env['LOCAL_NANGO_USER_ID'] ? parseInt(process.env['LOCAL_NANGO_USER_ID']) : 0);
            if (!user) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to find user in no-auth mode' } });
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            req.login(user, async function (err) {
                if (err) {
                    res.status(500).send({ error: { code: 'server_error', message: 'failed to no-auth' } });
                    return;
                }

                await fillLocalsFromSession(req, res, next);
            });
            return;
        }

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

    private async validateConnectSessionToken(token: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
            connectSession: ConnectSession;
            endUser: EndUser;
        }>
    > {
        const parsedToken = connectSessionTokenSchema.safeParse(token);
        if (!parsedToken.success) {
            return Err('invalid_connect_session_token_format');
        }

        const getConnectSession = await connectSessionService.getConnectSessionByToken(db.knex, token);
        if (getConnectSession.isErr()) {
            return Err('unknown_connect_session_token');
        }

        const result = await environmentService.getAccountAndEnvironment({
            environmentId: getConnectSession.value.connectSession.environmentId
        });
        if (!result) {
            return Err('unknown_account');
        }

        return Ok({
            account: result.account,
            environment: result.environment,
            connectSession: getConnectSession.value.connectSession,
            endUser: getConnectSession.value.endUser
        });
    }

    async connectSessionAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('connectSessionAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const authorizationHeader = req.get('authorization');
            if (!authorizationHeader) {
                errorManager.errRes(res, 'missing_auth_header');
                return;
            }

            const token = authorizationHeader.split('Bearer ').pop();
            if (!token) {
                errorManager.errRes(res, 'malformed_auth_header');
                return;
            }

            const result = await this.validateConnectSessionToken(token);
            if (result.isErr()) {
                errorManager.errRes(res, result.error.message);
                return;
            }

            res.locals['authType'] = 'connectSession';
            res.locals['account'] = result.value.account;
            res.locals['environment'] = result.value.environment;
            res.locals['connectSession'] = result.value.connectSession;
            res.locals['endUser'] = result.value.endUser;
            tracer.setUser({
                id: String(result.value.account.id),
                environmentId: String(result.value.environment.id),
                connectSessionId: String(result.value.connectSession.id)
            });
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_connect_session ${stringifyError(err)}`);
            span.setTag('error', err);
            return errorManager.errRes(res, 'unknown_account');
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_CONNECT_SESSION, Date.now() - start);
            span.finish();
        }
    }

    async connectSessionOrSecretKeyAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('connectSessionOrSecretKeyAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const authorizationHeader = req.get('authorization');

            if (!authorizationHeader) {
                errorManager.errRes(res, 'missing_auth_header');
                return;
            }

            const token = authorizationHeader.split('Bearer ').pop();

            if (!token) {
                errorManager.errRes(res, 'malformed_auth_header');
                return;
            }

            const connectSessionResult = await this.validateConnectSessionToken(token);

            if (connectSessionResult.isErr()) {
                // if token is prefixed with connect session token prefix we do not try to validate it as secret key
                if (token.startsWith(connectSessionTokenPrefix)) {
                    errorManager.errRes(res, connectSessionResult.error.message);
                    return;
                }

                const secretKeyResult = await this.validateSecretKey(token);
                if (secretKeyResult.isErr()) {
                    errorManager.errRes(res, secretKeyResult.error.message);
                    return;
                }

                res.locals['authType'] = 'secretKey';
                res.locals['account'] = secretKeyResult.value.account;
                res.locals['environment'] = secretKeyResult.value.environment;
                tracer.setUser({
                    id: String(secretKeyResult.value.account.id),
                    environmentId: String(secretKeyResult.value.environment.id)
                });
            } else {
                res.locals['authType'] = 'connectSession';
                res.locals['account'] = connectSessionResult.value.account;
                res.locals['environment'] = connectSessionResult.value.environment;
                res.locals['connectSession'] = connectSessionResult.value.connectSession;
                res.locals['endUser'] = connectSessionResult.value.endUser;
                tracer.setUser({
                    id: String(connectSessionResult.value.account.id),
                    environmentId: String(connectSessionResult.value.environment.id),
                    connectSessionId: String(connectSessionResult.value.connectSession.id)
                });
            }
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_connect_session_or_secret ${stringifyError(err)}`);
            span.setTag('error', err);
            return errorManager.errRes(res, 'unknown_account');
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_CONNECT_SESSION_OR_SECRET_KEY, Date.now() - start);
            span.finish();
        }
    }

    async connectSessionOrPublicKeyAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('connectSessionOrSecretKeyAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const token = req.query['connect_session_token'] as string;
            if (token) {
                const connectSessionResult = await this.validateConnectSessionToken(token);
                if (connectSessionResult.isErr()) {
                    errorManager.errRes(res, connectSessionResult.error.message);
                    return;
                }
                res.locals['authType'] = 'connectSession';
                res.locals['account'] = connectSessionResult.value.account;
                res.locals['environment'] = connectSessionResult.value.environment;
                res.locals['connectSession'] = connectSessionResult.value.connectSession;
                res.locals['endUser'] = connectSessionResult.value.endUser;
                tracer.setUser({
                    id: String(connectSessionResult.value.account.id),
                    environmentId: String(connectSessionResult.value.environment.id),
                    connectSessionId: String(connectSessionResult.value.connectSession.id)
                });
            } else {
                const publicKey = req.query['public_key'] as string;

                if (!publicKey) {
                    return errorManager.errRes(res, 'missing_public_key');
                }

                if (!keyRegex.test(publicKey)) {
                    return errorManager.errRes(res, 'invalid_public_key');
                }

                const result = await this.validatePublicKey(publicKey);
                if (result.isErr()) {
                    errorManager.errRes(res, result.error.message);
                    return;
                }
                res.locals['authType'] = 'publicKey';
                res.locals['account'] = result.value.account;
                res.locals['environment'] = result.value.environment;
                tracer.setUser({ id: String(result.value.account.id), environmentId: String(result.value.environment.id) });
            }
            next();
        } catch (err) {
            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.INTERNAL_AUTHORIZATION });
            span.setTag('error', err);
            return errorManager.errRes(res, 'unknown_account');
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_CONNECT_SESSION_OR_PUBLIC_KEY, Date.now() - start);
            span.finish();
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

    internal(req: Request, res: Response, next: NextFunction) {
        const key = envs.NANGO_INTERNAL_API_KEY;

        if (!key) {
            return errorManager.errRes(res, 'internal_private_key_configuration');
        }

        const authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            return errorManager.errRes(res, 'missing_auth_header');
        }

        const receivedKey = authorizationHeader.split('Bearer ').pop();
        if (!receivedKey || !stringTimingSafeEqual(receivedKey, key)) {
            return errorManager.errRes(res, 'invalid_internal_private_key');
        }

        next();
    }
}

/**
 * Fill res.locals with common information
 */
async function fillLocalsFromSession(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
    try {
        const user = await userService.getUserById(req.user!.id);
        if (!user) {
            res.status(401).send({ error: { code: 'unknown_user' } });
            return;
        }

        res.locals['user'] = user;

        if (ignoreEnvPaths.includes(req.route.path)) {
            next();
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

        res.locals['account'] = result.account;
        res.locals['environment'] = result.environment;
        next();
    } catch (err) {
        errorManager.report(err);
        res.status(500).send({ error: { code: 'failed_to_fill_session' } });
        return;
    }
}

export default new AccessMiddleware();
