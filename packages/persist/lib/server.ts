import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'zod-express';
import { z } from 'zod';
import { getLogger, requestLoggerMiddleware } from '@nangohq/utils';
import persistController from './controllers/persist.controller.js';
import { authMiddleware } from './middleware/auth.middleware.js';

const logger = getLogger('Persist');
const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';

export const server = express();

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    server.use(requestLoggerMiddleware({ logger }));
}

server.use('/environment/:environmentId/*', authMiddleware);

server.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

server.post(
    '/environment/:environmentId/log',
    express.json({ limit: maxSizeJsonLog }),
    validateRequest({
        params: z.object({
            environmentId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
        }),
        body: z
            .object({
                activityLogId: z.string(),
                level: z.enum(['info', 'debug', 'error', 'warn', 'http', 'verbose', 'silly']),
                msg: z.string(),
                timestamp: z.number().optional() // Optional until fully deployed
            })
            .strict()
    }),
    persistController.saveLog.bind(persistController)
);

const validateRecordsRequest = validateRequest({
    params: z.object({
        environmentId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber,
        nangoConnectionId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber,
        syncId: z.string(),
        syncJobId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
    }),
    body: z.object({
        model: z.string(),
        records: z.array(z.object({ id: z.union([z.string().max(255).min(1), z.number()]) })).nonempty(),
        providerConfigKey: z.string(),
        connectionId: z.string(),
        activityLogId: z.string()
    })
});
const recordPath = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records';
server.post(recordPath, express.json({ limit: maxSizeJsonRecords }), validateRecordsRequest, persistController.saveRecords.bind(persistController));
server.delete(recordPath, express.json({ limit: maxSizeJsonRecords }), validateRecordsRequest, persistController.deleteRecords.bind(persistController));
server.put(recordPath, express.json({ limit: maxSizeJsonRecords }), validateRecordsRequest, persistController.updateRecords.bind(persistController));

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(400).json({ error: 'Entity too large' });
            return;
        }
        res.status(500).json({ error: err.message });
    } else if (err) {
        res.status(500).json({ error: 'uncaught error' });
    } else {
        next();
    }
});
