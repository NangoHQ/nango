import { z } from 'zod';
import type { NangoModelField } from '@nangohq/types';
import { providerConfigKeySchema } from '../../../helpers/validation.js';

const fileBody = z.object({ js: z.string(), ts: z.string() }).strict();
const jsonSchema = z
    .object({
        $schema: z.literal('http://json-schema.org/draft-07/schema#'),
        $comment: z.string(),
        definitions: z.record(z.string(), z.object({}))
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
        runs: z.string(),
        auto_start: z.boolean().optional().default(false),
        attributes: z.object({}).optional(),
        metadata: z
            .object({
                scopes: z.array(z.string().max(255)).optional(),
                description: z.string().max(2000).optional()
            })
            .strict()
            .optional(),
        model_schema: z.union([z.string(), z.array(nangoModel)]),
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
        syncName: z.string(),
        providerConfigKey: providerConfigKeySchema,
        fileBody,
        version: z.string().optional(),
        track_deletes: z.boolean().optional().default(false),
        sync_type: z.enum(['incremental', 'full']).optional(),
        webhookSubscriptions: z.array(z.string().max(255)).optional()
    })
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
                        event: z.enum(['post-connection-creation', 'pre-connection-deletion'])
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
                event: 'post-connection-creation'
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
        singleDeployMode: z.boolean().optional().default(false)
    })
    .strict();

const addOnEventScriptsValidation = <T extends z.ZodType>(schema: T) =>
    // cannot transform commonValidation because it cannot be merge with another schema
    // https://github.com/colinhacks/zod/issues/2474
    schema.transform((data) => ({
        ...data,
        onEventScriptsByProvider: data.onEventScriptsByProvider || data.postConnectionScriptsByProvider
    }));

export const validation = addOnEventScriptsValidation(commonValidation);

export const validationWithNangoYaml = addOnEventScriptsValidation(
    commonValidation.merge(
        z.object({
            nangoYamlBody: z.string()
        })
    )
);
