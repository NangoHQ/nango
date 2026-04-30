import * as z from 'zod';

import type { LambdaRequestType } from '@nangohq/types';

export const nangoPropsSchema = z.object({
    scriptType: z.enum(['sync', 'action', 'webhook', 'on-event']),
    host: z.string().optional(),
    secretKey: z.string().min(1),
    team: z.object({
        id: z.number(),
        name: z.string().min(1)
    }),
    plan: z
        .object({
            id: z.number(),
            name: z.string().min(1)
        })
        .optional(),
    connectionId: z.string().min(1),
    environmentId: z.number(),
    environmentName: z.string().min(1),
    activityLogId: z.string().min(1),
    providerConfigKey: z.string().min(1),
    provider: z.string().min(1),
    lastSyncDate: z.coerce.date().optional(),
    syncId: z.string().uuid().optional(),
    syncVariant: z.string().optional(),
    nangoConnectionId: z.number(),
    syncJobId: z.number().optional(),
    track_deletes: z.boolean().optional(),
    attributes: z.record(z.string(), z.any()).optional(),
    abortSignal: z.any().optional(), // AbortSignal cannot be validated
    syncConfig: z.object({
        id: z.number(),
        sync_name: z.string().min(1),
        nango_config_id: z.number(),
        file_location: z.string(),
        version: z.string(),
        models: z.array(z.string()),
        active: z.boolean(),
        runs: z.string().nullable(),
        model_schema: z.array(z.any()).optional().nullable(),
        environment_id: z.number(),
        track_deletes: z.boolean(),
        type: z.enum(['sync', 'action', 'on-event']),
        auto_start: z.boolean(),
        attributes: z.record(z.string(), z.any()),
        // TODO: remove optional at second release for smooth migration
        source: z.enum(['catalog', 'standalone', 'repo']).optional(),
        metadata: z.record(z.string(), z.any()),
        input: z.string().nullable(),
        sync_type: z.enum(['full', 'incremental']).nullable(),
        webhook_subscriptions: z.array(z.string()).nullable(),
        enabled: z.boolean(),
        models_json_schema: z.any().nullable(), // JSONSchema7
        sdk_version: z.string().nullable(),
        created_at: z.coerce.date(),
        updated_at: z.coerce.date(),
        deleted_at: z.coerce.date().optional().nullable(),
        deleted: z.boolean().optional()
    }),
    runnerFlags: z.looseObject({
        validateActionInput: z.boolean(),
        validateActionOutput: z.boolean(),
        validateSyncRecords: z.boolean(),
        validateSyncMetadata: z.boolean(),
        functionLogs: z.boolean().optional()
    }),
    logger: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error', 'off'])
    }),
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
    lifecycle: z
        .object({
            killAfterMs: z.number(),
            interruptAfterMs: z.number()
        })
        .optional(),
    integrationConfig: z
        .object({
            oauth_client_id: z.string().nullable(),
            oauth_client_secret: z.string().nullable()
        })
        .optional()
});

const s3RefSchema = z.object({
    kind: z.literal('s3'),
    bucket: z.string(),
    key: z.string(),
    versionId: z.string().optional(),
    etag: z.string().optional()
});

const inlineCodeSchema = z.object({
    code: z.string(),
    codeParams: z.any().optional()
});

const refCodeSchema = z.object({
    codeRef: s3RefSchema,
    codeParamsRef: s3RefSchema.optional()
});

export const functionExecutionSchema = z
    .object({
        taskId: z.string(),
        nangoProps: nangoPropsSchema
    })
    .and(z.union([inlineCodeSchema, refCodeSchema]));

export const readinessCheckSchema = z.object({
    type: z.literal<LambdaRequestType>('readiness_check')
});

export const lambdaInvocationSchema = z.union([functionExecutionSchema, readinessCheckSchema]);

export type FunctionExecutionRequest = z.infer<typeof functionExecutionSchema>;
export type ReadinessCheckRequest = z.infer<typeof readinessCheckSchema>;
export type LambdaInvocation = z.infer<typeof lambdaInvocationSchema>;
