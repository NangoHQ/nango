import { healthService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { Request, Response } from 'express';

export const getIntegrationHealth = async (_req: Request, res: Response) => {
    try {
        const { environment } = res.locals as RequestLocals;
        if (!environment) {
            res.status(500).send({ error: { code: 'server_error', message: 'Environment not found' } });
            return;
        }

        const metrics = await healthService.getIntegrationHealthMetrics(environment.id);

        res.status(200).send(metrics);
    } catch (err) {
        report(new Error('failed_to_retrieve_integration_health_metrics', { cause: err }));
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve integration health metrics' } });
    }
};
