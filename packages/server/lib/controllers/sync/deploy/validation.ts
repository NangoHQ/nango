import * as z from 'zod';

import { frequencySchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';

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
                            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
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
                            DELETE: z.string().optional()
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

function validateNoDuplicateOnEventNames({
    scriptGroups,
    pathPrefix,
    issues
}: {
    scriptGroups:
        | {
              providerConfigKey: string;
              scripts: { name: string }[];
          }[]
        | undefined;
    pathPrefix: 'onEventScriptsByProvider' | 'postConnectionScriptsByProvider';
    issues: {
        push: (issue: { code: 'custom'; message: string; path: (string | number)[]; input: unknown }) => void;
    };
}) {
    if (!scriptGroups) {
        return;
    }

    for (const [groupIndex, group] of scriptGroups.entries()) {
        const seenNames = new Set<string>();

        for (const [scriptIndex, script] of group.scripts.entries()) {
            if (seenNames.has(script.name)) {
                issues.push({
                    code: 'custom',
                    message: `On-event function "${script.name}" is used multiple times. Please make sure all on-event function names are unique within an integration.`,
                    path: [pathPrefix, groupIndex, 'scripts', scriptIndex, 'name'],
                    input: script.name
                });
                continue;
            }

            seenNames.add(script.name);
        }
    }
}

const commonValidation = z
    .object({
        flowConfigs,
        onEventScriptsByProvider: onEventScriptsByProvider.optional(),
        // postConnectionScriptsByProvider is deprecated but still supported for backwards compatibility
        postConnectionScriptsByProvider: postConnectionScriptsByProvider.optional(),
        jsonSchema: jsonSchema.optional(),
        reconcile: z.boolean(),
        debug: z.boolean(),
        deployMode: z.enum(['all', 'single', 'integration']).optional(),
        // singleDeployMode is deprecated in favour of deployMode — kept for older CLI versions
        singleDeployMode: z.boolean().optional(),
        sdkVersion: z
            .string()
            .regex(/[0-9]+\.[0-9]+\.[0-9]+-(zero|yaml)/)
            .optional(),
        source: z.enum(['standalone', 'repo']).optional()
    })
    .strict();

function validateUniqueOnEventNames(
    data: z.infer<typeof commonValidation>,
    issues: { push: (issue: { code: 'custom'; message: string; path: (string | number)[]; input: unknown }) => void }
) {
    validateNoDuplicateOnEventNames({ scriptGroups: data.onEventScriptsByProvider, pathPrefix: 'onEventScriptsByProvider', issues });
    validateNoDuplicateOnEventNames({ scriptGroups: data.postConnectionScriptsByProvider, pathPrefix: 'postConnectionScriptsByProvider', issues });
}

export const validation = commonValidation
    .check((payload) => {
        validateUniqueOnEventNames(payload.value, payload.issues);
    })
    .transform((data) => ({
        ...data,
        deployMode: data.deployMode ?? (data.singleDeployMode ? 'single' : 'all')
    }));

export const validationWithNangoYaml = commonValidation
    .extend({
        nangoYamlBody: z.string()
    })
    .check((payload) => {
        validateUniqueOnEventNames(payload.value, payload.issues);
    })
    .transform((data) => ({
        ...data,
        deployMode: data.deployMode ?? (data.singleDeployMode ? 'single' : 'all'),
        onEventScriptsByProvider: data.onEventScriptsByProvider || data.postConnectionScriptsByProvider
    }));
