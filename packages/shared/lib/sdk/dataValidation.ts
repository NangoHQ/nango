import type { ErrorObject } from 'ajv';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema7 } from 'json-schema';

export interface ValidateProps {
    input: unknown;
    modelName: string | undefined;
    jsonSchema: JSONSchema7 | undefined | null;
}

export function validateData({ input, modelName, jsonSchema }: ValidateProps): true | (ErrorObject | Error)[] {
    if (!jsonSchema) {
        // For legacy reason, not all scripts have a jsonSchema
        return true;
    }
    if (!modelName && input) {
        // Unexpected input while the script expect nothing
        return [{ instancePath: '', keyword: 'type', message: 'must be empty', params: {}, schemaPath: '#/type' }];
    }
    if (!modelName && !input) {
        // No expectation and no input, skip everything
        return true;
    }

    const ajv = new Ajv({ allErrors: true, discriminator: true });
    addFormats(ajv);
    let validator;
    try {
        // append all definitions and set current model name as the entry point
        validator = ajv.compile({ ...(jsonSchema as any), ...(jsonSchema['definitions']![modelName!] as any) });

        if (validator(input)) {
            return true;
        }
    } catch (err) {
        return [err instanceof Error ? err : new Error('failed_to_parse_json_schema')];
    }

    const bag: ErrorObject[] = [];
    for (const error of validator.errors!) {
        if (!error.message) {
            continue;
        }

        bag.push(error);
    }

    return bag;
}
