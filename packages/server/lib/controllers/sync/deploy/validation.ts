import * as z from 'zod';

import { resolveLegacyDeployScope } from '@nangohq/shared';

import { frequencySchema, providerConfigKeySchema, reconciliationScopeSchema, syncNameSchema } from '../../../helpers/validation.js';

import type { Feature, NangoModelField, OnEventType } from '@nangohq/types';

const fileBody = z.object({ js: z.string(), ts: z.string() }).strict();
const jsonSchema = z
    .object({
        $schema: z.literal('http://json-schema.org/draft-07/schema#'),
        $comment: z.string(),
        definitions: z.record(z.string(), z.looseObject({}))
    })
    .strict();

const nangoModelFieldsBase = z.object({
    name: z.string(),
    dynamic: z.boolean().optional(),
    model: z.boolean().optional(),
    union: z.boolean().optional(),
    array: z.boolean().optional(),
    tsType: z.boolean().optional(),
    optional: z.boolean().optional()
});

const nangoModelFields: z.ZodType<NangoModelField> = nangoModelFieldsBase
    .extend({
        value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.lazy(() => nangoModelFields.array())])
    })
    .strict();

const nangoModel = z
    .object({
        name: z.string().max(255),
        fields: z.array(nangoModelFields),
        isAnon: z.boolean().optional()
    })
    .strict();

export const flowConfig = z
    .object({
        type: z.enum(['action', 'sync']),
        models: z.array(z.string().min(1).max(255)),
        runs: z.union([z.string().length(0), frequencySchema]).nullable(), // TODO: remove or after >0.58.5 is widely adopted
        auto_start: z.boolean().optional().default(false),
        attributes: z.object({}).optional(),
        metadata: z
            .object({
                scopes: z.array(z.string().max(255)).optional(),
                description: z.string().max(2000).optional()
            })
            .strict()
            .optional(),
        model_schema: z.union([z.string(), z.array(nangoModel)]).optional(),
        input: z.union([z.string().max(255), z.any()]).optional(),
        endpoints: z
            .array(
                z.union([
                    z
                        .object({
                            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND', 'REPORT']),
                            path: z.string(),
                            group: z.string().min(1).max(64).optional()
                        })
                        .strict(),
                    z
                        .object({
                            GET: z.string().optional(),
                            POST: z.string().optional(),
                            PATCH: z.string().optional(),
                            PUT: z.string().optional(),
                            DELETE: z.string().optional(),
                            PROPFIND: z.string().optional(),
                            REPORT: z.string().optional()
                        })
                        .strict()
                ])
            )
            .optional(),
        syncName: syncNameSchema,
        providerConfigKey: providerConfigKeySchema,
        fileBody,
        version: z.string().optional(),
        track_deletes: z.boolean().optional().default(false),
        sync_type: z.enum(['incremental', 'full']).optional(),
        webhookSubscriptions: z.array(z.string().max(255)).optional(),
        models_json_schema: z
            .object({
                definitions: z.record(z.string(), z.looseObject({}))
            })
            .optional(),
        features: z.array(z.enum(['checkpoints'] satisfies Feature[])).default([])
    })
    .refine(
        (data) => {
            if (data.sync_type === 'incremental' && data.track_deletes) {
                return false;
            }
            return true;
        },
        { message: 'Track deletes is not supported for incremental syncs', path: ['track_deletes'] }
    )
    .refine(
        (data) => {
            if (!data.models_json_schema) return true;
            const definitions = data.models_json_schema.definitions;
            const topLevelModels = [...data.models, ...(typeof data.input === 'string' ? [data.input] : [])];
            return topLevelModels.every((model) => model in definitions);
        },
        { message: 'models_json_schema is missing definitions for some models or input', path: ['models_json_schema'] }
    )
    .strict();
