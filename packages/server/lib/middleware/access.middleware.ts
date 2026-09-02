import path from 'node:path';

import tracer from 'dd-trace';

import db from '@nangohq/database';
import { accountService, environmentService, errorManager, ErrorSourceEnum, getPlan, isSandboxApiKey, LogActionEnum, userService } from '@nangohq/shared';
import {
    Err,
    flagHasPlan,
    getLogger,
    isBasicAuthEnabled,
    isCloud,
    isTest,
    metrics,
    Ok,
    stringifyError,
    stringTimingSafeEqual,
    tagTraceUser
} from '@nangohq/utils';

import { envs } from '../env.js';
import { agentSessionTokenSchema, connectSessionTokenPrefix, connectSessionTokenSchema } from '../helpers/validation.js';
import * as agentSessionService from '../services/agentSession.service.js';
import * as connectSessionService from '../services/connectSession.service.js';

import type { RequestLocals } from '../utils/express.js';
import type { AgentSession, ApiKeyContext, ApiKeyPrincipal, ConnectSession, DBAPISecret, DBEnvironment, DBPlan, DBTeam, InternalEndUser } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('AccessMiddleware');

const keyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const ignoreEnvPaths = [
    '/api/v1/environments',
    '/api/v1/meta',
    '/api/v1/audit-trail',
    '/api/v1/audit-trail/export',
    '/api/v1/user',
    '/api/v1/user/name',
    '/api/v1/user/password',
    '/api/v1/signin',
    '/api/v1/invite/:id',
    '/api/v1/account/onboarding/hear-about-us',
    '/api/v1/account/onboarding/account-discovery',
    '/api/v1/account/onboarding/request-invite',
    '/api/v1/account/mfa',
    '/api/v1/account/mfa/enroll',
    '/api/v1/account/mfa/activate',
    '/api/v1/account/mfa/recovery-codes',
    '/api/v1/account/api-keys',
    '/api/v1/account/api-keys/:keyId',
    '/api/v1/plain'
];

export class AccessMiddleware {
    private async validateApiKey(secret: string, opts: { isScript: boolean }): Promise<Result<ApiKeyContext>> {
        const isSandboxApiKeyToken = isSandboxApiKey(secret);

        if (!keyRegex.test(secret) && !isSandboxApiKeyToken) {
            return Err('invalid_secret_key_format');
        }

        const accountContext = await accountService.getAccountContextByApiKey(
            isSandboxApiKeyToken || !opts.isScript ? { secretKey: secret } : { internalSecretKey: secret }
        );
        if (!accountContext) {
            return Err('unknown_account');
        }

        if (flagHasPlan && !accountContext.plan) {
            return Err('plan_not_found');
        }

        return Ok({ ...accountContext });
    }

    private setApiKeyLocals(res: Response<any, Partial<RequestLocals>>, context: ApiKeyContext): void {
        res.locals['authType'] = 'secretKey';
        res.locals['account'] = context.account;
        res.locals['plan'] = context.plan;
        res.locals['apiKeyPrincipal'] = context.principal;
        res.locals['apiKeyAuthSource'] = context.auth.source;

        if (context.environment) {
            res.locals['environment'] = context.environment;
        }
        if (context.secret) {
            res.locals['secret'] = context.secret;
        }
        if (context.auth.apiKeyId !== undefined) {
            res.locals['apiKeyId'] = context.auth.apiKeyId;
        }
        if (context.auth.apiKeyUuid !== undefined) {
            res.locals['apiKeyUuid'] = context.auth.apiKeyUuid;
        }
        if (context.auth.apiKeyDisplayName !== undefined) {
            res.locals['apiKeyDisplayName'] = context.auth.apiKeyDisplayName;
        }
        if (context.auth.purpose !== undefined) {
            res.locals['sandboxTokenPurpose'] = context.auth.purpose;
        }
        if (context.auth.dryrunId !== undefined) {
            res.locals['sandboxTokenDryrunId'] = context.auth.dryrunId;
        }
        if (context.auth.deploymentId !== undefined) {
            res.locals['sandboxTokenDeploymentId'] = context.auth.deploymentId;
        }
    }

    async secretKeyAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

            const isScript = req.get('Nango-Is-Script') === 'true';

            const result = await this.validateApiKey(secret, { isScript });
            if (result.isErr()) {
                errorManager.errRes(res, result.error.message);
                return;
            }

