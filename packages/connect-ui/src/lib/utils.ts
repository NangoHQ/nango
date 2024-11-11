import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';

import type { SimplifiedJSONSchema } from '@nangohq/types';

import type { ClassValue } from 'clsx';
import type { ZodTypeAny } from 'zod';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function jsonSchemaToZod(schema: SimplifiedJSONSchema): ZodTypeAny {
    let fieldString = z.string();
    if (schema.format === 'hostname') {
        fieldString = fieldString.regex(/^[a-zA-Z0-9.-]+$/, 'Invalid hostname');
    } else if (schema.format === 'uuid') {
        fieldString = fieldString.uuid();
    } else if (schema.format === 'uri') {
        fieldString = fieldString.url();
    }
    if (schema.pattern) {
        fieldString = fieldString.regex(new RegExp(schema.pattern), { message: `Incorrect ${schema.title}` });
    }

    if ('optional' in schema && schema.optional === true) {
        // https://stackoverflow.com/questions/73715295/react-hook-form-with-zod-resolver-optional-field
        return z.union([fieldString, z.literal('')]);
    }

    return fieldString;
}