const flowConfigs = z.array(flowConfig);
const onEventScriptsByProvider = z.array(
    z
        .object({
            providerConfigKey: providerConfigKeySchema,
            scripts: z.array(
                z
                    .object({
                        name: z.string().min(1).max(255),
                        fileBody,
                        event: z.enum(['post-connection-creation', 'pre-connection-deletion', 'validate-connection'])
                    })
                    .strict()
            )
        })
        .strict()
);
// DEPRECATED
const postConnectionScriptsByProvider = z.array(
    z
        .object({
            providerConfigKey: providerConfigKeySchema,
            scripts: z.array(z.object({ name: z.string().min(1).max(255), fileBody }).strict())
        })
        .strict()
        .transform((data) => ({
            providerConfigKey: data.providerConfigKey,
            scripts: data.scripts.map((script) => ({
                name: script.name,
                fileBody: script.fileBody,
                event: 'post-connection-creation' as OnEventType
            }))
        }))
);

const commonValidation = z
    .object({
        flowConfigs,
        onEventScriptsByProvider: onEventScriptsByProvider.optional(),
        // postConnectionScriptsByProvider is deprecated but still supported for backwards compatibility
        postConnectionScriptsByProvider: postConnectionScriptsByProvider.optional(),
        jsonSchema: jsonSchema.optional(),
        reconcile: z.boolean(),
        debug: z.boolean(),
        // TODO: Support single-script deployments through reconciliationScope and deprecate deployMode, retaining compatibility with older CLIs.
        deployMode: z.enum(['all', 'single', 'integration']).optional(),
        // singleDeployMode is deprecated in favour of deployMode — kept for older CLI versions
        singleDeployMode: z.boolean().optional(),
        reconciliationScope: reconciliationScopeSchema.optional(),
        sdkVersion: z
            .string()
            .regex(/[0-9]+\.[0-9]+\.[0-9]+-(zero|yaml)/)
            .optional(),
        source: z.enum(['standalone', 'repo']).optional()
    })
    .strict();

function resolveDeployMode(data: Pick<z.infer<typeof commonValidation>, 'deployMode' | 'singleDeployMode'>) {
    return data.deployMode ?? (data.singleDeployMode ? 'single' : 'all');
}

function checkReconciliationScope(data: z.infer<typeof commonValidation>, ctx: z.RefinementCtx) {
    const scope = data.reconciliationScope;
    if (!scope) {
        return;
    }
    const deployMode = resolveDeployMode(data);
    const expectedDeployMode = scope.kind === 'environment' ? 'all' : 'integration';
    if (deployMode !== expectedDeployMode) {
        ctx.addIssue({
            code: 'custom',
            message: `A reconciliation scope of kind "${scope.kind}" requires deployMode "${expectedDeployMode}"`,
            path: ['reconciliationScope']
        });
        return;
    }
    if (scope.kind === 'integration') {
        const providerConfigKeys = [
            ...data.flowConfigs.map((flow) => flow.providerConfigKey),
            ...(data.onEventScriptsByProvider ?? data.postConnectionScriptsByProvider ?? []).map((provider) => provider.providerConfigKey)
        ];
        if (providerConfigKeys.some((providerConfigKey) => providerConfigKey !== scope.integrationId)) {
            ctx.addIssue({
                code: 'custom',
                message: 'Scripts must match the integration reconciliation scope',
                path: ['reconciliationScope']
            });
        }
    }
}

function withScope<T extends z.infer<typeof commonValidation>>(data: T) {
    const deployMode = resolveDeployMode(data);
    return {
        ...data,
        deployMode,
        scope: resolveLegacyDeployScope({ deployMode, reconciliationScope: data.reconciliationScope, flows: data.flowConfigs })
    };
}

export const validation = commonValidation.superRefine(checkReconciliationScope).transform(withScope);

export const validationWithNangoYaml = commonValidation
    .extend({
        nangoYamlBody: z.string()
    })
    .refine((data) => !data.nangoYamlBody, {
        message:
            'The `nango.yaml` configuration file is no longer supported. See the migration guide to Zero YAML: https://nango.dev/docs/guides/platform/migrations/migrate-to-zero-yaml',
        path: ['nangoYamlBody']
    })
    .superRefine(checkReconciliationScope)
    .transform((data) => ({ ...withScope(data), onEventScriptsByProvider: data.onEventScriptsByProvider || data.postConnectionScriptsByProvider }));
