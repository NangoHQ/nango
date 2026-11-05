import { resolveSchemaReference } from '@/features/Playground/input.utils';
import { buildPullCommand, isRunnableFunction, isSyncOrAction } from '@/utils/scripts';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';

import type { FunctionListSource, FunctionListType, FunctionType, ListedNangoFunction, NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export type DetailsFunction = ListedNangoFunction | NangoFunctionTemplate;

export interface FunctionDetails extends FunctionSchemas {
    name: string;
    description?: string;
    typeLabel: string;
    source: FunctionListSource | 'template';
    scopes: string[];
    scopesMatch: 'all' | 'any';
    frequency: string | null;
    pullCommand: string | null;
    runType: 'sync' | 'action' | 'tool' | null;
    delete: { type: 'sync' | 'action'; description: string } | undefined;
    code: { kind: 'deployed'; type: FunctionListType } | { kind: 'template'; type: FunctionType };
}

export interface FunctionSchemas {
    inputSchema: JSONSchema7 | null;
    outputSchemas: { name: string; schema: JSONSchema7 }[];
}

export function toFunctionSchemas(fn: DetailsFunction): FunctionSchemas {
    if (fn.type === 'tool') {
        const outputSchema = displaySchema(fn.output_json_schema);
        return {
            inputSchema: displaySchema(fn.input_json_schema),
            outputSchemas: outputSchema ? [{ name: 'Output', schema: outputSchema }] : []
        };
    }
    if (fn.type === 'on-event') {
        return { inputSchema: null, outputSchemas: [] };
    }
    const schema = fn.json_schema;
    const input = fn.input ? schema?.definitions?.[fn.input] : null;
    return {
        inputSchema: displaySchema(input, schema),
        outputSchemas: fn.returns.flatMap((name) => {
            const output = displaySchema(schema?.definitions?.[name], schema);
            return output ? [{ name, schema: output }] : [];
        })
    };
}

export function toFunctionDetails(
    fn: DetailsFunction,
    { env, integration, provider }: { env: string; integration: string; provider: string }
): FunctionDetails {
    const listed = 'enabled' in fn;
    const deleteType = listed && fn.source !== 'repo' && fn.id != null && isSyncOrAction(fn) ? fn.type : undefined;
    const base = {
        name: fn.name,
        description: fn.description,
        typeLabel: fn.type === 'on-event' ? 'trigger' : fn.type,
        source: listed ? fn.source : ('template' as const),
        frequency: fn.type === 'sync' ? fn.runs : null,
        runType: listed && fn.enabled && isRunnableFunction(fn) ? fn.type : null,
        delete: deleteType && {
            type: deleteType,
            description:
                deleteType === 'sync'
                    ? `You are about to permanently delete the sync "${fn.name}" and all of its synced records. This operation is not reversible, are you sure you wish to continue?`
                    : `You are about to permanently delete the action "${fn.name}". This operation is not reversible, are you sure you wish to continue?`
        },
        ...toFunctionSchemas(fn)
    };
    if (fn.type === 'tool') {
        const requiredScopes = fn.meta.required_scopes;
        return {
            ...base,
            scopes: requiredScopes?.all ?? requiredScopes?.any ?? [],
            scopesMatch: requiredScopes?.any ? 'any' : 'all',
            pullCommand: null,
            code: { kind: 'deployed', type: 'tool' }
        };
    }
    return {
        ...base,
        scopes: fn.scopes ?? [],
        scopesMatch: 'all',
        pullCommand: buildPullCommand({ integration, name: fn.name, type: fn.type, source: listed ? { env } : { catalog: true, provider } }),
        code: listed ? { kind: 'deployed', type: fn.type } : { kind: 'template', type: fn.type }
    };
}

function displaySchema(value: JSONSchema7 | boolean | null | undefined, root?: JSONSchema7 | null): JSONSchema7 | null {
    if (!value || typeof value !== 'object') return null;
    const resolved = resolveSchemaReference(value, root ?? value);
    return isNullSchema(resolved) || isObjectWithNoProperties(resolved) ? null : resolved;
}
