import { report } from '@nangohq/utils';

import type { Response } from 'express';

export function sendCreateEnvironmentKeyError(res: Response, error: Error): void {
    const { type: errType = '', message: errMsg = '' } = error as { type?: string; message?: string };
    if (errType === 'duplicate_api_key' || errMsg.includes('duplicate_api_key')) {
        res.status(409).send({ error: { code: 'conflict', message: 'A key with this name already exists' } });
    } else if (errType === 'resource_capped' || errMsg.includes('resource_capped')) {
        res.status(400).send({ error: { code: 'resource_capped', message: 'Maximum number of API keys per environment reached' } });
    } else {
        report(error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to create API key' } });
    }
}
