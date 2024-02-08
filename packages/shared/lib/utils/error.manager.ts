import * as uuid from 'uuid';
import sentry, { EventHint } from '@sentry/node';
import { readFileSync } from 'fs';
import path from 'path';
import type { Tracer } from 'dd-trace';
import type { ErrorEvent } from '@sentry/types';
import logger from '../logger/console.js';
import { NangoError } from './error.js';
import type { Response, Request } from 'express';
import { isCloud, getEnvironmentId, getAccountIdAndEnvironmentIdFromSession, dirname, isApiAuthenticated, isUserAuthenticated } from './utils.js';
import environmentService from '../services/environment.service.js';
import accountService from '../services/account.service.js';
import userService from '../services/user.service.js';

export enum ErrorSourceEnum {
    PLATFORM = 'platform',
    CUSTOMER = 'customer'
}

export type ErrorSource = ErrorSourceEnum;

interface ErrorOptionalConfig {
    source: ErrorSource;
    accountId?: number;
    userId?: number;
    environmentId?: number;
    metadata?: { [key: string]: unknown };
    operation?: string;
}

class ErrorManager {
    constructor() {
        try {
            if (isCloud() && process.env['SENTRY_DNS']) {
                const packageVersion = JSON.parse(readFileSync(path.resolve(dirname(), '../../../package.json'), 'utf8')).version;
                sentry.init({
                    dsn: process.env['SENTRY_DNS'],
                    beforeSend(event: ErrorEvent, _: EventHint) {
                        return event.user?.id === 'account-78' ? null : event;
                    },
                    environment: process.env['NODE_ENV'] as string,
                    release: 'nango@' + packageVersion
                });
            }
        } catch (_) {
            return;
        }
    }

    public report(e: unknown, config: ErrorOptionalConfig = { source: ErrorSourceEnum.PLATFORM }, tracer?: Tracer): void {
        sentry.withScope(async function (scope) {
            if (config.environmentId || config.accountId) {
                let accountId: number | undefined;
                if (config.environmentId) {
                    const environmentName = await environmentService.getEnvironmentName(config.environmentId);
                    accountId = (await environmentService.getAccountIdFromEnvironment(config.environmentId)) as number;
                    sentry.setTag('environmentName', environmentName);
                }

                if (config.accountId && !config.environmentId) {
                    accountId = config.accountId;
                }
                const account = await accountService.getAccountById(accountId as number);

                if (!config.userId) {
                    const users = await userService.getUsersByAccountId(accountId as number);
                    sentry.setUser({
                        id: `account-${accountId}`,
                        organization: account?.name || '',
                        emails: users.map((user) => user.email).join(','),
                        userIds: users.map((user) => user.id).join(',')
                    });
                }
            }

            if (config.userId) {
                const user = await userService.getUserById(config.userId);
                sentry.setUser({
                    id: `user-${config.userId}`,
                    email: user?.email || '',
                    userId: user?.id
                });
            }

            sentry.setTag('source', config.source);

            if (config.operation) {
                sentry.setTag('operation', config.operation);
            }

            if (config.metadata) {
                const metadata = Object.entries(config.metadata).reduce(
                    (acc, [key, value]) => {
                        if (typeof value === 'object') {
                            acc[key] = JSON.stringify(value);
                        } else {
                            acc[key] = value;
                        }
                        return acc;
                    },
                    {} as Record<string, unknown>
                );
                scope.setContext('metadata', metadata);
            }

            if (typeof e === 'string') {
                sentry.captureException(new Error(e));
            } else {
                sentry.captureException(e);
            }
        });

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);

        if (e instanceof Error && tracer) {
            // Log to datadog manually
            // https://github.com/DataDog/dd-trace-js/issues/1944
            const span = tracer.scope().active();
            if (span) {
                span.setTag('error', e);
            }
        }
    }

    public errResFromNangoErr(res: Response, err: NangoError | null) {
        if (err) {
            if (!err.message) {
                res.status(err.status).send({ type: err.type, payload: err.payload });
            } else {
                res.status(err.status).send({ error: err.message, type: err.type, payload: err.payload });
            }
        }
    }

    public errRes(res: any, type: string) {
        const err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public async handleGenericError(err: any, req: Request, res: any, tracer: Tracer): Promise<void> {
        const errorId = uuid.v4();
        if (!(err instanceof Error)) {
            err = new NangoError('generic_error_malformed', errorId);
        } else if (!(err instanceof NangoError)) {
            err = new NangoError(err.message, errorId);
        }

        const nangoErr: NangoError = err;

        if (isApiAuthenticated(res)) {
            const environmentId = getEnvironmentId(res);
            this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, environmentId, metadata: err.payload }, tracer);
        } else if (isUserAuthenticated(req)) {
            const { response, success, error } = await getAccountIdAndEnvironmentIdFromSession(req);
            if (!success || response === null) {
                this.report(error, { source: ErrorSourceEnum.PLATFORM, metadata: err.payload }, tracer);
            } else {
                const { environmentId } = response;
                this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, environmentId, metadata: err.payload }, tracer);
            }
        } else {
            this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, metadata: err.payload }, tracer);
        }

        const supportError = new NangoError('generic_error_support', errorId);
        this.errResFromNangoErr(res, supportError);
    }

    public getExpressRequestContext(req: Request): { [key: string]: unknown } {
        const metadata: { [key: string]: unknown } = {};
        metadata['baseUrl'] = req.baseUrl;
        metadata['originalUrl'] = req.originalUrl;
        metadata['subdomains'] = req.subdomains;
        metadata['body'] = req.body;
        metadata['hostname'] = req.hostname;
        metadata['method'] = req.method;
        metadata['params'] = req.params;
        metadata['query'] = req.query;

        return metadata;
    }
}

export default new ErrorManager();
