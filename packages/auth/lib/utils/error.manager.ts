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

    public report(e: any, accountId?: number | null) {
        if (isCloud()) {
            if (accountId != null) {
                sentry.setUser({ id: String(accountId) });
            }

            sentry.captureException(e);
            sentry.setUser(null);
        }

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    public res(res: any, type: string) {
        let err = new NangoError(type);
        res.status(err.status).send({ error: err.message });
    }
}

export default new ErrorManager();
