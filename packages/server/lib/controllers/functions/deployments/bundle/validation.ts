import * as z from 'zod';

import { providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';

import type { FunctionDeploymentBundleBody, FunctionReconciliationScope, FunctionTriggerDefinition } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const schemaReference = z.string().regex(/^#\/definitions\/[a-zA-Z0-9_-]+$/);
const nullableSchemaReference = schemaReference.nullable();
const jsonSchema = z.custom<JSONSchema7>((value) => typeof value === 'object' && value !== null && !Array.isArray(value), 'Expected a JSON Schema object');
const debounceKeySource = z.union([z.object({ body: z.string() }).strict(), z.object({ header: z.string() }).strict()]);
const trigger = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).strict(),
    z.object({ kind: z.literal('schedule'), frequency: z.string(), autoStart: z.boolean().optional() }).strict(),
    z
        .object({
            kind: z.literal('http'),
            subscriptions: z.array(z.string()).optional(),
            debounce: z
                .object({
                    keyBy: z.union([debounceKeySource, z.array(debounceKeySource)]).optional(),
                    windowMs: z.number(),
                    maxEntities: z.number().optional(),
                    take: z.enum(['latest', 'first', 'all']).optional()
                })
                .strict()
                .optional()
        })
        .strict(),
    z
        .object({
            kind: z.literal('event'),
            events: z.array(z.enum(['post-connection-creation', 'pre-connection-deletion', 'validate-connection']))
        })
        .strict()
]) satisfies z.ZodType<FunctionTriggerDefinition>;
const requires = z.union([
    z
        .object({
            connection: z.literal(true).optional(),
            outbound: z.boolean().optional(),
            invoke: z.boolean().optional()
        })
        .strict(),
    z
        .object({
            connection: z.literal(false),
            outbound: z.literal(false).optional(),
            invoke: z.boolean().optional()
        })
        .strict()
]);
const capabilities = z
    .object({
        usesRecords: z.boolean(),
        usesOutbound: z.boolean(),
        usesCheckpoints: z.boolean(),
        usesMetadata: z.boolean(),
        usesInvoke: z.boolean()
    })
    .strict();
const limits = z
    .object({
        concurrency: z
            .object({
                perConnection: z.union([z.literal(1), z.literal('max')])
            })
            .strict()
            .optional()
    })
    .strict();

function referencesDefinition(schema: JSONSchema7, reference: string | null): boolean {
    return !reference || reference.slice('#/definitions/'.length) in (schema.definitions ?? {});
}

const functionConfig = z
    .object({
        name: scriptNameSchema,
        integrationId: providerConfigKeySchema,
        description: z.string().max(2000),
        trigger,
        requires,
        capabilities,
        limits,
        input_schema_ref: nullableSchemaReference,
        output_schema_ref: nullableSchemaReference,
        model_schema_refs: z.array(schemaReference),
        metadata_schema_ref: nullableSchemaReference,
        checkpoint_schema_ref: nullableSchemaReference,
        json_schema: jsonSchema,
        fileBody: z
            .object({
                js: z.string().min(1),
                ts: z.string().min(1)
            })
            .strict()
    })
    .strict()
    .refine((fn) => fn.capabilities.usesOutbound === (fn.requires.connection !== false && fn.requires.outbound !== false), {
        message: 'usesOutbound must match requires.outbound',
        path: ['capabilities', 'usesOutbound']
    })
    .refine((fn) => fn.capabilities.usesRecords === fn.model_schema_refs.length > 0, {
        message: 'usesRecords must match model_schema_refs',
        path: ['capabilities', 'usesRecords']
    })
    .refine((fn) => fn.capabilities.usesMetadata === (fn.metadata_schema_ref !== null), {
        message: 'usesMetadata must match metadata_schema_ref',
        path: ['capabilities', 'usesMetadata']
    })
    .refine((fn) => fn.capabilities.usesCheckpoints === (fn.checkpoint_schema_ref !== null), {
        message: 'usesCheckpoints must match checkpoint_schema_ref',
        path: ['capabilities', 'usesCheckpoints']
    })
    .refine((fn) => fn.capabilities.usesInvoke === (fn.requires.invoke === true), {
        message: 'usesInvoke must match requires.invoke',
        path: ['capabilities', 'usesInvoke']
    })
    .refine(
        (fn) =>
            [fn.input_schema_ref, fn.output_schema_ref, ...fn.model_schema_refs, fn.metadata_schema_ref, fn.checkpoint_schema_ref].every((reference) =>
                referencesDefinition(fn.json_schema, reference)
            ),
        {
            message: 'Schema references must exist in json_schema.definitions',
            path: ['json_schema', 'definitions']
        }
    );

export const validation = z
    .object({
        reconciliationScope: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('environment') }).strict(),
            z.object({ kind: z.literal('integration'), integrationId: providerConfigKeySchema }).strict()
        ]) satisfies z.ZodType<FunctionReconciliationScope>,
        functions: z.array(functionConfig)
    })
    .strict()
    .refine(
        (body) => {
            const keys = body.functions.map((fn) => `${fn.integrationId}:${fn.name}`);
            return new Set(keys).size === keys.length;
        },
        {
            message: 'Function names must be unique per integration',
            path: ['functions']
        }
    )
    .refine(
        (body) => {
            if (body.reconciliationScope.kind !== 'integration') {
                return true;
            }
            const integrationId = body.reconciliationScope.integrationId;
            return body.functions.every((fn) => fn.integrationId === integrationId);
        },
        {
            message: 'Functions must match the integration reconciliation scope',
            path: ['functions']
        }
    ) satisfies z.ZodType<FunctionDeploymentBundleBody>;
