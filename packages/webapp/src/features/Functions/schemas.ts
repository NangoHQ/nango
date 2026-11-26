import { resolveSchemaReference } from '@/features/Playground/input.utils';
import { isNullSchema, isObjectWithNoProperties } from '@/pages/Integrations/components/jsonSchema/utils';

import type { ListedNangoFunction, NangoFunctionTemplate, NangoToolFunction } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export interface FunctionSchemas {
    inputSchema: JSONSchema7 | null;
    outputSchemas: { name: string; schema: JSONSchema7 }[];
}

export function toFunctionSchemas(fn: ListedNangoFunction | NangoFunctionTemplate | NangoToolFunction): FunctionSchemas {
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

function displaySchema(value: JSONSchema7 | boolean | null | undefined, root?: JSONSchema7 | null): JSONSchema7 | null {
    if (!value || typeof value !== 'object') return null;
    const resolved = resolveSchemaReference(value, root ?? value);
    return isNullSchema(resolved) || isObjectWithNoProperties(resolved) ? null : resolved;
}
