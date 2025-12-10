import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

import { isArraySchema, isObjectSchema, isPrimitiveSchema } from './utils';
import { CatalogBadge } from '../CatalogBadge';
import { IntegrationsBadge } from '../IntegrationsBadge';

import type { JSONSchema7 } from 'json-schema';

export const JsonSchemaTopLevelObject: React.FC<{ schema: JSONSchema7 }> = ({ schema }) => {
    if (!isObjectSchema(schema) || !schema.properties) {
        throw new Error('Expected object schema.');
    }

    return (
        <div className="flex flex-col gap-1.5">
            {Object.entries(schema.properties || {}).map(([name, property]) => (
                <TopLevelWrapper key={name}>
                    <JsonSchema name={name} schema={property as JSONSchema7} />
                </TopLevelWrapper>
            ))}
        </div>
    );
};

const JsonSchema: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    if (isPrimitiveSchema(schema)) {
        return <JsonSchemaPrimitive name={name} schema={schema} isArray={isArray} />;
    }

    if (isObjectSchema(schema)) {
        return <JsonSchemaObject name={name} schema={schema} isArray={isArray} />;
    }

    if (isArraySchema(schema)) {
        return <JsonSchema name={name} schema={schema.items as JSONSchema7} isArray={true} />;
    }

    return <p className="text-text-tertiary text-body-small-regular">Not implemented: {schema.type}</p>;
};

const JsonSchemaGenericInfo: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    const type = typeof schema.type === 'string' ? `${schema.type}${isArray ? '[]' : ''}` : '';
    const defaultString = typeof schema.default === 'string' || typeof schema.default === 'number' ? String(schema.default) : '';

    return (
        <div className="w-full flex flex-row items-center justify-between gap-1.5">
            <div className="flex flex-col gap-1.5">
                <span className="text-text-primary text-body-small-semi">{name}</span>
                {schema.description && <p className="text-text-tertiary text-body-small-medium">{schema.description}</p>}
                {defaultString && <IntegrationsBadge label="Default">{defaultString}</IntegrationsBadge>}
            </div>
            <CatalogBadge>{type}</CatalogBadge>
        </div>
    );
};

const JsonSchemaPrimitive: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    if (!isPrimitiveSchema(schema) || typeof schema.type !== 'string') {
        throw new Error('Expected primitive schema.');
    }

    return <JsonSchemaGenericInfo name={name} schema={schema} isArray={isArray} />;
};

const JsonSchemaObject: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }

    const properties = schema.properties || {};
    const propertyCount = Object.keys(properties).length;

    return (
        <div className="flex flex-col gap-3">
            <JsonSchemaGenericInfo name={name} schema={schema} isArray={isArray} />
            <Collapsible.Root>
                <Collapsible.Trigger disabled={propertyCount === 0} asChild>
                    <div className="group w-full p-4 flex flex-row items-center justify-between bg-bg-surface border border-transparent rounded focus-default cursor-pointer transition-all hover:bg-bg-elevated hover:border-bg-surface data-[state=open]:bg-bg-elevated data-[state=open]:border data-[state=open]:border-b-0 data-[state=open]:rounded-b-none data-[state=open]:border-bg-surface">
                        <span className="text-text-primary text-body-small-semi grow">Properties {'{}'}</span>
                        <div className="inline-flex gap-1 items-center">
                            <span className="text-text-primary text-body-small-medium">{propertyCount}</span>
                            <ChevronDown className="size-4 text-icon-primary group-data-[state=open]:rotate-180" />
                        </div>
                    </div>
                </Collapsible.Trigger>
                <Collapsible.Content asChild>
                    <div className="p-4 pt-0 rounded-b border border-t-0 border-bg-surface">
                        <div className="flex flex-col rounded border border-bg-surface">
                            {Object.entries(properties).map(([name, property]) => (
                                <div key={name} className="p-4 border-b border-bg-surface last:border-b-0">
                                    <JsonSchema name={name} schema={property as JSONSchema7} isArray={isArray} />
                                </div>
                            ))}
                        </div>
                    </div>
                </Collapsible.Content>
            </Collapsible.Root>
        </div>
    );
};

const TopLevelWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="p-4 bg-bg-elevated rounded flex flex-col gap-3">{children}</div>;
};
