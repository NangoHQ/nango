import { metrics } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

export const egressMeterMiddleware = (req: Request, res: Response<any, RequestLocals>, next: NextFunction) => {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['account']) {
        next();
        return;
    }

    const baseline = req.socket?.bytesWritten ?? 0;

    res.on('finish', () => {
        const bytes = (req.socket?.bytesWritten ?? 0) - baseline;
        if (bytes > 0) {
            metrics.increment(metrics.Types.EGRESS_BYTES, bytes);
        }
    });

    next();
};
