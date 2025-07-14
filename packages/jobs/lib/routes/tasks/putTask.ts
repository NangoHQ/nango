import { z } from 'zod';

import { operationIdRegex } from '@nangohq/logs';
import { validateRequest } from '@nangohq/utils';

import { handleError, handleSuccess } from '../../execution/operations/handler.js';

import type { PutTask } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([jsonLiteralSchema, z.array(jsonSchema), z.record(jsonSchema)]));
const nangoPropsSchema = z
    .object({
        scriptType: z.enum(['action', 'webhook', 'sync', 'on-event']),
        connectionId: z.string().min(1),
        nangoConnectionId: z.number(),
        environmentId: z.number(),
        environmentName: z.string().min(1),
        providerConfigKey: z.string().min(1),
        provider: z.string().min(1),
        team: z.object({
            id: z.number(),
            name: z.string().min(1)
        }),
        syncConfig: z
            .object({
                id: z.number(),
                sync_name: z.string().min(1),
                type: z.enum(['sync', 'action', 'on-event']),
                environment_id: z.number(),
                models: z.array(z.string()),
                file_location: z.string(),
                nango_config_id: z.number(),
                active: z.boolean(),
                runs: z.string().nullable(),
                track_deletes: z.boolean(),
                auto_start: z.boolean(),
                enabled: z.boolean(),
                webhook_subscriptions: z.array(z.string()).or(z.null()),
                model_schema: z.array(z.any()).optional().nullable(),
                models_json_schema: z.object({}).nullable(),
                created_at: z.coerce.date(),
                updated_at: z.coerce.date(),
                version: z.string(),
                attributes: z.record(z.string(), z.any()),
                pre_built: z.boolean(),
                is_public: z.boolean(),
                input: z.string().nullable(),
                sync_type: z.enum(['full', 'incremental']).nullable(),
                metadata: z.record(z.string(), z.any()),
                sdk_version: z.string().nullable()
                // TODO: fix this missing fields
                // deleted: z.boolean().optional(),
                // deleted_at: z.coerce.date().optional().nullable(),
            })
            .passthrough(),
        syncId: z.string().uuid().optional(),
        syncJobId: z.number().optional(),
        activityLogId: operationIdRegex,
        secretKey: z.string().min(1),
        debug: z.boolean(),
        startedAt: z.coerce.date(),
        endUser: z.object({ id: z.number(), endUserId: z.string().nullable(), orgId: z.string().nullable() }).nullable(),
        runnerFlags: z
            .object({
                validateActionInput: z.boolean().default(false),
                validateActionOutput: z.boolean().default(false),
                validateWebhookInput: z.boolean().default(false),
                validateWebhookOutput: z.boolean().default(false),
                validateSyncRecords: z.boolean().default(false),
                validateSyncMetadata: z.boolean().default(false)
            })
            .passthrough()
    })
    .passthrough();

const validate = validateRequest<PutTask>({
    parseBody: (data) =>
        z
            .object({
                nangoProps: nangoPropsSchema,
                error: z
                    .object({
                        type: z.string(),
                        payload: z.record(z.string(), z.unknown()).or(z.unknown().transform((v) => ({ message: v }))),
                        status: z.number(),
                        additional_properties: z.record(z.string(), z.unknown()).optional()
                    })
                    .optional(),
                output: jsonSchema.default(null)
            })
            .parse(data),
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutTask>) => {
    const { taskId } = res.locals.parsedParams;
    const { nangoProps, error, output } = res.locals.parsedBody;
    if (!nangoProps) {
        res.status(400).json({ error: { code: 'put_task_failed', message: 'missing nangoProps' } });
        return;
    }
    if (error) {
        await handleError({ taskId, nangoProps, error });
    } else {
        await handleSuccess({ taskId, nangoProps, output: output || null });
    }
    res.status(204).send();
    return;
};

export const routeHandler: RouteHandler<PutTask> = {
    method: 'PUT',
    path: '/tasks/:taskId',
    validate,
    handler
};
