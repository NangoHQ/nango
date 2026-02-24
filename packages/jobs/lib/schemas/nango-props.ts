import { z } from 'zod';

import { operationIdRegex } from '@nangohq/logs';

/**
 * Zod schema for NangoProps, matching the shape from @nangohq/types (packages/types/lib/runner/sdk.ts).
 * Used when parsing serialized nangoProps (e.g. from Lambda request payloads or task callbacks).
 */
export const nangoPropsSchema = z.looseObject({
    scriptType: z.enum(['sync', 'action', 'webhook', 'on-event']),
    host: z.string().optional(),
    secretKey: z.string().min(1),
    team: z.object({
        id: z.number(),
        name: z.string().min(1)
    }),
    connectionId: z.string().min(1),
    environmentId: z.number(),
    environmentName: z.string().min(1),
    activityLogId: operationIdRegex,
    providerConfigKey: z.string().min(1),
    provider: z.string().min(1),
    lastSyncDate: z.coerce.date().optional(),
    syncId: z.string().uuid().optional(),
    syncVariant: z.string().optional(),
    nangoConnectionId: z.number(),
    syncJobId: z.number().optional(),
    track_deletes: z.boolean().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
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
        webhook_subscriptions: z.array(z.string()).nullable(),
        model_schema: z.array(z.unknown()).optional().nullable(),
        models_json_schema: z.record(z.string(), z.unknown()).nullable(),
        created_at: z.coerce.date(),
        updated_at: z.coerce.date(),
        version: z.string(),
        attributes: z.record(z.string(), z.unknown()),
        pre_built: z.boolean(),
        is_public: z.boolean(),
        input: z.string().nullable(),
        sync_type: z.enum(['full', 'incremental']).nullable(),
        metadata: z.record(z.string(), z.unknown()),
        sdk_version: z.string().nullable()
    }),
    runnerFlags: z.looseObject({
        validateActionInput: z.boolean().default(false),
        validateActionOutput: z.boolean().default(false),
        validateSyncRecords: z.boolean().default(false),
        validateSyncMetadata: z.boolean().default(false)
    }),
    logger: z
        .looseObject({
            level: z.enum(['debug', 'info', 'warn', 'error', 'off'])
        })
        .default({ level: 'info' }),
    debug: z.boolean(),
    startedAt: z.coerce.date(),
    endUser: z
        .object({
            id: z.number(),
            endUserId: z.string().nullable(),
            orgId: z.string().nullable()
        })
        .nullable(),
    heartbeatTimeoutSecs: z.number().optional(),
    isCLI: z.boolean().optional(),
    integrationConfig: z.record(z.string(), z.unknown()).optional()
});
