import { z } from 'zod';

import { operationIdRegex } from '@nangohq/logs';

export const nangoPropsSchema = z.looseObject({
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
    heartbeatTimeoutSecs: z.number().optional(),
    syncConfig: z.looseObject({
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
    }),
    syncId: z.string().uuid().optional(),
    syncJobId: z.number().optional(),
    activityLogId: operationIdRegex,
    secretKey: z.string().min(1),
    debug: z.boolean(),
    startedAt: z.coerce.date(),
    endUser: z.object({ id: z.number(), endUserId: z.string().nullable(), orgId: z.string().nullable() }).nullable(),
    runnerFlags: z.looseObject({
        validateActionInput: z.boolean().default(false),
        validateActionOutput: z.boolean().default(false),
        validateWebhookInput: z.boolean().default(false),
        validateWebhookOutput: z.boolean().default(false),
        validateSyncRecords: z.boolean().default(false),
        validateSyncMetadata: z.boolean().default(false)
    }),
    logger: z
        .looseObject({
            level: z.enum(['debug', 'info', 'warn', 'error', 'off'])
        })
        .default({ level: 'info' })
});
