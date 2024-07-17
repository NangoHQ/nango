import { z } from 'zod';
import type { ApiError, Endpoint } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { handleError, handleOutput } from '../../scripts/operations/output.js';
import type { JsonValue } from 'type-fest';
import type { NangoProps } from '@nangohq/shared';

const path = '/tasks/:taskId';
const method = 'PUT';

type PutTask = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Body: {
        nangoProps: NangoProps;
        error?: {
            type: string;
            payload: Record<string, unknown>;
            status: number;
        };
        output?: JsonValue;
    };
    Error: ApiError<'put_task_failed'>;
    Success: never;
}>;

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([jsonLiteralSchema, z.array(jsonSchema), z.record(jsonSchema)]));

const validate = validateRequest<PutTask>({
    parseBody: (data) =>
        // TODO: move to NangoProps file
        z
            .object({
                nangoProps: z.object({
                    scriptType: z.enum(['action', 'webhook', 'sync', 'post-connection-script']),
                    connectionId: z.string().min(1),
                    environmentId: z.number(),
                    environmentName: z.string().min(1),
                    providerConfigKey: z.string().min(1),
                    provider: z.string().min(1),
                    nangoConnection: z.object({
                        connection_id: z.string(),
                        id: z.number(),
                        provider_config_key: z.string().min(1),
                        environment_id: z.number()
                    }),
                    // team: z.object({ id: z.string().uuid(), name: z.string() }),
                    syncConfig: z.object({
                        sync_name: z.string().min(1),
                        type: z.enum(['sync', 'action']),
                        environment_id: z.number(),
                        models: z.array(z.string()),
                        file_location: z.string(),
                        nango_config_id: z.number(),
                        active: z.boolean(),
                        attributes: z.record(z.string(), z.string()),
                        runs: z.string(),
                        track_deletes: z.boolean(),
                        auto_start: z.boolean(),
                        enabled: z.boolean(),
                        webhook_subscriptions: z.array(z.string()),
                        model_schema: z.array(
                            z.object({
                                name: z.string(),
                                fields: z.array(z.object({ name: z.string(), type: z.string() }))
                            })
                        ),
                        models_json_schema: z.any(),
                        created_at: z.coerce.date(),
                        updated_at: z.coerce.date()
                    }),
                    syncId: z.string().uuid(),
                    syncJobId: z.number(),
                    activityLogId: z.string().min(1),
                    secretKey: z.string().min(1),
                    debug: z.boolean(),
                    startedAt: z.coerce.date(),
                    runnerFlags: z.object({
                        validateActionInput: z.boolean(),
                        validateActionOutput: z.boolean(),
                        validateWebhookInput: z.boolean(),
                        validateWebhookOutput: z.boolean(),
                        validateSyncRecords: z.boolean(),
                        validateSyncMetadata: z.boolean()
                    })
                }),
                error: z.object({
                    type: z.string(),
                    payload: z.record(z.string(), z.unknown()),
                    status: z.number()
                }),
                output: jsonSchema
            })
            .strict() // TODO: strict??????????
            .parse(data),
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = () => {
    return async (req: EndpointRequest<PutTask>, res: EndpointResponse<PutTask>) => {
        const { taskId } = req.params;
        const { nangoProps, error, output } = req.body;
        if (error) {
            await handleError({ taskId, nangoProps, error: error });
        } else if (output) {
            await handleOutput({ taskId, nangoProps, output: output });
        } else {
            res.status(400).json({ error: { code: 'put_task_failed', message: 'missing output or error ' } });
        }
        res.status(201).send();
        return;
    };
};

export const routeHandler: RouteHandler<PutTask> = {
    path,
    method,
    validate,
    handler: handler
};
