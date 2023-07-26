import sentry, { EventHint } from '@sentry/node';
import { readFileSync } from 'fs';
import path from 'path';
import type { ErrorEvent } from '@sentry/types';
import logger from '../logger/console.js';
import { NangoError } from './error.js';
import type { Request } from 'express';
import { isCloud, getAccount, dirname, isApiAuthenticated, isUserAuthenticated } from './utils.js';
import type { User } from '../models/Admin.js';
import type { LogAction } from '../models/Activity.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';

interface ErrorCaptureUser {
    id: number;
    email?: string;
    userId?: number;
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
                    release: 'nango@' + packageVersion
                });
            }
        } catch (_) {
            return;
        }
    }

    public report(e: any, config: { accountId?: number | undefined; userId?: number | undefined; metadata?: { [key: string]: unknown } } = {}) {
        sentry.withScope(function (scope) {
            if (config.accountId != null) {
                scope.setUser({ id: `account-${config.accountId}` });
            } else if (config.userId != null) {
                scope.setUser({ id: `user-${config.userId}` });
            }

            if (config.metadata != null) {
                scope.setContext('metadata', config.metadata);
            }

            sentry.captureException(e);
        });

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    public async capture(message: string, user: ErrorCaptureUser, accountId: number, environmentId: number, operation: LogAction) {
        const environmentName = await environmentService.getEnvironmentName(environmentId);

        sentry.captureEvent({
            message,
            user: {
                // Note: using the account ID since not all operations have a user ID due to usage of secret/public keys
                id: accountId.toString(),
                email: user.email || '',
                userId: user.id
            },
            tags: {
                environmentName,
                operation
            }
        });
    }

    public async captureWithJustEnvironment(message: string, environmentId: number, operation: LogAction) {
        const accountId = await environmentService.getAccountIdFromEnvironment(environmentId);
        const user = await userService.getByAccountId(accountId as number);
        if (user) {
            this.capture(message, user, accountId as number, environmentId, operation);
        }
    }

    public errResFromNangoErr(res: any, err: NangoError) {
        res.status(err.status).send({ error: err.message, type: err.type, payload: err.payload });
    }

    public errRes(res: any, type: string) {
        const err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public handleGenericError(err: any, req: Request, res: any) {
        if (!(err instanceof Error)) {
            err = new NangoError('generic_error_malformed');
        } else if (!(err instanceof NangoError)) {
            err = new NangoError(err.message);
        }

        const nangoErr = err as NangoError;

        if (isApiAuthenticated(res)) {
            this.report(nangoErr, { accountId: getAccount(res), metadata: err.payload });
        } else if (isUserAuthenticated(req)) {
            const user = req.user as User;
            this.report(nangoErr, { userId: user.id, metadata: err.payload });
        } else {
            this.report(nangoErr, { metadata: err.payload });
        }

        this.errResFromNangoErr(res, nangoErr);
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
