import './tracer.js';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'zod-express';
import { z } from 'zod';
import persistController from './controllers/persist.controller.js';
import { logLevelValues } from '@nangohq/shared';

export const server = express();
server.use(express.json({ limit: '100mb' }));

server.use((req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (body: any) {
        if (res.statusCode >= 400) {
            console.log(`[Persist] [Error] ${req.method} ${req.path} ${res.statusCode} '${JSON.stringify(body)}'`);
        }
        originalSend.call(this, body) as any;
        return this;
    };
    next();
    if (res.statusCode < 400) {
        console.log(`[Persist] ${req.method} ${req.path} ${res.statusCode}`);
    }
});

server.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

server.post(
    '/environment/:environmentId/log',
    validateRequest({
        params: z.object({
            environmentId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
        }),
        body: z.object({
            activityLogId: z.number(),
            level: z.enum(logLevelValues),
            msg: z.string()
        })
    }),
    persistController.saveActivityLog
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
        records: z.any().array().nonempty(),
        providerConfigKey: z.string(),
        connectionId: z.string(),
        activityLogId: z.number(),
        lastSyncDate: z
            .string()
            .datetime()
            .transform((value) => new Date(value))
            .pipe(z.date()) as unknown as z.ZodDate,
        trackDeletes: z.boolean()
    })
});
const recordPath = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records';
server.post(recordPath, validateRecordsRequest, persistController.saveRecords);
server.delete(recordPath, validateRecordsRequest, persistController.deleteRecords);
server.put(recordPath, validateRecordsRequest, persistController.updateRecords);

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err) {
        res.status(500).json({ error: err.message });
    } else {
        next();
    }
});
