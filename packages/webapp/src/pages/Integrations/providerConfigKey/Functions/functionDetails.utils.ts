import { resolveSchemaReference } from '@/features/Playground/input.utils';
import { buildPullCommand, isRunnableFunction, isSyncOrAction } from '@/utils/scripts';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';

import type { FunctionListSource, FunctionListType, FunctionType, ListedNangoFunction, NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export type DetailsFunction = ListedNangoFunction | NangoFunctionTemplate;

export interface FunctionDetails {
    name: string;
    description?: string;
    typeLabel: string;
    source: FunctionListSource | 'template';
    scopes: string[];
    frequency: string | null;
    inputSchema: JSONSchema7 | null;
    outputSchemas: { name: string; schema: JSONSchema7 }[];
    pullCommand: string | null;
    runType: 'sync' | 'action' | 'tool' | null;
    delete: { type: 'sync' | 'action'; description: string } | undefined;
    code: { kind: 'deployed'; type: FunctionListType } | { kind: 'template'; type: FunctionType };
}

export function toFunctionDetails(fn: DetailsFunction, { env, integration }: { env: string; integration: string }): FunctionDetails {
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
        }
    };
    if (fn.type === 'tool') {
        const outputSchema = displaySchema(fn.output_json_schema);
        return {
            ...base,
            scopes: fn.meta.required_scopes ?? [],
            inputSchema: displaySchema(fn.input_json_schema),
            outputSchemas: outputSchema ? [{ name: 'Output', schema: outputSchema }] : [],
            pullCommand: null,
            code: { kind: 'deployed', type: 'tool' }
        };
    }
    const schema = fn.type !== 'on-event' ? fn.json_schema : null;
    const input = fn.type !== 'on-event' && fn.input ? schema?.definitions?.[fn.input] : null;
    return {
        ...base,
        scopes: fn.scopes ?? [],
        inputSchema: displaySchema(input, schema),
        outputSchemas:
            fn.type === 'on-event'
                ? []
                : fn.returns.flatMap((name) => {
                      const output = displaySchema(schema?.definitions?.[name], schema);
                      return output ? [{ name, schema: output }] : [];
                  }),
        pullCommand: buildPullCommand({ integration, name: fn.name, type: fn.type, source: listed ? { env } : { catalog: true } }),
        code: listed ? { kind: 'deployed', type: fn.type } : { kind: 'template', type: fn.type }
    };
}

function displaySchema(value: JSONSchema7 | boolean | null | undefined, root?: JSONSchema7 | null): JSONSchema7 | null {
    if (!value || typeof value !== 'object') return null;
    const resolved = resolveSchemaReference(value, root ?? value);
    return isNullSchema(resolved) || isObjectWithNoProperties(resolved) ? null : resolved;
}
