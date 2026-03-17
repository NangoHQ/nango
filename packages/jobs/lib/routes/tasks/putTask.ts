import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import { handle } from '../../execution/operations/handler.js';
import { nangoPropsSchema } from '../../schemas/nango-props.js';

import type { PutTask } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([jsonLiteralSchema, z.array(jsonSchema), z.record(z.string(), jsonSchema)]));

const bodySchema = z.object({
    nangoProps: nangoPropsSchema,
    error: z
        .object({
            type: z.string(),
            payload: z.record(z.string(), z.unknown()).or(z.unknown().transform((v) => ({ message: v }))),
            status: z.number(),
            additional_properties: z.record(z.string(), z.unknown()).optional()
        })
        .optional(),
    output: jsonSchema.default(null),
    telemetryBag: z
        .object({ customLogs: z.number(), proxyCalls: z.number(), durationMs: z.number().default(0), memoryGb: z.number().default(1) })
        .default({ customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 }),
    functionRuntime: z.enum(['runner', 'lambda']).default('runner'),
    checkpoints: z
        .object({ from: z.any().default(null), to: z.any().default(null) }) // we assume any for the checkpoints as their shape is enforced by the SDK
        .nullable()
        .default(null)
});
const paramsSchema = z.object({ taskId: z.uuid() }).strict();

const validate = validateRequest<PutTask>({
    parseBody: (data) => bodySchema.parse(data),
    parseParams: (data) => paramsSchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutTask>) => {
    const { taskId } = res.locals.parsedParams;
    const { nangoProps, error, output, telemetryBag, functionRuntime, checkpoints } = res.locals.parsedBody;
    if (!nangoProps) {
        res.status(400).json({ error: { code: 'put_task_failed', message: 'missing nangoProps' } });
        return;
    }
    await handle({
        taskId,
        nangoProps,
        telemetryBag,
        functionRuntime,
        checkpoints: checkpoints || null,
        ...(error ? { error } : { output: output || null })
    });
    res.status(204).send();
    return;
};

export const routeHandler: RouteHandler<PutTask> = {
    method: 'PUT',
    path: '/tasks/:taskId',
    validate,
    handler
};
