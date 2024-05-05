import * as uuid from 'uuid';
import type { EventHint } from '@sentry/node';
import sentry from '@sentry/node';
import type { Tracer } from 'dd-trace';
import type { ErrorEvent } from '@sentry/types';
import { NangoError } from './error.js';
import type { Response, Request } from 'express';
import { getLogger, isCloud, stringifyError } from '@nangohq/utils';
import { packageJsonFile } from './utils.js';
import environmentService from '../services/environment.service.js';
import accountService from '../services/account.service.js';
import userService from '../services/user.service.js';

const logger = getLogger('ErrorManager');

export enum ErrorSourceEnum {
    PLATFORM = 'platform',
    CUSTOMER = 'customer'
}

export type ErrorSource = ErrorSourceEnum;

interface ErrorOptionalConfig {
    source: ErrorSource;
    accountId?: number;
    userId?: number;
    environmentId?: number | undefined;
    metadata?: Record<string, unknown>;
    operation?: string;
}

class ErrorManager {
    constructor() {
        try {
            if (isCloud && process.env['SENTRY_DNS']) {
                const packageVersion = packageJsonFile().version;
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
        void sentry.withScope(async function (scope) {
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
                const metadata = Object.entries(config.metadata).reduce<Record<string, unknown>>((acc, [key, value]) => {
                    if (typeof value === 'object') {
                        acc[key] = JSON.stringify(value);
                    } else {
                        acc[key] = value;
                    }
                    return acc;
                }, {});
                scope.setContext('metadata', metadata);
            }

            if (typeof e === 'string') {
                sentry.captureException(new Error(e));
            } else {
                sentry.captureException(e);
            }
        });

        logger.error(`Exception caught: ${stringifyError(e)}`);

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
            logger.error(`Response error: ${JSON.stringify({ statusCode: err.status, type: err.type, payload: err.payload, message: err.message })}`);
            if (!err.message) {
                res.status(err.status || 500).send({ type: err.type, payload: err.payload });
            } else {
                res.status(err.status || 500).send({ error: err.message, type: err.type, payload: err.payload });
            }
        }
    }

    public errRes(res: Response, type: string) {
        const err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public async handleGenericError(err: any, _: Request, res: Response, tracer: Tracer): Promise<void> {
        const errorId = uuid.v4();
        let nangoErr: NangoError;
        if (!(err instanceof Error)) {
            nangoErr = new NangoError('generic_error_malformed', errorId);
        } else if (!(err instanceof NangoError)) {
            nangoErr = new NangoError(err.message, errorId);
        } else {
            nangoErr = err;
        }

        let environmentId: number | undefined;
        if ('environment' in res.locals) {
            environmentId = res.locals['environment'].id;
        }

        this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, environmentId, metadata: nangoErr.payload }, tracer);

        const supportError = new NangoError('generic_error_support', errorId);
        this.errResFromNangoErr(res, supportError);
    }

    public getExpressRequestContext(req: Request): Record<string, unknown> {
        const metadata: Record<string, unknown> = {};
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
