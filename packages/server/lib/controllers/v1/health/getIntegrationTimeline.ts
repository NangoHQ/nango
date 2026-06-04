import { healthService } from '@nangohq/shared';

import type { Request, Response } from 'express';

export const getIntegrationTimeline = async (req: Request, res: Response) => {
    try {
        const environmentId = (req as any).environment_id; // Added by auth middleware
        const integrationId = req.params['integrationId'];

        if (!integrationId) {
            res.status(400).json({ error: 'integrationId is required' });
            return;
        }

        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
        const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;

        const timeline = await healthService.getExecutionTimeline(environmentId, integrationId, limit, offset);

        res.status(200).json(timeline);
    } catch (_err) {
        res.status(500).json({ error: 'Failed to retrieve integration timeline' });
    }
};
