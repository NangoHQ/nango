import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';

import type { SimplifiedJSONSchema } from '@nangohq/types';

import type { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function jsonSchemaToZod(schema: SimplifiedJSONSchema): z.ZodString {
    let field = z.string();
    if (schema.format === 'hostname') field = field.regex(/^[a-zA-Z0-9-]$/);
    else if (schema.format === 'uuid') field = field.uuid();
    else if (schema.format === 'uri') field = field.url();
    if (schema.pattern) field = field.regex(new RegExp(schema.pattern), { message: `Incorrect ${schema.title}` });

    return field;
}
