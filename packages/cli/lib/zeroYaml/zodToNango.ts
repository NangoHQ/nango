import type { NangoModelField } from '@nangohq/types';
import type * as z from 'zod';

export function zodToNangoModelField(name: string, schema: z.core.$ZodType): NangoModelField {
    const optional = (schema as z.ZodType).safeParse(undefined).success;

    if (isZodObject(schema)) {
        const values: NangoModelField['value'] = [];
        for (const [key, value] of Object.entries(schema.shape)) {
            values.push(zodToNangoModelField(key, value as z.core.$ZodType));
        }
        return { name, value: values, optional };
    } else if (isZodString(schema)) {
        return { name, value: 'string', tsType: true, optional };
    } else if (isZodLiteral(schema)) {
        if (schema.def.values.length > 1) {
            const values: NangoModelField['value'] = [];
            for (const [key, value] of Object.entries(schema.def.values)) {
                values.push({ name: key.toString(), value: value as string });
            }
            return { name, value: values, optional, union: true };
        }
        return { name, value: schema.def.values[0] as string, optional };
    } else if (isZodNumber(schema)) {
        return { name, value: 'number', tsType: true, optional };
    } else if (isZodBoolean(schema)) {
        return { name, value: 'boolean', tsType: true, optional };
    } else if (isZodNull(schema)) {
        return { name, value: null, tsType: true, optional };
    } else if (isZodNullable(schema)) {
        return { ...zodToNangoModelField(name, schema.def.innerType), optional };
    } else if (isZodEnum(schema)) {
        const values: NangoModelField['value'] = [];
        let i = 0;
        for (const value of Object.values(schema.def.entries)) {
            values.push({ name: i.toString(), value: value as string });
            i++;
        }
        return { name, value: values, optional, union: true };
    } else if (isZodAny(schema)) {
        return { name, value: 'any', tsType: true, optional };
    } else if (isZodDate(schema)) {
        return { name, value: 'Date', tsType: true, optional };
    } else if (isZodRecord(schema)) {
        return { name, value: [{ ...zodToNangoModelField('__string', schema.def.valueType), dynamic: true }], optional };
    } else if (isZodArray(schema)) {
        // console.log('array', schema.def);
        const value = zodToNangoModelField('0', schema.def.element);
        if (isZodObject(schema.def.element)) {
            return { name, value: [value], array: true, optional };
        }
        return { name, value: value.value, tsType: true, array: true, optional };
    } else if (isZodUnion(schema) || isZodDiscriminatedUnion(schema)) {
        const values: NangoModelField['value'] = [];

        for (const [key, value] of Object.entries(schema._zod.def.options)) {
            values.push(zodToNangoModelField(key, value));
        }
        return { name, value: values, tsType: true, union: true, optional };
    } else if (isZodNever(schema)) {
        return { name, value: 'never', tsType: true, optional };
    } else if (isZodVoid(schema)) {
        return { name, value: 'void', tsType: true }; // No optional on purpose because void | undefined is not valid
    } else if (isZodOptional(schema)) {
        return { ...zodToNangoModelField(name, schema.def.innerType), optional };
    } else if (isZodUndefined(schema)) {
        throw new Error('z.undefined() is not supported, please use z.null() or z.optional() instead');
    } else if (isZodUnknown(schema)) {
        return { name, value: 'unknown', tsType: true, optional };
    } else if (isZodBigInt(schema)) {
        return { name, value: 'bigint', tsType: true, optional };
    } else if (isZodEmail(schema)) {
        // Not supported yet by "ts-json-schema-generator" (2.4.0)
        // return { name, value: 'email', tsType: true, optional };
        throw new Error(`z.email() is not supported, please use z.string() instead`);
    } else if (isZodUrl(schema)) {
        // Not supported yet by "ts-json-schema-generator" (2.4.0)
        // return { name, value: 'url', tsType: true, optional };
        throw new Error(`z.url() is not supported, please use z.string() instead`);
    } else if (isZodTuple(schema)) {
        // const values: NangoModelField['value'] = [];

        // for (const [key, value] of Object.entries(schema._zod.def.items)) {
        //     values.push(zodToNangoModelField(key, value));
        // }
        // return { name, value: values, tsType: true, array: true, optional };

        throw new Error(`z.tuple() is not supported, please use z.array() instead`);
    } else {
        throw new Error(`field "${name}" contains an unsupported Zod type, please change or reach out to Nango support, ${JSON.stringify(schema)}`);
    }
}

