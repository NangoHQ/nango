import { isCloud } from './utils.js';
import sentry, { EventHint } from '@sentry/node';
import type { ErrorEvent } from '@sentry/types';
import logger from './logger.js';
import { NangoError } from './error.js';
import type { Request } from 'express';
import { getAccount, isApiAuthenticated, isUserAuthenticated } from './utils.js';

class ErrorManager {
    constructor() {
        if (isCloud() && process.env['SENTRY_DNS']) {
            sentry.init({
                dsn: process.env['SENTRY_DNS'],
                beforeSend(event: ErrorEvent, _: EventHint) {
                    return event.user?.id === 'account-78' ? null : event;
                }
            });
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

    public errResFromNangoErr(res: any, err: NangoError) {
        res.status(err.status).send({ error: err.message, type: err.type, payload: err.payload });
    }

    public errRes(res: any, type: string) {
        let err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public handleGenericError(err: any, req: Request, res: any) {
        if (!(err instanceof Error)) {
            err = new NangoError('generic_error_malformed');
        } else if (!(err instanceof NangoError)) {
            err = new NangoError(err.message);
        }

        let nangoErr = err as NangoError;

        if (isApiAuthenticated(res)) {
            this.report(nangoErr, { accountId: getAccount(res), metadata: err.payload });
        } else if (isUserAuthenticated(req)) {
            this.report(nangoErr, { userId: req.user!.id, metadata: err.payload });
        } else {
            this.report(nangoErr, { metadata: err.payload });
        }

        this.errResFromNangoErr(res, nangoErr);
    }

    public getExpressRequestContext(req: Request): { [key: string]: unknown } {
        let metadata: { [key: string]: unknown } = {};
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
