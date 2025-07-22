import type { JSONSchema7 } from 'json-schema';

export function getSyncResponse(model: JSONSchema7) {
    const record = propertiesToTypescriptExamples(model).join('\n      ');
    return [
        '{',
        '  "records": [',
        '    {',
        `      ${record}`,
        '      "_nango_metadata": {',
        '        "deleted_at": "date | null",',
        '        "last_action": "ADDED | UPDATED | DELETED",',
        '        "first_seen_at": "date",',
        '        "cursor": "string",',
        '        "last_modified_at": "date"',
        '      }',
        '    }',
        '  ],',
        '  "next_cursor": "string"',
        '}'
    ].join('\n');
}

export function modelToString(schema: JSONSchema7, format: boolean = false): string {
    if (schema.type !== 'object') {
        return '';
    }

    const props = propertiesToTypescriptExamples(schema);

    // We have a format parameter because generally we might want the top-level object to be formatted, but not nested objects
    if (format) {
        return ['{', indentLines(props.join(',\n')), '}'].join(`\n`);
    }

    return [`{ `, props.join(', '), ` }`].join('');
}

const typeToTypescript: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    null: 'null'
};

/**
 * Converts properties of a json schema to typescript examples - Including prop names
 * @example ["aString": "<string>", "aNumber": "<number>", "aBoolean": "<boolean>"]
 */
function propertiesToTypescriptExamples(schema: JSONSchema7): string[] {
    const props: string[] = [];

    if (schema.type !== 'object') {
        return props;
    }

    if (schema.additionalProperties) {
        props.push(`[key: string]: ${propertyToTypescriptExample(schema.additionalProperties as JSONSchema7)}`);
    }

    for (const [key, value] of Object.entries(schema.properties || {})) {
        const isRequired = schema.required?.includes(key);
        const rawTypescriptValue = propertyToTypescriptExample(value as JSONSchema7);
        // Wrap value in quotes unless it's an object type
        const finalTypescriptValue = typeof value === 'object' && 'type' in value && value.type === 'object' ? rawTypescriptValue : `"<${rawTypescriptValue}>"`;
        props.push(`"${key}"${isRequired ? '' : '?'}: ${finalTypescriptValue}`);
    }

    return props;
}

/**
 * Converts a json schema property to a typescript example
 * @example "string"
 * @example "{ aString: "<string>", aNumber: "<number>" }"
 */
export function propertyToTypescriptExample(schema: JSONSchema7): string {
    if (schema.$ref) {
        // Ref format is: #/definitions/ModelName
        return schema.$ref.split('/').pop() || 'any';
    }

    if (Array.isArray(schema.type)) {
        return schema.type.map((t) => typeToTypescript[t]).join(' | ');
    }

    const complexModel = schema.oneOf || schema.anyOf;
    if (complexModel) {
        return complexModel.map((m) => propertyToTypescriptExample(m as JSONSchema7)).join(' | ');
    }

    if (schema.type === 'object') {
        return modelToString(schema);
    }

    if (schema.type === 'array') {
        return `${propertyToTypescriptExample(schema.items as JSONSchema7)}[]`;
    }

    if (!schema.type) {
        return 'any';
    }

    // string, number, boolean
    return typeToTypescript[schema.type];
}

export function indentLines(code: string, tabs: number = 1) {
    // Indent first line then every new line
    return `    ${code.replaceAll('\n', `\n${'    '.repeat(tabs)}`)}`;
}

const regQuote = /^[a-zA-Z0-9_]+$/;
export function shouldQuote(name: string): boolean {
    return !regQuote.test(name);
}
