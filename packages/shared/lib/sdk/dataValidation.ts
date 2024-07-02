import type { ErrorObject } from 'ajv';
import { Ajv } from 'ajv';
import type { JSONSchema7 } from 'json-schema';

export function validateInput({
    input,
    modelName,
    jsonSchema
}: {
    input: unknown;
    modelName: string | undefined;
    jsonSchema: JSONSchema7 | undefined | null;
}): true | (ErrorObject | Error)[] {
    if (!jsonSchema || !modelName) {
        return true;
    }

    const ajv = new Ajv({ allErrors: true, discriminator: true });
    let validator;
    try {
        validator = ajv.compile({ ...(jsonSchema as any), ...(jsonSchema['definitions']![modelName] as any) });

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
