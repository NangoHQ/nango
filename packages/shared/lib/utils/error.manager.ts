import * as uuid from 'uuid';
import sentry, { EventHint } from '@sentry/node';
import { readFileSync } from 'fs';
import path from 'path';
import type { ErrorEvent } from '@sentry/types';
import logger from '../logger/console.js';
import { NangoError } from './error.js';
import type { Response, Request } from 'express';
import { isCloud, getEnvironmentId, getAccountIdAndEnvironmentIdFromSession, dirname, isApiAuthenticated, isUserAuthenticated } from './utils.js';
import type { LogAction } from '../models/Activity.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';

export enum ErrorSourceEnum {
    PLATFORM = 'platform',
    CUSTOMER = 'customer'
}

export type ErrorSource = ErrorSourceEnum;

interface ErrorCaptureUser {
    id: number;
    email?: string;
    userId?: number;
}

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

    public async report(e: any, config: ErrorOptionalConfig = { source: ErrorSourceEnum.PLATFORM }) {
        sentry.withScope(async function (scope) {
            if (config.environmentId) {
                const environmentName = await environmentService.getEnvironmentName(config.environmentId);
                const accountId = await environmentService.getAccountIdFromEnvironment(config.environmentId);
                const user = await userService.getByAccountId(accountId as number);
                sentry.setTag('environmentName', environmentName);
                sentry.setUser({
                    id: `account-${accountId}`,
                    email: user?.email || '',
                    userId: user?.id
                });
            }

            if (config.accountId && !config.environmentId) {
                const user = await userService.getByAccountId(config.accountId);
                sentry.setUser({
                    id: `account-${config.accountId}`,
                    email: user?.email || '',
                    userId: user?.id
                });
            }

            if (config.userId && !config.environmentId) {
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

            if (config.metadata != null) {
                scope.setContext('metadata', config.metadata);
            }

            if (typeof e === 'string') {
                sentry.captureException(new Error(e));
            } else {
                sentry.captureException(e);
            }
        });

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    public async capture(
        event_id: string,
        message: string,
        user: ErrorCaptureUser,
        accountId: number,
        environmentId: number,
        operation: string,
        contexts?: Record<string, unknown>
    ) {
        const environmentName = await environmentService.getEnvironmentName(environmentId);

        sentry.captureEvent({
            event_id,
            message,
            user: {
                // Note: using the account ID since not all operations have a user ID due to usage of secret/public keys
                id: accountId.toString(),
                email: user.email || '',
                userId: user.id
            },
            tags: {
                environmentName,
                operation,
                source: ErrorSourceEnum.CUSTOMER
            },
            contexts: { custom: { ...contexts } } || {}
        });
    }

    public async captureWithJustEnvironment(
        event_id: string,
        message: string,
        environmentId: number,
        operation: LogAction,
        contexts?: Record<string, unknown>
    ) {
        const accountId = await environmentService.getAccountIdFromEnvironment(environmentId);
        const user = await userService.getByAccountId(accountId as number);
        if (user) {
            await this.capture(event_id, message, user, accountId as number, environmentId, operation, contexts);
        }
    }

    public errResFromNangoErr(res: Response, err: NangoError | null) {
        if (err) {
            res.status(err.status).send({ error: err.message, type: err.type, payload: err.payload });
        }
    }

    public errRes(res: any, type: string) {
        const err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public async handleGenericError(err: any, req: Request, res: any) {
        const errorId = uuid.v4();
        if (!(err instanceof Error)) {
            err = new NangoError('generic_error_malformed', errorId);
        } else if (!(err instanceof NangoError)) {
            err = new NangoError(err.message, errorId);
        }

        const nangoErr = err as NangoError;

        if (isApiAuthenticated(res)) {
            const environmentId = getEnvironmentId(res);
            await this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, environmentId, metadata: err.payload });
        } else if (isUserAuthenticated(req)) {
            const { environmentId } = await getAccountIdAndEnvironmentIdFromSession(req);
            await this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, environmentId, metadata: err.payload });
        } else {
            this.report(nangoErr, { source: ErrorSourceEnum.PLATFORM, metadata: err.payload });
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