// We are using type guards because instanceof does not work
// the files are compiled and the zod version loaded by the scripts is the not the same
// (at least that's my interpretation, as it works in unit test)

function isZodObject(schema: z.core.$ZodType): schema is z.ZodObject {
    return schema.constructor.name === 'ZodObject';
}

function isZodString(schema: z.core.$ZodType): schema is z.ZodString {
    return schema.constructor.name === 'ZodString';
}

function isZodLiteral(schema: z.core.$ZodType): schema is z.ZodLiteral {
    return schema.constructor.name === 'ZodLiteral';
}

function isZodNumber(schema: z.core.$ZodType): schema is z.ZodNumber {
    return schema.constructor.name === 'ZodNumber';
}

function isZodBoolean(schema: z.core.$ZodType): schema is z.ZodBoolean {
    return schema.constructor.name === 'ZodBoolean';
}

function isZodNull(schema: z.core.$ZodType): schema is z.ZodNull {
    return schema.constructor.name === 'ZodNull';
}

function isZodEnum(schema: z.core.$ZodType): schema is z.ZodEnum {
    return schema.constructor.name === 'ZodEnum';
}

function isZodArray(schema: z.core.$ZodType): schema is z.ZodArray {
    return schema.constructor.name === 'ZodArray';
}

function isZodUnion(schema: z.core.$ZodType): schema is z.ZodUnion {
    return schema.constructor.name === 'ZodUnion';
}

function isZodAny(schema: z.core.$ZodType): schema is z.ZodAny {
    return schema.constructor.name === 'ZodAny';
}

function isZodRecord(schema: z.core.$ZodType): schema is z.ZodRecord {
    return schema.constructor.name === 'ZodRecord';
}

function isZodDate(schema: z.core.$ZodType): schema is z.ZodDate {
    return schema.constructor.name === 'ZodDate';
}

function isZodNever(schema: z.core.$ZodType): schema is z.ZodNever {
    return schema.constructor.name === 'ZodNever';
}

function isZodVoid(schema: z.core.$ZodType): schema is z.ZodVoid {
    return schema.constructor.name === 'ZodVoid';
}

function isZodOptional(schema: z.core.$ZodType): schema is z.ZodOptional {
    return schema.constructor.name === 'ZodOptional';
}

function isZodNullable(schema: z.core.$ZodType): schema is z.ZodNullable {
    return schema.constructor.name === 'ZodNullable';
}

function isZodUndefined(schema: z.core.$ZodType): schema is z.ZodUndefined {
    return schema.constructor.name === 'ZodUndefined';
}

function isZodUnknown(schema: z.core.$ZodType): schema is z.ZodUnknown {
    return schema.constructor.name === 'ZodUnknown';
}

function isZodDiscriminatedUnion(schema: z.core.$ZodType): schema is z.ZodDiscriminatedUnion {
    return schema.constructor.name === 'ZodDiscriminatedUnion';
}

function isZodBigInt(schema: z.core.$ZodType): schema is z.ZodBigInt {
    return schema.constructor.name === 'ZodBigInt';
}

function isZodEmail(schema: z.core.$ZodType): schema is z.ZodEmail {
    return schema.constructor.name === 'ZodEmail';
}

function isZodUrl(schema: z.core.$ZodType): schema is z.ZodURL {
    return schema.constructor.name === 'ZodURL';
}

function isZodTuple(schema: z.core.$ZodType): schema is z.ZodTuple {
    return schema.constructor.name === 'ZodTuple';
}
