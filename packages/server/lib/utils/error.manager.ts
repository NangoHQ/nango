import { isCloud } from './utils.js';
import sentry from '@sentry/node';
import logger from './logger.js';
import { NangoError } from './error.js';

class ErrorManager {
    constructor() {
        if (isCloud() && process.env['SENTRY_DNS']) {
            sentry.init({ dsn: process.env['SENTRY_DNS'] });
        }
    }

    public report(e: any, config: { accountId?: number | undefined; userId?: number | undefined; metadata?: { [key: string]: string | undefined } } = {}) {
        if (isCloud()) {
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
        }

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    public res(res: any, type: string) {
        let err = new NangoError(type);
        res.status(err.status).send({ error: err.message });
    }
}

export default new ErrorManager();
