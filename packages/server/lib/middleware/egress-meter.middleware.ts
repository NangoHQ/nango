import { metrics } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

function trafficOrigin(res: Response<any, RequestLocals>): 'internal' | 'external' {
    return res.locals['apiKeyAuthSource'] === 'api_secret' ? 'internal' : 'external';
}

export const egressMeterMiddleware = (req: Request, res: Response<any, RequestLocals>, next: NextFunction) => {
    const origin = trafficOrigin(res);
    const baseline = req.socket?.bytesWritten ?? 0;
    res.on('finish', () => {
        const bytes = (req.socket?.bytesWritten ?? 0) - baseline;
        if (bytes > 0) {
            metrics.increment(metrics.Types.EGRESS_BYTES, bytes, { traffic_origin: origin });
        }
    });
    next();
};
