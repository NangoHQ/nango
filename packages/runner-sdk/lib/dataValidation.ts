import type { ErrorObject, ValidateFunction } from 'ajv';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema7 } from 'json-schema';

export interface ValidateProps {
    version: string;
    input: unknown;
    modelName: string | null | undefined;
    jsonSchema: JSONSchema7 | undefined | null;
}

let ajv: Ajv;
const cache = new Map<string, ValidateFunction<any>>();

export function clearValidationCache() {
    cache.clear();
}

export type ValidateDataError = ErrorObject | Error;

export function validateData({ version, input, modelName, jsonSchema }: ValidateProps): true | ValidateDataError[] {
    if (!jsonSchema) {
        // For legacy reason, not all scripts have a jsonSchema
        return true;
    }
    if (!modelName) {
        if (input) {
            // Unexpected input while the script expect nothing
            return [{ instancePath: '', keyword: 'type', message: 'must be empty', params: {}, schemaPath: '#/type' }];
        }
        // No expectation and no input, skip everything
        return true;
    }
    if (!jsonSchema['definitions']![modelName]) {
        // Unexpected input while the script expect nothing
        return [new Error(`model_not_found_${modelName}`)];
    }

    if (!ajv) {
        ajv = new Ajv({ allErrors: true, discriminator: true });
        addFormats(ajv);
    }

    let validator: ValidateFunction<any>;
    try {
        const key = `${modelName}-${version}`;
        if (cache.has(key)) {
            validator = cache.get(key)!;
        } else {
            // append all definitions and set current model name as the entry point
            validator = ajv.compile({ ...(jsonSchema as any), ...(jsonSchema['definitions']![modelName] as any) });
            cache.set(key, validator);
        }

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
