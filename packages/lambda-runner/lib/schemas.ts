import * as zod from 'zod';

export const nangoPropsSchema = zod.object({
    scriptType: zod.enum(['sync', 'action', 'webhook', 'on-event']),
    host: zod.string().optional(),
    secretKey: zod.string().min(1),
    team: zod.object({
        id: zod.number(),
        name: zod.string().min(1)
    }),
    plan: zod
        .object({
            id: zod.number(),
            name: zod.string().min(1)
        })
        .optional(),
    connectionId: zod.string().min(1),
    environmentId: zod.number(),
    environmentName: zod.string().min(1),
    activityLogId: zod.string().min(1),
    providerConfigKey: zod.string().min(1),
    provider: zod.string().min(1),
    lastSyncDate: zod.coerce.date().optional(),
    syncId: zod.string().uuid().optional(),
    syncVariant: zod.string().optional(),
    nangoConnectionId: zod.number(),
    syncJobId: zod.number().optional(),
    track_deletes: zod.boolean().optional(),
    attributes: zod.record(zod.string(), zod.any()).optional(),
    abortSignal: zod.any().optional(), // AbortSignal cannot be validated
    syncConfig: zod.object({
        id: zod.number(),
        sync_name: zod.string().min(1),
        nango_config_id: zod.number(),
        file_location: zod.string(),
        version: zod.string(),
        models: zod.array(zod.string()),
        active: zod.boolean(),
        runs: zod.string().nullable(),
        model_schema: zod.array(zod.any()).optional().nullable(),
        environment_id: zod.number(),
        track_deletes: zod.boolean(),
        type: zod.enum(['sync', 'action', 'on-event']),
        auto_start: zod.boolean(),
        attributes: zod.record(zod.string(), zod.any()),
        pre_built: zod.boolean(),
        is_public: zod.boolean(),
        metadata: zod.record(zod.string(), zod.any()),
        input: zod.string().nullable(),
        sync_type: zod.enum(['full', 'incremental']).nullable(),
        webhook_subscriptions: zod.array(zod.string()).nullable(),
        enabled: zod.boolean(),
        models_json_schema: zod.any().nullable(), // JSONSchema7
        sdk_version: zod.string().nullable(),
        created_at: zod.coerce.date(),
        updated_at: zod.coerce.date(),
        deleted_at: zod.coerce.date().optional().nullable(),
        deleted: zod.boolean().optional()
    }),
    runnerFlags: zod.looseObject({
        validateActionInput: zod.boolean(),
        validateActionOutput: zod.boolean(),
        validateSyncRecords: zod.boolean(),
        validateSyncMetadata: zod.boolean(),
        functionLogs: zod.boolean().optional()
    }),
    logger: zod.object({
        level: zod.enum(['debug', 'info', 'warn', 'error', 'off'])
    }),
    debug: zod.boolean(),
    startedAt: zod.coerce.date(),
    endUser: zod
        .object({
            id: zod.number(),
            endUserId: zod.string().nullable(),
            orgId: zod.string().nullable()
        })
        .nullable(),
    heartbeatTimeoutSecs: zod.number().optional(),
    isCLI: zod.boolean().optional()
});

export const requestSchema = zod.object({
    taskId: zod.string(),
    codeParams: zod.any().optional(),
    code: zod.string(),
    nangoProps: nangoPropsSchema
});
