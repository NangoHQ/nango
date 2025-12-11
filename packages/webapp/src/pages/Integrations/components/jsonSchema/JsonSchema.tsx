import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

import { isAnyOfSchema, isArraySchema, isObjectSchema, isOneOfSchema, typeToString } from './utils';
import { CatalogBadge } from '../CatalogBadge';
import { IntegrationsBadge } from '../IntegrationsBadge';

import type { JSONSchema7, JSONSchema7Type } from 'json-schema';

export const JsonSchemaTopLevelObject: React.FC<{ schema: JSONSchema7 }> = ({ schema }) => {
    if (!isObjectSchema(schema) || !schema.properties) {
        throw new Error('Expected object schema.');
    }

    return (
        <div className="flex flex-col gap-1.5">
            {Object.entries(schema.properties || {}).map(([name, property]) => (
                <TopLevelWrapper key={name}>
                    <JsonSchema name={name} schema={property as JSONSchema7} isRequired={schema.required?.includes(name)} />
                </TopLevelWrapper>
            ))}
        </div>
    );
};

const JsonSchema: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean; isRequired?: boolean }> = ({
    name,
    schema,
    isArray = false,
    isRequired = false
}) => {
    if (isOneOfSchema(schema) || isAnyOfSchema(schema)) {
        return <JsonSchemaOneOf name={name} schema={schema} isArray={isArray} />;
    }

    if (isObjectSchema(schema)) {
        return <JsonSchemaObject name={name} schema={schema} isArray={isArray} />;
    }

    if (isArraySchema(schema)) {
        return <JsonSchema name={name} schema={schema.items as JSONSchema7} isArray={true} />;
    }

    return (
        <JsonSchemaGenericInfo
            name={name}
            type={typeToString(schema, isArray)}
            description={schema.description}
            isRequired={isRequired}
            defaultValue={schema.default}
        />
    );
};

const JsonSchemaGenericInfo: React.FC<{
    name: string;
    description?: string | undefined;
    type: string;
    isRequired?: boolean;
    defaultValue?: JSONSchema7Type | undefined;
}> = ({ name, description, type, isRequired, defaultValue }) => {
    const defaultString =
        typeof defaultValue === 'string' || typeof defaultValue === 'number' || typeof defaultValue === 'boolean' ? String(defaultValue) : null;
    return (
        <div className="w-full flex flex-row items-center justify-between gap-1.5">
            <div className="flex flex-col gap-1.5">
                <div className="flex flex-row gap-1">
                    <span className="text-text-primary text-body-small-semi">{name}</span>{' '}
                    <span className="text-feedback-error-fg text-body-extra-small-semi">{isRequired ? '*' : ''}</span>
                </div>
                {description && <p className="text-text-tertiary text-body-small-medium">{description}</p>}
                {defaultString && <IntegrationsBadge label="Default">{defaultString}</IntegrationsBadge>}
            </div>
            <CatalogBadge className="[.group\/collapsible_&]:bg-bg-subtle">{type}</CatalogBadge>
        </div>
    );
};
const JsonSchemaObject: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }

    return (
        <div className="flex flex-col gap-3">
            <JsonSchemaGenericInfo name={name} type={typeToString(schema, isArray)} description={schema.description} />
            <CollapsibleProperties schema={schema} />
        </div>
    );
};

const JsonSchemaOneOf: React.FC<{ name: string; schema: JSONSchema7; isArray?: boolean }> = ({ name, schema, isArray = false }) => {
    if (!isOneOfSchema(schema) && !isAnyOfSchema(schema)) {
        throw new Error('Expected oneOf or anyOf schema.');
    }

    const schemas = schema.oneOf || schema.anyOf || [];

    return (
        <div className="flex flex-col gap-3">
            <JsonSchemaGenericInfo name={name} type={typeToString(schema, isArray)} description={schema.description} defaultValue={schema.default} />
            <div className="flex flex-col gap-3">
                {schemas.map((s, index) => (
                    <>
                        <CollapsibleProperties key={index} schema={s as JSONSchema7} />
                        {/* <p className="text-center text-text-secondary text-body-extra-small-semi last:hidden">OR</p> */}
                    </>
                ))}
            </div>
        </div>
    );
};

const CollapsibleProperties: React.FC<{ schema: JSONSchema7 }> = ({ schema }) => {
    if (!isObjectSchema(schema)) {
        throw new Error('Expected object schema.');
    }
    const { properties, required } = schema;

    const propertyCount = properties ? Object.keys(properties).length : 0;
    return (
        <Collapsible.Root disabled={propertyCount === 0}>
            <Collapsible.Trigger asChild>
                <div className="group w-full p-4 flex flex-row items-center justify-between bg-bg-surface border border-transparent rounded focus-default cursor-pointer transition-all hover:border-border-default data-[state=open]:border data-[state=open]:border-b-0 data-[state=open]:rounded-b-none data-[state=open]:border-border-muted">
                    <span className="text-text-primary text-body-small-semi grow">Properties {'{}'}</span>
                    <div className="inline-flex gap-1 items-center">
                        <span className="text-text-primary text-body-small-medium">{propertyCount}</span>
                        <ChevronDown className="size-4 text-icon-primary group-data-[state=open]:rotate-180" />
                    </div>
                </div>
            </Collapsible.Trigger>
            <Collapsible.Content asChild>
                <div className="group/collapsible p-4 pt-0 rounded-b bg-bg-surface border border-t-0 border-border-muted">
                    {Object.entries(properties || {}).map(([name, property]) => (
                        <div key={name} className="p-4 border-b border-border-muted last:border-b-0">
                            <JsonSchema name={name} schema={property as JSONSchema7} isRequired={required?.includes(name)} />
                        </div>
                    ))}
                </div>
            </Collapsible.Content>
        </Collapsible.Root>
    );
};

const TopLevelWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <div className="p-4 bg-bg-elevated rounded flex flex-col gap-3">{children}</div>;
};
