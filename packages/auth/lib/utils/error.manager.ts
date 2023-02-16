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

    public report(e: any) {
        if (isCloud()) {
            sentry.captureException(e);
        }

        logger.error(`Exception caught: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    public res(res: any, type: string) {
        let err = new NangoError(type);
        res.status(err.status).send({ error: err.message });
    }
}

export default new ErrorManager();
