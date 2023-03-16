import { isCloud } from './utils.js';
import sentry from '@sentry/node';
import logger from './logger.js';
import { NangoError } from './error.js';
import type { Request } from 'express';

class ErrorManager {
    constructor() {
        if (isCloud() && process.env['SENTRY_DNS']) {
            sentry.init({ dsn: process.env['SENTRY_DNS'] });
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

    public res(res: any, type: string) {
        let err = new NangoError(type);
        res.status(err.status).send({ error: err.message });
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
