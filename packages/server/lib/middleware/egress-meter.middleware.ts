import { metrics } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

export const egressMeterMiddleware = (req: Request, res: Response<any, RequestLocals>, next: NextFunction) => {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key') {
        next();
        return;
    }

    const baseline = req.socket?.bytesWritten ?? 0;

    const withConnectionId = req.params['connectionId'] !== undefined;

    let recorded = false;
    const meterEgressedBytes = () => {
        if (recorded) return;
        const bytes = (req.socket?.bytesWritten ?? 0) - baseline;
        metrics.increment(metrics.Types.EGRESS_BYTES, bytes, { withConnectionId: withConnectionId.toString() });
        recorded = true;
    };

    res.on('finish', meterEgressedBytes);
    // early client disconnect: finish never fires but bytes may already be on the wire
    res.on('close', meterEgressedBytes);
    next();
};
