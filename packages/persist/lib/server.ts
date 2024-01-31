import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateRequest } from 'zod-express';
import { z } from 'zod';
import persistController from './controllers/persist.controller.js';
import './tracer.js';
import { logLevelValues } from '@nangohq/shared';

export const server = express();
server.use(express.json());

server.use((req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (body: any) {
        if (res.statusCode >= 400) {
            console.log(`[Persist] [Error] ${req.method} ${req.path} ${res.statusCode} '${body}'`);
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
server.put(
    '/sync/:syncId',
    validateRequest({
        params: z.object({
            syncId: z.string()
        }),
        body: z.object({
            lastSyncDate: z
                .string()
                .datetime()
                .transform((value) => new Date(value))
                .pipe(z.date()) as unknown as z.ZodDate
        })
    }),
    persistController.saveLastSyncDate
);

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
        connectionId: z.string(),
        syncId: z.string(),
        syncJobId: z.string().transform(Number).pipe(z.number().int().positive()) as unknown as z.ZodNumber
    }),
    body: z.object({
        model: z.string(),
        records: z.any().array().nonempty(),
        providerConfigKey: z.string(),
        nangoConnectionId: z.number(),
        activityLogId: z.number(),
        lastSyncDate: z
            .string()
            .datetime()
            .transform((value) => new Date(value))
            .pipe(z.date()) as unknown as z.ZodDate,
        trackDeletes: z.boolean()
    })
});
server.post('/environment/:environmentId/connection/:connectionId/sync/:syncId/job/:syncJobId/records', validateRecordsRequest, persistController.saveRecords);
server.delete(
    '/environment/:environmentId/connection/:connectionId/sync/:syncId/job/:syncJobId/records',
    validateRecordsRequest,
    persistController.deleteRecords
);
server.put('/environment/:environmentId/connection/:connectionId/sync/:syncId/job/:syncJobId/records', validateRecordsRequest, persistController.updateRecords);

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
