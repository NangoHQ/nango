import { healthService } from '@nangohq/shared';

import type { Request, Response } from 'express';

export const getIntegrationHealth = async (req: Request, res: Response) => {
    try {
        const environmentId = (req as any).environment_id; // Added by auth middleware

        const metrics = await healthService.getIntegrationHealthMetrics(environmentId);

        res.status(200).json(metrics);
    } catch (_err) {
        res.status(500).json({ error: 'Failed to retrieve integration health metrics' });
    }
};
