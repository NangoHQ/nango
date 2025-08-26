import path from 'node:path';

import tracer from 'dd-trace';

import db from '@nangohq/database';
import { ErrorSourceEnum, LogActionEnum, accountService, environmentService, errorManager, getPlan, userService } from '@nangohq/shared';
import {
    Err,
    Ok,
    flagHasPlan,
    getLogger,
    isBasicAuthEnabled,
    isCloud,
    isTest,
    metrics,
    stringTimingSafeEqual,
    stringifyError,
    tagTraceUser
} from '@nangohq/utils';

import { envs } from '../env.js';
import { connectSessionTokenPrefix, connectSessionTokenSchema } from '../helpers/validation.js';
import * as connectSessionService from '../services/connectSession.service.js';

import type { RequestLocals } from '../utils/express.js';
import type { ConnectSession, DBEnvironment, DBPlan, DBTeam, EndUser } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('AccessMiddleware');

const keyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const ignoreEnvPaths = ['/api/v1/environments', '/api/v1/meta', '/api/v1/user', '/api/v1/user/name', '/api/v1/signin', '/api/v1/invite/:id'];

const deprecatedPublicAuthenticationCutoffDate = new Date('2025-08-25');

export class AccessMiddleware {
    private async validateSecretKey(secret: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
            plan: DBPlan | null;
        }>
    > {
        if (!keyRegex.test(secret)) {
            return Err('invalid_secret_key_format');
        }
        const result = await environmentService.getAccountAndEnvironmentBySecretKey(secret);
        if (!result) {
            return Err('unknown_user_account');
        }

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const planRes = await getPlan(db.knex, { accountId: result.account.id });
            if (planRes.isErr()) {
                return Err('plan_not_found');
            }
            plan = planRes.value;
        }

