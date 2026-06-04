import { healthService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { Request, Response } from 'express';

export const getIntegrationTimeline = async (req: Request, res: Response) => {
    try {
        const { environment } = res.locals as RequestLocals;
        if (!environment) {
            res.status(500).send({ error: { code: 'server_error', message: 'Environment not found' } });
            return;
        }

        const integrationId = req.params['integrationId'];

        if (!integrationId) {
            res.status(400).send({ error: { code: 'invalid_query_params', message: 'integrationId is required' } });
            return;
        }

        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
        const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;

        const timeline = await healthService.getExecutionTimeline(environment.id, integrationId, limit, offset);

        res.status(200).send(timeline);
    } catch (_err) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve integration timeline' } });
    }
};
