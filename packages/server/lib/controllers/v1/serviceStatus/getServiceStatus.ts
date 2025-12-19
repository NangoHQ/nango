import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetServiceStatus, ServiceStatusResponse } from '@nangohq/types';
import type { Request, Response } from 'express';

const host = 'https://api.apidownwatch.com';

export const getServiceStatus = asyncWrapper<GetServiceStatus>(async (req: Request, res: Response) => {
    const { service } = req.params;

    if (!service) {
        res.status(400).send({ status: 'unknown' });
        return;
    }

    const apiKey = envs.API_DOWN_WATCH_API_KEY;
    if (!apiKey) {
        res.status(200).send({ status: 'unknown' });
        return;
    }

    try {
        const response = await fetch(`${host}/api/${service}/status`, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            }
        });

        const json = (await response.json()) as ServiceStatusResponse | { error?: string };
        if (!response.ok || 'error' in json) {
            res.status(200).send({ status: 'unknown' });
            return;
        }

        res.status(200).send(json as ServiceStatusResponse);
    } catch {
        res.status(200).send({ status: 'unknown' });
    }
});
