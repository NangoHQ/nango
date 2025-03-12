import type { Logger } from '@nangohq/types';
import type { Handler } from 'express';
import colors from '@colors/colors';

export function requestLoggerMiddleware({ logger }: { logger: Logger }): Handler {
    return (req, res, next) => {
        let resBody: any;
        const originalSend = res.send;
        res.send = function (body: any) {
            resBody = body;
            originalSend.call(this, body);
            return this;
        };
        res.on('finish', () => {
            const route = req.route?.path || req.originalUrl;
            const msg = `${req.method} ${route} -> ${res.statusCode}`;
            const contentType = res.getHeader('content-type') as string | undefined;
            if (res.statusCode >= 500) {
                logger.error(colors.red(msg), contentType && contentType.startsWith('application/json') ? resBody : '[buffer]');
            } else if (res.statusCode >= 400) {
                logger.warning?.(colors.yellow(msg), contentType && contentType.startsWith('application/json') ? resBody : '[buffer]');
            } else {
                logger.info(msg);
            }
        });
        next();
    };
}
