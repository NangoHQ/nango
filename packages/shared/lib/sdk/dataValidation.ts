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
}): true | ErrorObject[] {
    if (!jsonSchema || !modelName) {
        return true;
    }

    const ajv = new Ajv({ allErrors: true, discriminator: true });
    const validate = ajv.compile({ ...(jsonSchema as any), ...(jsonSchema['definitions']![modelName] as any) });
    const val = validate(input);
    if (val) {
        return true;
    }

    const bag: ErrorObject[] = [];
    for (const error of validate.errors!) {
        if (!error.message || error.message === ' ') {
            continue;
        }

        bag.push(error);
    }
    return bag;
}
