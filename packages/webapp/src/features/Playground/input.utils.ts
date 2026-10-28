import type { InputField, PlaygroundInput } from './types';
import type { PlaygroundFunctionRow } from './usePlaygroundFunctions';
import type { JSONSchema7, JSONSchema7TypeName } from 'json-schema';

export function getPlaygroundInput(fn: PlaygroundFunctionRow | undefined): PlaygroundInput {
    const schema = getPlaygroundInputSchema(fn);
    const root = fn?.type === 'tool' ? fn.input_json_schema : fn?.json_schema;
    if (schema === null) return { kind: 'none' };
    if (fn?.type !== 'tool' || (!schema.anyOf && !schema.oneOf && schema.properties && (!schema.type || schema.type === 'object'))) {
        return { kind: 'object', fields: getInputFields(schema, root) };
    }
    const field = getInputField({ name: 'input', schema, required: true, root: root ?? schema, ancestors: new Set() });
    return field ? { kind: 'value', field } : { kind: 'none' };
}

export function getPlaygroundInputFields(input: PlaygroundInput): InputField[] {
    if (input.kind === 'object') return input.fields;
    if (input.kind === 'value') return [input.field];
    return [];
}

export function getPlaygroundInputSchema(fn: PlaygroundFunctionRow | undefined): JSONSchema7 | null {
    if (!fn) return null;
    if (fn.type !== 'tool') {
        const definition = fn.input ? (fn.json_schema?.definitions?.[fn.input] as JSONSchema7 | undefined) : undefined;
        if (!definition || !fn.json_schema) {
            // Legacy actions always receive an object, even without an input model.
            return fn.type === 'action' ? { type: 'object', properties: {} } : null;
        }
        return resolveSchemaReference(definition, fn.json_schema);
    }
    const schema = fn.input_json_schema;
    if (!schema) return null;
    return resolveSchemaReference(schema);
}

function resolveSchemaReference(schema: JSONSchema7, root: JSONSchema7 = schema): JSONSchema7 {
    if (!schema.$ref) return schema;
    // Resolve the root pointer; keep definitions available for nested references.
    let resolved: unknown = schema;
    const visited = new Set<string>();
    while (resolved && typeof resolved === 'object' && '$ref' in resolved && typeof resolved.$ref === 'string') {
        const ref = resolved.$ref;
        if (!ref.startsWith('#/') || visited.has(ref)) return schema;
        visited.add(ref);
        resolved = root;
        for (const part of ref.slice(2).split('/')) {
            if (!resolved || typeof resolved !== 'object') return schema;
            resolved = (resolved as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
        }
    }
    return resolved && typeof resolved === 'object'
        ? { ...schema, $ref: undefined, ...resolved, ...(schema.description !== undefined && { description: schema.description }) }
        : schema;
}

export function getInputFields(jsonSchema: JSONSchema7 | null | undefined, root: JSONSchema7 | null | undefined = jsonSchema): InputField[] {
    if (!jsonSchema || typeof jsonSchema !== 'object') return [];
    const props = jsonSchema.properties;
    if (!props) return [];
    const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];
    return Object.entries(props).flatMap(([name, property]): InputField[] => {
        const field = getInputField({ name, schema: property, required: required.includes(name), root: root ?? jsonSchema, ancestors: new Set() });
        return field ? [field] : [];
    });
}

function getInputField({
    name,
    schema,
    required,
    root,
    ancestors
}: {
    name: string;
    schema: JSONSchema7 | boolean;
    required: boolean;
    root: JSONSchema7;
    ancestors: Set<JSONSchema7>;
}): InputField | null {
    if (schema === false) return null;
    if (schema === true || ancestors.has(schema)) return { name, type: 'string', description: undefined, required };
    const nextAncestors = new Set(ancestors).add(schema);
    const def = resolveSchemaReference(schema, root);
    const type = Array.isArray(def.type) ? (def.type[0] ?? 'string') : def.type || 'string';
    const field: InputField = { name, type, description: def.description, required };
    const enumTypes = !def.type
        ? def.enum?.map((value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : (typeof value as JSONSchema7TypeName)))
        : undefined;
    const branches =
        def.anyOf ??
        def.oneOf ??
        (Array.isArray(def.type) ? def.type.map((type) => ({ ...def, type })) : undefined) ??
        (enumTypes && [...new Set(enumTypes)].map((type) => ({ type, enum: def.enum })));
    if (branches) {
        const variants = branches.flatMap((branch) => {
            const variant = getInputField({ name, schema: branch, required, root, ancestors: nextAncestors });
            return variant ? [variant] : [];
        });
        if (variants.length > 0) {
            field.variants = variants;
            field.type = [...new Set(variants.map((variant) => variant.type))].join(' | ');
        }
    }
    if (def.minLength != null) field.minLength = def.minLength;
    if (def.maxLength != null) field.maxLength = def.maxLength;
    if (def.pattern != null) field.pattern = def.pattern;
    if (typeof def.minimum === 'number') field.minimum = def.minimum;
    if (typeof def.maximum === 'number') field.maximum = def.maximum;
    if (typeof def.exclusiveMinimum === 'number') field.exclusiveMinimum = def.exclusiveMinimum;
    if (typeof def.exclusiveMaximum === 'number') field.exclusiveMaximum = def.exclusiveMaximum;
    if (Array.isArray(def.enum)) field.enum = def.enum;
    return field;
}
