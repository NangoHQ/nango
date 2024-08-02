import type { Logger } from '@nangohq/types';
import type { Handler } from 'express';
import colors from '@colors/colors';

export function requestLoggerMiddleware({ logger }: { logger: Logger }): Handler {
    return (req, res, next) => {
        res.on('finish', () => {
            const route = req.route?.path || req.originalUrl;
            const msg = `${req.method} ${route} -> ${res.statusCode}`;
            if (res.statusCode >= 500) {
                logger.error(colors.red(msg));
            } else if (res.statusCode >= 400) {
                logger.warning?.(colors.yellow(msg));
            } else {
                logger.info(msg);
            }
        });
        next();
    };
}
