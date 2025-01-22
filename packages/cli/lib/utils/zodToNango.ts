import type { NangoModelField } from '@nangohq/types';
import type { z } from 'zod';

export function zodToNangoModelField(name: string, schema: z.ZodType): NangoModelField {
    const optional = schema.isOptional();
    if (isZodObject(schema)) {
        const values: NangoModelField['value'] = [];
        for (const [key, value] of Object.entries(schema.shape)) {
            values.push(zodToNangoModelField(key, value as z.ZodTypeAny));
        }
        return { name, value: values, optional };
    } else if (isZodString(schema)) {
        return { name, value: 'string', tsType: true, optional };
    } else if (isZodLiteral(schema)) {
        return { name, value: schema._def.value, optional };
    } else if (isZodNumber(schema)) {
        return { name, value: 'number', tsType: true, optional };
    } else if (isZodBoolean(schema)) {
        return { name, value: 'boolean', tsType: true, optional };
    } else if (isZodNull(schema)) {
        return { name, value: null, tsType: true, optional };
    } else if (isZodEnum(schema)) {
        const values: NangoModelField['value'] = [];
        for (const [key, value] of Object.entries(schema._def.values)) {
            values.push({ name: key, value: value as string });
        }
        return { name, value: values, optional, union: true };
    } else if (isZodAny(schema)) {
        return { name, value: 'any', tsType: true, optional };
    } else if (isZodDate(schema)) {
        return { name, value: 'date', tsType: true, optional };
    } else if (isZodRecord(schema)) {
        return { name, value: [{ ...zodToNangoModelField('__string', schema._def.valueType), dynamic: true }], optional };
    } else if (isZodArray(schema)) {
        const value = zodToNangoModelField('0', schema._def.type).value;
        return { name, value, tsType: true, array: true, optional };
    } else if (isZodUnion(schema)) {
        const values: NangoModelField['value'] = [];

        for (const [key, value] of Object.entries(schema._def.options)) {
            values.push(zodToNangoModelField(key, value as z.ZodTypeAny));
        }
        return { name, value: values, tsType: true, union: true, optional };
    } else {
        throw new Error(`not handled, ${JSON.stringify(schema)}`);
    }
}

// We are using type guards because instanceof does not work
// the files are compiled and the zod version loaded by the scripts is the not the same
// (at least that's my interpretation, as it works in unit test)

function isZodObject(schema: z.ZodTypeAny): schema is z.ZodObject<any> {
    return schema.constructor.name === 'ZodObject';
}

function isZodString(schema: z.ZodTypeAny): schema is z.ZodString {
    return schema.constructor.name === 'ZodString';
}

function isZodLiteral(schema: z.ZodTypeAny): schema is z.ZodLiteral<any> {
    return schema.constructor.name === 'ZodLiteral';
}

function isZodNumber(schema: z.ZodTypeAny): schema is z.ZodNumber {
    return schema.constructor.name === 'ZodNumber';
}

function isZodBoolean(schema: z.ZodTypeAny): schema is z.ZodBoolean {
    return schema.constructor.name === 'ZodBoolean';
}

function isZodNull(schema: z.ZodTypeAny): schema is z.ZodNull {
    return schema.constructor.name === 'ZodNull';
}

function isZodEnum(schema: z.ZodTypeAny): schema is z.ZodEnum<any> {
    return schema.constructor.name === 'ZodEnum';
}

function isZodArray(schema: z.ZodTypeAny): schema is z.ZodArray<any> {
    return schema.constructor.name === 'ZodArray';
}

function isZodUnion(schema: z.ZodTypeAny): schema is z.ZodUnion<any> {
    return schema.constructor.name === 'ZodUnion';
}

function isZodAny(schema: z.ZodTypeAny): schema is z.ZodAny {
    return schema.constructor.name === 'ZodAny';
}

function isZodRecord(schema: z.ZodTypeAny): schema is z.ZodRecord {
    return schema.constructor.name === 'ZodRecord';
}

function isZodDate(schema: z.ZodTypeAny): schema is z.ZodDate {
    return schema.constructor.name === 'ZodDate';
}