            this.setApiKeyLocals(res, result.value);
            const authSource = result.value.auth.source;
            metrics.increment(metrics.Types.AUTH_GET_ENV_BY_SECRET_KEY_SOURCE, 1, {
                auth_source: isScript && authSource === 'api_secret' ? 'internal_script' : authSource
            });
            tagTraceUser({ account: result.value.account, environment: result.value.environment, plan: result.value.plan });
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
            secret: DBAPISecret;
            plan: DBPlan | null;
        }>
    > {
        if (!keyRegex.test(publicKey)) {
            return Err('invalid_secret_key_format');
        }

        const accountContext = await accountService.getAccountContextByPublicKey(publicKey);
        if (!accountContext) {
            return Err('unknown_account');
        }

        if (flagHasPlan && !accountContext.plan) {
            return Err('plan_not_found');
        }

        return Ok({ ...accountContext });
    }

    async sessionAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

    async noAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

    async basicAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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
            secret: DBAPISecret;
            connectSession: ConnectSession;
            endUser: InternalEndUser | null;
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

        const accountContext = await accountService.getAccountContext({
            environmentId: getConnectSession.value.connectSession.environmentId
        });
        if (!accountContext) {
            return Err('unknown_account');
        }

        if (flagHasPlan && !accountContext.plan) {
            return Err('plan_not_found');
        }

        return Ok({
            account: accountContext.account,
            environment: accountContext.environment,
            secret: accountContext.secret,
            connectSession: getConnectSession.value.connectSession,
            endUser: getConnectSession.value.connectSession.endUser,
            plan: accountContext.plan
        });
    }

    async connectSessionAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

    private async validateAgentSessionToken(token: string): Promise<
        Result<{
            account: DBTeam;
            environment: DBEnvironment;
            secret: DBAPISecret;
            agentSession: AgentSession;
            plan: DBPlan | null;
        }>
    > {
        const parsedToken = agentSessionTokenSchema.safeParse(token);
        if (!parsedToken.success) {
            return Err('invalid_agent_session_token_format');
        }

        const getAgentSession = await agentSessionService.getAgentSessionByToken(db.knex, token);
        if (getAgentSession.isErr()) {
            return Err('unknown_agent_session_token');
        }

        // Checked on the session rather than trusted to the credential's own expiry, so the
        // planned switch to session-scoped customer keys does not change what gets rejected.
        const agentSession = getAgentSession.value;
        if (agentSession.endedAt !== null || agentSession.expiresAt.getTime() <= Date.now()) {
            return Err('agent_session_ended');
        }

        const accountContext = await accountService.getAccountContext({ environmentId: agentSession.environmentId });
        if (!accountContext) {
            return Err('unknown_account');
        }

        if (flagHasPlan && !accountContext.plan) {
            return Err('plan_not_found');
        }

        return Ok({
            account: accountContext.account,
            environment: accountContext.environment,
            secret: accountContext.secret,
            agentSession,
            plan: accountContext.plan
        });
    }

    async agentSessionAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('agentSessionAuth', {
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

            const result = await this.validateAgentSessionToken(token);
            if (result.isErr()) {
                errorManager.errRes(res, result.error.message);
                return;
            }

            res.locals['authType'] = 'agentSession';
            res.locals['account'] = result.value.account;
            res.locals['environment'] = result.value.environment;
            res.locals['agentSession'] = result.value.agentSession;
            res.locals['plan'] = result.value.plan;
            tagTraceUser(result.value);
            next();
        } catch (err) {
            logger.error(`failed_get_env_by_agent_session ${stringifyError(err)}`);
            span.setTag('error', err);
            errorManager.errRes(res, 'unknown_account');
            return;
        } finally {
            metrics.duration(metrics.Types.AUTH_GET_ENV_BY_AGENT_SESSION, Date.now() - start);
            span.finish();
        }
    }

    /**
     * This is the same as connectSessionAuth expect we check the body
     * Only used for /connect/telemetry because we use sendBeacon that does not accept headers
     */
    async connectSessionAuthBody(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

    async connectSessionOrSecretKeyAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

                const apiKeyResult = await this.validateApiKey(token, { isScript: false });
                if (apiKeyResult.isErr()) {
                    errorManager.errRes(res, apiKeyResult.error.message);
                    return;
                }
                this.setApiKeyLocals(res, apiKeyResult.value);
                metrics.increment(metrics.Types.AUTH_GET_ENV_BY_SECRET_KEY_SOURCE, 1, {
                    auth_source: apiKeyResult.value.auth.source
                });
                tagTraceUser({ account: apiKeyResult.value.account, environment: apiKeyResult.value.environment, plan: apiKeyResult.value.plan });
            } else {
                res.locals['authType'] = 'connectSession';
                res.locals['account'] = connectSessionResult.value.account;
                res.locals['environment'] = connectSessionResult.value.environment;
                res.locals['connectSession'] = connectSessionResult.value.connectSession;
                res.locals['endUser'] = connectSessionResult.value.endUser;
                res.locals['apiKeyPrincipal'] = {
                    type: 'api_key',
                    source: 'connect_session',
                    accountId: connectSessionResult.value.account.id,
                    scopes: ['environment:integrations:list'],
                    environmentIds: [connectSessionResult.value.environment.id]
                } satisfies ApiKeyPrincipal;
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

    async connectSessionOrPublicKeyAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('connectSessionOrPublicKeyAuth', {
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

                metrics.increment(metrics.Types.AUTH_WITH_CONNECT_SESSION, 1, { accountId: connectSessionResult.value.account.id });
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

                if (result.value.account.created_at > envs.PUBLIC_AUTHENTICATION_DEPRECATION_DATE) {
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

                metrics.increment(metrics.Types.AUTH_WITH_PUBLIC_KEY, 1, { accountId: result.value.account.id });
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
    async testAuth(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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

            const result = await this.validateApiKey(secret, { isScript: false });
            if (result.isErr()) {
                errorManager.errRes(res, result.error.message);
                return;
            }

            this.setApiKeyLocals(res, result.value);
            tagTraceUser({ account: result.value.account, environment: result.value.environment, plan: result.value.plan });
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
async function fillLocalsFromSession(req: Request, res: Response<any, Partial<RequestLocals>>, next: NextFunction) {
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