        return Ok({ ...result, plan });
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
            res.locals['plan'] = result.value.plan;
            tagTraceUser(result.value);
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_secret_key ${stringifyError(err)}`);
            span.setTag('error', err);
            errorManager.errRes(res, 'malformed_auth_header');
            return;
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_SECRET_KEY, Date.now() - start, { accountId: res.locals['account']?.id || 'unknown' });
            span.finish();
        }
    }

    private async validatePublicKey(publicKey: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
            plan: DBPlan | null;
        }>
    > {
        if (!keyRegex.test(publicKey)) {
            return Err('invalid_secret_key_format');
        }

        const result = await environmentService.getAccountAndEnvironmentByPublicKey(publicKey);
        if (!result) {
            return Err('unknown_user_account');
        }

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const planRes = await getPlan(db.knex, { accountId: result.account.id });
            if (planRes.isErr()) {
                return Err('plan_not_found');
            }
            plan = planRes.value;
        }

        return Ok({ ...result, plan });
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
            plan: DBPlan | null;
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

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const planRes = await getPlan(db.knex, { accountId: result.account.id });
            if (planRes.isErr()) {
                return Err('plan_not_found');
            }
            plan = planRes.value;
        }

        return Ok({
            account: result.account,
            environment: result.environment,
            connectSession: getConnectSession.value.connectSession,
            endUser: getConnectSession.value.endUser,
            plan
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
            res.locals['plan'] = result.value.plan;
            tagTraceUser(result.value);
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_connect_session ${stringifyError(err)}`);
            span.setTag('error', err);
            errorManager.errRes(res, 'unknown_account');
            return;
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_CONNECT_SESSION, Date.now() - start);
            span.finish();
        }
    }

    /**
     * This is the same as connectSessionAuth expect we check the body
     * Only used for /connect/telemetry because we use sendBeacon that does not accept headers
     */
    async connectSessionAuthBody(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('connectSessionAuth', {
            childOf: active!
        });

        const start = Date.now();
        try {
            const token = req.is('application/json') && req.body && req.body['token'];
            if (!token) {
                errorManager.errRes(res, 'missing_auth_header');
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
            res.locals['plan'] = result.value.plan;
            tagTraceUser(result.value);
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_connect_session ${stringifyError(err)}`);
            span.setTag('error', err);
            errorManager.errRes(res, 'unknown_account');
            return;
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
                res.locals['plan'] = secretKeyResult.value.plan;

                tagTraceUser(secretKeyResult.value);
            } else {
                res.locals['authType'] = 'connectSession';
                res.locals['account'] = connectSessionResult.value.account;
                res.locals['environment'] = connectSessionResult.value.environment;
                res.locals['connectSession'] = connectSessionResult.value.connectSession;
                res.locals['endUser'] = connectSessionResult.value.endUser;
                res.locals['plan'] = connectSessionResult.value.plan;
                tagTraceUser(connectSessionResult.value);
            }
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_connect_session_or_secret ${stringifyError(err)}`);
            span.setTag('error', err);
            errorManager.errRes(res, 'unknown_account');
            return;
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
                res.locals['plan'] = connectSessionResult.value.plan;
                tagTraceUser(connectSessionResult.value);

                metrics.increment(metrics.Types.AUTH_WITH_CONNECT_SESSION);
            } else {
                const publicKey = req.query['public_key'] as string;

                if (!publicKey) {
                    errorManager.errRes(res, 'missing_public_key');
                    return;
                }

                if (!keyRegex.test(publicKey)) {
                    errorManager.errRes(res, 'invalid_public_key');
                    return;
                }

                const result = await this.validatePublicKey(publicKey);
                if (result.isErr()) {
                    errorManager.errRes(res, result.error.message);
                    return;
                }

                if (result.value.account.created_at > deprecatedPublicAuthenticationCutoffDate) {
                    res.status(401).send({
                        error: {
                            code: 'deprecated_authentication',
                            message: 'Public key authentication is deprecated. Please use connect session authentication instead.'
                        }
                    });
                    return;
                }

                res.locals['authType'] = 'publicKey';
                res.locals['account'] = result.value.account;
                res.locals['environment'] = result.value.environment;
                res.locals['plan'] = result.value.plan;
                tagTraceUser(result.value);

                metrics.increment(metrics.Types.AUTH_WITH_PUBLIC_KEY);
            }
            next();
        } catch (err) {
            errorManager.report(err, { source: ErrorSourceEnum.PLATFORM, operation: LogActionEnum.INTERNAL_AUTHORIZATION });
            span.setTag('error', err);
            errorManager.errRes(res, 'unknown_account');
            return;
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_CONNECT_SESSION_OR_PUBLIC_KEY, Date.now() - start);
            span.finish();
        }
    }

    /**
     * Test authentication that accepts both secret key and session authentication
     * This allows tests to use either authentication method
     */
    async testAuth(req: Request, res: Response<any, RequestLocals>, next: NextFunction) {
        if (!isTest) {
            res.status(401).send({ error: { code: 'unauthorized', message: 'testAuth is only available in test environment' } });
            return;
        }

        try {
            // First try session authentication
            if (req.isAuthenticated()) {
                res.locals['authType'] = 'session';
                await fillLocalsFromSession(req, res, next);
                return;
            }

            // If no session, try secret key authentication
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
            res.locals['plan'] = result.value.plan;
            tagTraceUser(result.value);
            next();
        } catch (err) {
            console.error(err);
            res.status(401).send({ error: { code: 'unauthorized' } });
        }
    }

    admin(req: Request, res: Response, next: NextFunction) {
        if (!isCloud) {
            errorManager.errRes(res, 'only_nango_cloud');
            return;
        }

        const adminKey = process.env['NANGO_ADMIN_KEY'];

        if (!adminKey) {
            errorManager.errRes(res, 'admin_key_configuration');
            return;
        }

        const authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            errorManager.errRes(res, 'missing_auth_header');
            return;
        }

        const candidateKey = authorizationHeader.split('Bearer ').pop();
        if (candidateKey !== adminKey) {
            errorManager.errRes(res, 'invalid_admin_key');
            return;
        }

        next();
    }

    internal(req: Request, res: Response, next: NextFunction) {
        const key = envs.NANGO_INTERNAL_API_KEY;

        if (!key) {
            errorManager.errRes(res, 'internal_private_key_configuration');
            return;
        }

        const authorizationHeader = req.get('authorization');

        if (!authorizationHeader) {
            errorManager.errRes(res, 'missing_auth_header');
            return;
        }

        const receivedKey = authorizationHeader.split('Bearer ').pop();
        if (!receivedKey || !stringTimingSafeEqual(receivedKey, key)) {
            errorManager.errRes(res, 'invalid_internal_private_key');
            return;
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

        const account = await accountService.getAccountById(db.knex, user.account_id);
        if (!account) {
            res.status(401).send({ error: { code: 'unknown_account' } });
            return;
        }

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const planRes = await getPlan(db.knex, { accountId: user.account_id });
            if (planRes.isErr()) {
                res.status(401).send({ error: { code: 'plan_not_found' } });
                return;
            }
            plan = planRes.value;
        }

        res.locals['user'] = user;
        res.locals['account'] = account;
        res.locals['plan'] = plan;

        const fullPath = path.join(req.baseUrl, req.route.path);
        if (ignoreEnvPaths.includes(fullPath)) {
            next();
            return;
        }

        const currentEnv = req.query['env'];
        if (typeof currentEnv !== 'string') {
            res.status(401).send({ error: { code: 'invalid_env' } });
            return;
        }

        const environment = await environmentService.getByEnvironmentName(account.id, currentEnv);
        if (!environment) {
            res.status(401).send({ error: { code: 'unknown_account_or_env' } });
            return;
        }

        res.locals['environment'] = environment;
        tagTraceUser({ account, environment, plan });
        next();
    } catch (err) {
        errorManager.report(err);
        res.status(500).send({ error: { code: 'failed_to_fill_session' } });
        return;
    }
}

export default new AccessMiddleware();
