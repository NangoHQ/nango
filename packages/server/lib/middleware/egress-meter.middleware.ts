import { metrics } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

function trafficOrigin(res: Response<any, RequestLocals>): 'internal' | 'external' {
    return res.locals['apiKeyAuthSource'] === 'api_secret' ? 'internal' : 'external';
}

export const egressMeterMiddleware = (req: Request, res: Response<any, RequestLocals>, next: NextFunction) => {
    const origin = trafficOrigin(res);
    const baseline = req.socket?.bytesWritten ?? 0;

    let recorded = false;
    const meterEgressedBytes = () => {
        if (recorded) return;
        const bytes = (req.socket?.bytesWritten ?? 0) - baseline;
        if (bytes > 0) {
            metrics.increment(metrics.Types.EGRESS_BYTES, bytes, { traffic_origin: origin });
        }
        recorded = true;
    };

    res.on('finish', meterEgressedBytes);
    // early client disconnect: finish never fires but bytes may already be on the wire
    res.on('close', meterEgressedBytes);
    next();
};
