import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@nangohq/design-system';

import { isAnyOfSchema, isArraySchema, isObjectSchema, isOneOfSchema, typeToString } from './utils';

import type { JSONSchema7, JSONSchema7Type } from 'json-schema';

const MAX_DEPTH = 8;

export const JsonSchemaTopLevelObject: React.FC<{ schema: JSONSchema7 }> = ({ schema }) => {
    if (!isObjectSchema(schema)) {
        return (
            <div className="flex flex-col gap-2 p-2">
                <span>
                    <Badge>{typeToString(schema, false)}</Badge>
                </span>
                {schema.description && <p className="type-label-xs text-text-secondary">{schema.description}</p>}
            </div>
        );
    }

    return <FieldList schema={schema} depth={0} />;
};

const FieldList: React.FC<{ schema: JSONSchema7; depth: number }> = ({ schema, depth }) => {
    const { properties, required, additionalProperties } = schema;

    return (
        <div className="flex flex-col">
            {Object.entries(properties ?? {}).map(([name, property]) => (
                <Field key={name} name={name} schema={property as JSONSchema7} isRequired={required?.includes(name) ?? false} depth={depth} />
            ))}
            {additionalProperties && (
                <Field name="{key}" schema={typeof additionalProperties === 'object' ? additionalProperties : {}} isRequired={false} depth={depth} />
            )}
        </div>
    );
};

const Field: React.FC<{ name: string; schema: JSONSchema7; isRequired: boolean; depth: number }> = ({ name, schema, isRequired, depth }) => {
    const { itemSchema, arrayDepth } = unwrapArrays(schema);
    const description = schema.description ?? itemSchema.description;
    const defaultValue = formatDefault(schema.default ?? itemSchema.default);
    const enumValues = itemSchema.enum;
    const type = formatType(itemSchema, arrayDepth);
    const nested = depth < MAX_DEPTH ? getNestedSchemas(itemSchema) : [];

    return (
        <div className="flex flex-col gap-2 border-b-[0.5px] border-border-default p-2 last:border-b-0">
            <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 break-all type-code-medium-xs text-text-default">{name}</span>
                <span className="flex shrink-0 items-center gap-1">
                    <Badge>{type}</Badge>
                    {isRequired && <Badge variant="danger">required</Badge>}
                </span>
            </div>
            {description && <p className="type-label-xs text-text-secondary">{description}</p>}
            {enumValues && enumValues.length > 0 && <ValueLine label="One of">{enumValues.map((value) => JSON.stringify(value)).join(', ')}</ValueLine>}
            {defaultValue && <ValueLine label="Default">{defaultValue}</ValueLine>}
            {nested.length > 0 && <NestedFields schemas={nested} isVariants={isOneOfSchema(itemSchema) || isAnyOfSchema(itemSchema)} depth={depth + 1} />}
        </div>
    );
};

const ValueLine: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <p className="type-label-xs text-text-secondary">
        {label}: <span className="type-code-regular-xxs text-text-default">{children}</span>
    </p>
);

const NestedFields: React.FC<{ schemas: JSONSchema7[]; isVariants: boolean; depth: number }> = ({ schemas, isVariants, depth }) => {
    const fieldCount = schemas.reduce((count, schema) => count + Object.keys(schema.properties ?? {}).length + (schema.additionalProperties ? 1 : 0), 0);
    const label = isVariants ? `${schemas.length} ${schemas.length === 1 ? 'variant' : 'variants'}` : `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`;

    return (
        <Collapsible.Root>
            <Collapsible.Trigger className="group inline-flex cursor-pointer items-center gap-1 rounded-ds-xs type-text-medium-xs text-text-secondary transition-colors hover:text-text-default focus-default">
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                {label}
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-1 ml-1.5 border-l-[0.5px] border-border-default pl-2">
                {isVariants ? (
                    schemas.map((schema, index) => (
                        <div key={index} className="flex flex-col pt-2">
                            <span className="px-2 type-label-xxs uppercase text-text-muted">Variant {index + 1}</span>
                            <FieldList schema={schema} depth={depth} />
                        </div>
                    ))
                ) : (
                    <FieldList schema={schemas[0] ?? {}} depth={depth} />
                )}
            </Collapsible.Content>
        </Collapsible.Root>
    );
};

function unwrapArrays(schema: JSONSchema7): { itemSchema: JSONSchema7; arrayDepth: number } {
    let itemSchema = schema;
    let arrayDepth = 0;
    while (isArraySchema(itemSchema)) {
        const { items } = itemSchema;
        itemSchema = items && typeof items === 'object' && !Array.isArray(items) ? items : {};
        arrayDepth++;
    }
    return { itemSchema, arrayDepth };
}

function formatType(schema: JSONSchema7, arrayDepth: number): string {
    const baseType = schema.enum ? getEnumType(schema) : schema.type || schema.oneOf || schema.anyOf ? typeToString(schema, false) : 'any';
    if (arrayDepth === 0) {
        return baseType;
    }
    return `${baseType.includes(' | ') ? `(${baseType})` : baseType}${'[]'.repeat(arrayDepth)}`;
}

function getEnumType(schema: JSONSchema7): string {
    if (schema.type) {
        return Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
    }
    const valueTypes = new Set((schema.enum ?? []).map((value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)));
    return valueTypes.size > 0 ? [...valueTypes].join(' | ') : 'any';
}

function getNestedSchemas(schema: JSONSchema7): JSONSchema7[] {
    if (isOneOfSchema(schema) || isAnyOfSchema(schema)) {
        return ((schema.oneOf ?? schema.anyOf ?? []) as JSONSchema7[]).filter((option) => isObjectSchema(option) && hasFields(option));
    }
    return isObjectSchema(schema) && hasFields(schema) ? [schema] : [];
}

function hasFields(schema: JSONSchema7): boolean {
    return Object.keys(schema.properties ?? {}).length > 0 || Boolean(schema.additionalProperties);
}

function formatDefault(value: JSONSchema7Type | undefined): string | null {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
}
